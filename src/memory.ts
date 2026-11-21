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

const TYPE_LABELS: Record<MemoryType, string> = {
  lesson: '教训',
  decision: '决策',
  fact: '事实',
};

/** 记忆类型的展示标签。 */
export function memoryTypeLabel(type: MemoryType): string {
  return TYPE_LABELS[type] ?? type;
}
