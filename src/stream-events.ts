/**
 * stream-json 事件的最小结构 + 纯解析函数。
 *
 * 把"从事件流里抽取文本/会话/错误"的逻辑从适配器里拆出来，变成无副作用的纯函数，
 * 方便单元测试（不依赖子进程和 IO）。
 */

export type ContentBlock = { type: string; text?: string; thinking?: string };

export type StreamEvent = {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: { content?: ContentBlock[] };
  result?: string;
  is_error?: boolean;
};

/** 从 assistant 事件里取出所有 text 块（跳过 thinking 块）。 */
export function extractTextBlocks(evt: StreamEvent): string[] {
  if (evt.type !== 'assistant') return [];
  const out: string[] = [];
  for (const block of evt.message?.content ?? []) {
    if (block.type === 'text' && block.text) out.push(block.text);
  }
  return out;
}

/** init 事件返回 session_id，否则返回 undefined。 */
export function extractSessionId(evt: StreamEvent): string | undefined {
  return evt.type === 'system' && evt.subtype === 'init' ? evt.session_id : undefined;
}

/** 若是出错的 result 事件，返回错误信息，否则 undefined。 */
export function extractErrorResult(evt: StreamEvent): string | undefined {
  if (evt.type !== 'result' || !evt.is_error) return undefined;
  return evt.result ?? 'agent 返回错误';
}

/** 解析一行 stream-json；空行或非法 JSON 返回 undefined。 */
export function parseLine(line: string): StreamEvent | undefined {
  if (!line.trim()) return undefined;
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    return undefined;
  }
}
