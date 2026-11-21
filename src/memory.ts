import type { Memory, MemoryType } from './memory-store.js';

/**
 * 结构化记忆的纯函数：提取（从回复里解析标记）+ 召回（按相关性检索）。
 */

/** 记忆标记：一行 `记忆|类型|内容`，类型 ∈ lesson/decision/fact。支持全角竖线｜。 */
const MEMORY_MARKER_RE = /^记忆[|｜](lesson|decision|fact)[|｜](.+)$/i;

export interface ExtractedMemory {
  type: MemoryType;
  text: string;
}

/** 从 agent 回复里提取"记忆|类型|内容"标记的行。 */
export function extractMemories(text: string): ExtractedMemory[] {
  if (!text) return [];
  const out: ExtractedMemory[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(MEMORY_MARKER_RE);
    if (!m) continue;
    const type = (m[1] ?? '').toLowerCase() as MemoryType;
    const content = (m[2] ?? '').trim();
    if (!content) continue;
    out.push({ type, text: content });
  }
  return out;
}

/** 从查询里提取关键词（按非字词字符切分，中英文都适用）。 */
export function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** 按关键词命中数召回相关记忆，返回最相关的 limit 条（命中 0 的不返回）。 */
export function recall(query: string, memories: readonly Memory[], limit = 3): Memory[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  return memories
    .map((memory) => {
      const haystack = `${memory.type} ${memory.text}`.toLowerCase();
      const score = keywords.reduce((acc, kw) => acc + (haystack.includes(kw) ? 1 : 0), 0);
      return { memory, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.memory);
}

/** 余弦相似度（两向量同维才可比；空向量或维度不一致返回 0）。 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RecallOptions {
  limit?: number;
  /** 语义召回的最低余弦相似度（低于此不返回）。默认 0.4，按 embedding-2 的分布标定：相关 ~0.42+，无关 ~0.35-。 */
  semanticThreshold?: number;
}

/**
 * 混合召回：关键词命中优先（精确、专有名词），语义相似（向量）兜底补语义相近的。
 * queryVector 为空（embedding 不可用）时退化为纯关键词召回。
 */
export function hybridRecall(
  query: string,
  queryVector: readonly number[],
  memories: readonly Memory[],
  options: RecallOptions = {},
): Memory[] {
  const limit = options.limit ?? 3;
  const threshold = options.semanticThreshold ?? 0.4;

  // 关键词命中（id -> 命中数）
  const keywordHits = new Map<string, number>();
  const keywords = extractKeywords(query);
  for (const memory of memories) {
    if (keywords.length === 0) break;
    const haystack = `${memory.type} ${memory.text}`.toLowerCase();
    const score = keywords.reduce((acc, kw) => acc + (haystack.includes(kw) ? 1 : 0), 0);
    if (score > 0) keywordHits.set(memory.id, score);
  }

  // 语义命中（按相似度降序，过滤低于阈值 / 无向量 / 维度不符的）
  const semantic = memories
    .filter((m) => m.vector && m.vector.length === queryVector.length)
    .map((m) => ({ memory: m, score: cosineSimilarity(queryVector, m.vector as number[]) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);

  // 合并去重：关键词命中先排（按命中数），语义命中补空缺
  const byId = new Map(memories.map((m) => [m.id, m]));
  const out: Memory[] = [];
  const seen = new Set<string>();

  for (const [id] of [...keywordHits.entries()].sort((a, b) => b[1] - a[1])) {
    const memory = byId.get(id);
    if (memory && !seen.has(memory.id)) {
      out.push(memory);
      seen.add(memory.id);
    }
  }
  for (const { memory } of semantic) {
    if (!seen.has(memory.id)) {
      out.push(memory);
      seen.add(memory.id);
    }
  }

  return out.slice(0, limit);
}

const TYPE_LABELS: Record<MemoryType, string> = {
  lesson: '教训',
  decision: '决策',
  fact: '事实',
};

/** 记忆类型的展示标签。 */
export function memoryTypeLabel(type: MemoryType): string {
  return TYPE_LABELS[type] ?? type;
}
