/**
 * 从 agent 的回复文本里解析"行首 @" 提及（A2A 的路由手势）。
 *
 * 规则（照 Clowder 简化）：
 * 1. 剥离围栏代码块后解析；
 * 2. 只认"行首 @"（真正的交接手势），正文里顺带提到的 @ 不触发；
 * 3. 精确匹配名字/别名（大小写不敏感），避免 @Dobbyist 误命中 Dobby；
 * 4. 过滤自己；
 * 5. 最多返回 2 只。
 */

export interface MentionCatalogEntry {
  id: string;
  name: string;
  aliases: readonly string[];
}

const MAX_A2A_MENTION_TARGETS = 2;

export function parseA2AMentions(
  text: string,
  selfId: string,
  catalog: readonly MentionCatalogEntry[],
): string[] {
  if (!text) return [];

  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const found: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of stripped.split(/\r?\n/)) {
    if (found.length >= MAX_A2A_MENTION_TARGETS) break;

    const line = rawLine.trimStart();
    if (!line.startsWith('@')) continue;

    // 提取 @ 后面的 handle（直到空白/标点/结束）
    const match = line.match(/^@([\p{L}\p{N}_.-]+)/u);
    if (!match) continue;
    const handle = (match[1] ?? '').toLowerCase();

    for (const entry of catalog) {
      if (entry.id === selfId) continue;
      const names = [entry.name, ...entry.aliases].map((n) => n.toLowerCase());
      if (names.includes(handle) && !seen.has(entry.id)) {
        seen.add(entry.id);
        found.push(entry.id);
        break;
      }
    }
  }

  return found;
}
