import type { AgentMember } from './agent-member.js';
import { members, resolveMember } from './members.js';

export const BROADCAST_TARGETS = new Set(['@all', '@全体', 'all']);

export type CliAction =
  | { kind: 'help' }
  | { kind: 'reset'; target: AgentMember }
  | { kind: 'broadcast'; prompt: string }
  | { kind: 'directed'; targets: AgentMember[]; prompt: string }
  | { kind: 'error'; message: string };

/**
 * 解析 CLI 参数（纯函数，无副作用，便于单测）。
 *
 * 语法：
 *   （无参数）                  → help
 *   --reset @福多多             → reset
 *   @all 你的问题               → broadcast（只读）
 *   @福多多 @Dobby 你的问题     → directed（可写，多目标）
 *   福多多 你的问题             → directed（不带 @ 也行）
 *
 * 定向模式下，贪婪吞掉开头连续能解析成成员的参数作为目标，其余全部当作 prompt——
 * 因此「@福多多 聊 @Dobby 的看法」里的 @Dobby 只会是 prompt 的一部分，不会误判成第二个目标。
 */
export function parseCliArgs(args: string[]): CliAction {
  if (args.length === 0) return { kind: 'help' };

  if (args[0] === '--reset') {
    const raw = args[1];
    if (!raw) return { kind: 'error', message: '用法：pnpm start --reset @福多多' };
    const target = resolveMember(raw);
    if (!target) return { kind: 'error', message: `不认识「${raw}」。` };
    return { kind: 'reset', target };
  }

  if (BROADCAST_TARGETS.has(args[0]!.toLowerCase())) {
    const prompt = args.slice(1).join(' ');
    if (!prompt) return { kind: 'error', message: '广播请带上问题，例如：pnpm start @all 聊聊这个方案' };
    return { kind: 'broadcast', prompt };
  }

  const seen = new Set<string>();
  const targets: AgentMember[] = [];
  let i = 0;
  while (i < args.length) {
    const m = resolveMember(args[i]!);
    if (!m) break;
    if (!seen.has(m.id)) {
      seen.add(m.id);
      targets.push(m);
    }
    i++;
  }

  if (targets.length === 0) {
    const names = members.map((m) => '@' + m.name).join(' / ');
    return { kind: 'error', message: `不认识「${args[0]}」。可用成员：${names} / @all` };
  }

  const prompt = args.slice(i).join(' ');
  if (!prompt) {
    return { kind: 'error', message: '请带上问题，例如：pnpm start @福多多 用一句话介绍你自己' };
  }

  return { kind: 'directed', targets, prompt };
}
