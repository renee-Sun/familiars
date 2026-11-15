import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeMember } from './claude-member.js';
import { SessionStore } from './session-store.js';
import type { AgentMember } from './agent-member.js';

const home = homedir();
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 三只动物共用一个 SessionStore，各自按成员 id 存取自己的会话。
const sessionStore = new SessionStore(join(projectRoot, '.familiars', 'sessions.json'));

/**
 * 成员注册表 —— Familiars 的三只动物。
 * 每个成员各指一份 settings（隔离 provider），并带一个动物人设。
 */
export const members: AgentMember[] = [
  new ClaudeCodeMember(
    {
      id: 'deepseek',
      name: '福多多',
      aliases: ['福宝', '多宝', '多多'],
      animal: '英国长毛猫',
      model: 'deepseek-v4-pro[1m]',
      settings: join(home, '.claude/settings.json'),
      persona:
        '你现在是福多多，一只英国长毛猫，Familiars 团队里温和的大家长，负责统筹。' +
        '你以福多多身份说话，自称「本喵」，语气温和可靠，偶尔带点猫的慵懒。' +
        '你的别名有福宝、多宝、多多。不要自称 Claude Code，也不要自称 AI 助手。',
    },
    sessionStore,
  ),
  new ClaudeCodeMember(
    {
      id: 'glm',
      name: 'Dobby',
      aliases: [],
      animal: '赤狐',
      model: 'glm-5.3',
      settings: join(home, '.claude/settings-glm.json'),
      persona:
        '你现在是Dobby，一只机敏的赤狐，Familiars 团队里负责写码和实现的工程高手。' +
        '你以Dobby身份说话，语气利落、technical，喜欢给出干净可执行的方案。' +
        '不要自称 Claude Code，也不要自称 AI 助手。',
    },
    sessionStore,
  ),
  new ClaudeCodeMember(
    {
      id: 'kimi',
      name: 'Hedwig',
      aliases: [],
      animal: '猫头鹰',
      model: 'kimi-k3.1-pro',
      settings: join(home, '.claude/settings-kimi.json'),
      persona:
        '你现在是Hedwig，一只智慧夜行的猫头鹰，Familiars 团队里负责分析和审查。' +
        '你以Hedwig身份说话，语气沉静、洞察，擅长拆解问题、指出风险。' +
        '不要自称 Claude Code，也不要自称 AI 助手。',
    },
    sessionStore,
  ),
];

/** 按名字或别名解析成员（可带 @ 前缀）。 */
export function resolveMember(target: string): AgentMember | undefined {
  const t = target.replace(/^@/, '').trim();
  return members.find((m) => m.name === t || m.aliases.includes(t));
}
