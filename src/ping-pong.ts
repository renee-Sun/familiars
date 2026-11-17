/**
 * ping-pong 连击追踪（A2A 的循环护栏）。
 *
 * 目的：精准识别"A↔B 来回踢皮球"（短文本、只转发、不干活），
 * 而"有实质工作的正常来回"（真干活 / 长讨论）不算踢皮球，连击会重置。
 */

export interface StreakEntry {
  from: string;
  to: string;
  count: number;
}

export interface StreakVerdict {
  warn: boolean;
  block: boolean;
  count: number;
}

export const PINGPONG_WARN_THRESHOLD = 2;
export const PINGPONG_BLOCK_THRESHOLD = 4;
/** 输出超过这个长度视为"实质活动"（真在干活，不算踢皮球）。 */
export const SUBSTANTIVE_OUTPUT_LEN = 200;

/** 无序对：A→B 和 B→A 算同一对。 */
export function isSamePair(entry: StreakEntry, from: string, to: string): boolean {
  return (entry.from === from && entry.to === to) || (entry.from === to && entry.to === from);
}

/** 是否实质活动：输出足够长说明在真干活。 */
export function isSubstantive(outputLength: number): boolean {
  return outputLength > SUBSTANTIVE_OUTPUT_LEN;
}

/**
 * 纯函数：预测一次 A→B 推送后的连击数和裁决。
 * - 同一对 + 无实质活动 → count+1（在累积踢皮球）；
 * - 同一对 + 有实质活动 → 重置 1（真干活不算踢皮球）；
 * - 换了一对 → 重置 1。
 */
export function predictStreak(
  entry: StreakEntry | undefined,
  from: string,
  to: string,
  outputLength: number,
): StreakVerdict {
  let count: number;
  if (entry && isSamePair(entry, from, to)) {
    count = isSubstantive(outputLength) ? 1 : entry.count + 1;
  } else {
    count = 1;
  }
  return {
    warn: count >= PINGPONG_WARN_THRESHOLD && count < PINGPONG_BLOCK_THRESHOLD,
    block: count >= PINGPONG_BLOCK_THRESHOLD,
    count,
  };
}
