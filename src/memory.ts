import type { Memory, MemoryType } from './memory-store.js';

/**
 * 结构化记忆的纯函数：提取（从回复里解析标记）+ 召回相关的纯计算（分词 / 余弦 / 合并）。
 * 真正的检索（FTS5 + 向量）在 MemoryStore 里；这里只留无副作用的纯逻辑，方便单测。
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

/**
 * 混合召回的合并：关键词命中优先（精确），语义命中补空缺（兜底），按 id 去重、截断到 limit。
 */
export function mergeHybrid(
  keywordHits: readonly Memory[],
  semanticHits: readonly Memory[],
  limit = 3,
): Memory[] {
  const out: Memory[] = [];
  const seen = new Set<string>();
  for (const memory of keywordHits) {
    if (!seen.has(memory.id)) {
      out.push(memory);
      seen.add(memory.id);
    }
  }
  for (const memory of semanticHits) {
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
