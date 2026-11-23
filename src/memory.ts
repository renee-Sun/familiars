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

/** 按 id 去重合并多组记忆（保序，先出现者优先）。 */
export function unionById(...arrays: readonly Memory[][]): Memory[] {
  const seen = new Set<string>();
  const out: Memory[] = [];
  for (const arr of arrays) {
    for (const memory of arr) {
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        out.push(memory);
      }
    }
  }
  return out;
}

/** 时间衰减因子（Clowder 的 fractional decay：factor = 半衰期 / (半衰期 + 年龄天数)）。 */
export function computeRecencyFactor(createdAt: number, now: number, halfLifeDays = 45): number {
  if (halfLifeDays <= 0) return 1;
  const ageDays = Math.max(0, (now - createdAt) / 86_400_000);
  return halfLifeDays / (halfLifeDays + ageDays);
}

/** Jaccard 相似度（MMR 的"相似"度量：比两个关键词集合的重合度）。 */
export function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const k of setA) if (setB.has(k)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface ScoredMemory {
  memory: Memory;
  score: number;
}

/**
 * MMR 多样性重排（Carbonell & Goldstein 1998，Clowder 同款）：
 * 在相关性（score）和多样性（与已选记忆的 Jaccard 相似度）之间取平衡，避免召回一堆内容重复的记忆。
 * 候选不足 3×limit 时直接取分数最高的前 limit 条（小规模没必要做 MMR）。
 */
export function applyMMR(items: readonly ScoredMemory[], limit: number, lambda = 0.7): Memory[] {
  if (items.length === 0) return [];
  if (items.length < 3 * limit) return items.slice(0, limit).map((i) => i.memory);

  const keywordCache = new Map<string, string[]>();
  const keywordsOf = (memory: Memory): string[] => {
    let k = keywordCache.get(memory.id);
    if (!k) {
      k = extractKeywords(memory.text);
      keywordCache.set(memory.id, k);
    }
    return k;
  };

  const selected: ScoredMemory[] = [];
  const remaining = [...items];
  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i]!;
      const relevance = item.score;
      const maxSim = selected.length === 0
        ? 0
        : Math.max(...selected.map((s) => jaccardSimilarity(keywordsOf(item.memory), keywordsOf(s.memory))));
      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]!);
  }
  return selected.map((s) => s.memory);
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
