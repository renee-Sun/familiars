import type { HistoryMessage } from './history-store.js';

export interface SharedContextOptions {
  /** 取最近多少条消息。默认 12。 */
  limit?: number;
  /** 每条消息最多保留多少字符。默认 200。 */
  maxChars?: number;
}

/**
 * 把聊天历史压成一段"群聊上下文"摘要，注入到每个成员的 prompt 前面，
 * 让它们知道"大家刚才聊了什么"——共享时间线的最小实现。
 *
 * 纯函数、可单测。只取最近 limit 条、逐条截断，避免上下文爆炸。
 * "会话窗口"即当前这个连续聊天窗口；只回放最近的片段。
 */
export function buildSharedContext(
  messages: readonly HistoryMessage[],
  opts: SharedContextOptions = {},
): string {
  const limit = opts.limit ?? 12;
  const maxChars = opts.maxChars ?? 200;

  const recent = messages.slice(-limit);
  if (recent.length === 0) return '';

  const lines = recent.map((m) => {
    const who = m.role === 'user' ? '用户' : (m.name ?? '某成员');
    const text = collapseWhitespace(m.text);
    const clipped = text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
    return `- ${who}：${clipped}`;
  });

  return (
    '【群聊上下文】你身在一个群聊里，以下是最近大家聊的内容（供你了解上下文，不必逐条回应）：\n' +
    lines.join('\n')
  );
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
