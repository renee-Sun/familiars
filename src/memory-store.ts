import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cosineSimilarity, extractKeywords, mergeHybrid } from './memory.js';

export type MemoryType = 'lesson' | 'decision' | 'fact';

export interface Memory {
  id: string;
  type: MemoryType;
  text: string;
  createdAt: number;
  /** 文本的 embedding 向量（BLOB 存 Float32，向量化检索用）。 */
  vector?: number[];
}

/**
 * 建表：memories 主表 + memories_fts 全文索引（FTS5 trigram）。
 * 中文用 trigram：unicode61 会把无空格中文整句当一个 token（查 2 字词全空），
 * trigram 能子串匹配，但对 <3 字的词无效——所以召回时用 LIKE 兜底短词。
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    vector BLOB
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id UNINDEXED, text, tokenize='trigram');
`;

interface Row {
  id: string;
  type: MemoryType;
  text: string;
  created_at: number;
  vector: Uint8Array | null;
}

function encodeVector(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

function decodeVector(blob: Uint8Array): number[] {
  return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
}

/** FTS5 MATCH 语法：把关键词包成引号，防特殊字符被当查询语法。 */
function quoteFts(keyword: string): string {
  return '"' + keyword.replace(/"/g, '""') + '"';
}

/**
 * MemoryStore —— 结构化记忆的 SQLite 持久化 + 检索。
 * 从 JSON 整文件读写升级到 SQLite：append 不再 O(n) 整文件重写，关键词走 FTS5 索引，
 * 向量存 BLOB 做余弦相似度召回（量再大再上 sqlite-vec 向量扩展）。
 */
export class MemoryStore {
  private db: DatabaseSync;

  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
  }

  append(type: MemoryType, text: string, vector?: number[]): Memory {
    const memory: Memory = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      text,
      createdAt: Date.now(),
    };
    if (vector) memory.vector = vector;
    this.db
      .prepare('INSERT INTO memories (id, type, text, created_at, vector) VALUES (?, ?, ?, ?, ?)')
      .run(memory.id, type, text, memory.createdAt, vector ? encodeVector(vector) : null);
    this.db.prepare('INSERT INTO memories_fts (id, text) VALUES (?, ?)').run(memory.id, text);
    return memory;
  }

  getAll(): Memory[] {
    const rows = this.db
      .prepare('SELECT id, type, text, created_at, vector FROM memories ORDER BY created_at')
      .all() as unknown as Row[];
    return rows.map((r) => this.rowToMemory(r));
  }

  /** 给已入库的记忆补向量（旧记忆回填用）。 */
  setVector(id: string, vector: number[]): void {
    this.db.prepare('UPDATE memories SET vector = ? WHERE id = ?').run(encodeVector(vector), id);
  }

  /** 还没 embedding 过的记忆（旧数据回填用）。 */
  getUnvectorized(): Memory[] {
    const rows = this.db
      .prepare('SELECT id, type, text, created_at, vector FROM memories WHERE vector IS NULL ORDER BY created_at')
      .all() as unknown as Row[];
    return rows.map((r) => this.rowToMemory(r));
  }

  clear(): void {
    this.db.exec('DELETE FROM memories; DELETE FROM memories_fts;');
  }

  close(): void {
    this.db.close();
  }

  /**
   * 关键词召回：FTS5 trigram 做主索引（英文 + ≥3 字中文子串），LIKE 兜底 <3 字的短中文词。
   * 返回按相关性排序的记忆（FTS 命中按 rank 在前，LIKE 命中断后）。
   */
  keywordSearch(query: string, limit = 3): Memory[] {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];
    const ftsKeywords = keywords.filter((k) => k.length >= 3);
    const likeKeywords = keywords.filter((k) => k.length < 3);

    const ids: string[] = [];
    if (ftsKeywords.length > 0) {
      const matchExpr = ftsKeywords.map(quoteFts).join(' OR ');
      const rows = this.db
        .prepare('SELECT id FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?')
        .all(matchExpr, limit) as { id: string }[];
      for (const r of rows) ids.push(r.id);
    }
    if (likeKeywords.length > 0) {
      const where = likeKeywords.map(() => 'text LIKE ?').join(' OR ');
      const rows = this.db
        .prepare(`SELECT id FROM memories WHERE ${where} LIMIT ?`)
        .all(...likeKeywords.map((k) => `%${k}%`), limit) as { id: string }[];
      for (const r of rows) if (!ids.includes(r.id)) ids.push(r.id);
    }

    return this.loadByIds(ids.slice(0, limit));
  }

  /**
   * 语义召回：读所有带向量的记忆，余弦相似度暴搜后按分数排序。
   * 诚实标注：这一步还是全量暴搜（无向量索引），记忆量级再上一个台阶才需要 sqlite-vec。
   */
  semanticSearch(queryVector: readonly number[], limit = 3, threshold = 0.4): Memory[] {
    if (queryVector.length === 0) return [];
    const rows = this.db
      .prepare('SELECT id, type, text, created_at, vector FROM memories WHERE vector IS NOT NULL')
      .all() as unknown as Row[];
    return rows
      .map((r) => ({
        memory: this.rowToMemory(r),
        score: cosineSimilarity(queryVector, decodeVector(r.vector as Uint8Array)),
      }))
      .filter((x) => x.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.memory);
  }

  /** 混合召回：关键词命中优先 + 语义相似兜底（mergeHybrid 合并去重）。 */
  hybridSearch(query: string, queryVector: readonly number[], limit = 3, threshold = 0.4): Memory[] {
    return mergeHybrid(this.keywordSearch(query, limit), this.semanticSearch(queryVector, limit, threshold), limit);
  }

  /** 按 id 批量加载完整记忆，保持传入顺序。 */
  private loadByIds(ids: string[]): Memory[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT id, type, text, created_at, vector FROM memories WHERE id IN (${placeholders})`)
      .all(...ids) as unknown as Row[];
    const byId = new Map(rows.map((r) => [r.id, this.rowToMemory(r)]));
    return ids.map((id) => byId.get(id)).filter((m): m is Memory => m !== undefined);
  }

  private rowToMemory(row: Row): Memory {
    const memory: Memory = { id: row.id, type: row.type, text: row.text, createdAt: row.created_at };
    if (row.vector) memory.vector = decodeVector(row.vector);
    return memory;
  }
}
