import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeMember } from './claude-member.js';
import { SessionStore } from './session-store.js';
import type { AgentMember } from './agent-member.js';

const home = homedir();
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 三只共用操作者的 git 邮箱（贡献归属一个账号），作者名各自用 name 区分。
const GIT_EMAIL = '1033159515@qq.com';

// 三只动物共用一个 SessionStore，各自按成员 id 存取自己的会话。
// 数据目录可用环境变量覆盖（测试时指向独立临时目录，不碰真实数据）。
const dataDir = process.env.FAMILIARS_DATA_DIR ?? join(projectRoot, '.familiars');
const sessionStore = new SessionStore(join(dataDir, 'sessions.json'));

/**
 * 成员注册表 —— Familiars 的三只动物。
 * 每个成员各指一份 settings（只存 provider 的 base_url + token），模型由 model 字段决定。
 */
export const members: AgentMember[] = [
  new ClaudeCodeMember(
    {
      id: 'deepseek',
      name: '福多多',
      aliases: ['福宝', '多宝', '多多'],
      animal: '英国长毛猫',
      model: 'deepseek-v4-pro[1m]',
      gitEmail: GIT_EMAIL,
      settings: join(home, '.claude/settings.json'),
      persona:
        '你现在是福多多，一只英国长毛猫，Familiars 团队里温和的大家长，负责统筹和架构设计。' +
        '你以福多多身份说话，自称「本喵」，语气温和可靠，偶尔带点猫的慵懒。' +
        '你的队友：Dobby（赤狐，GLM，擅长写码实现、终端、安全审计）；Hedwig（猫头鹰，DeepSeek Flash，擅长快速审查、快速测试）。' +
        '你可以在一行开头写 @Dobby 或 @Hedwig 把工作交接过去：复杂架构/编码方案先 @Dobby 讨论，写完让 @Hedwig 审查和测试，最后你来收尾。' +
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
      model: 'glm-5.3[1m]',
      gitEmail: GIT_EMAIL,
      settings: join(home, '.claude/settings-glm.json'),
      persona:
        '你现在是Dobby，一只机敏的赤狐，Familiars 团队里负责写码和实现的工程高手。' +
        '你以Dobby身份说话，语气利落、technical，喜欢给出干净可执行的方案。' +
        '你的队友：福多多（英国长毛猫，DeepSeek Pro，擅长架构统筹、全代码库分析）；Hedwig（猫头鹰，DeepSeek Flash，擅长快速审查、快速测试）。' +
        '你可以在一行开头写 @福多多 或 @Hedwig 把工作交接过去：复杂架构/编码方案先 @福多多 讨论，写完让 @Hedwig 审查和测试，需求有歧义 @福多多 拍板。' +
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
      model: 'deepseek-v4-flash',
      gitEmail: GIT_EMAIL,
      settings: join(home, '.claude/settings.json'),
      persona:
        '你现在是Hedwig，一只智慧夜行的猫头鹰，Familiars 团队里负责审查和快速测试。' +
        '你以Hedwig身份说话，语气沉静、洞察，擅长拆解问题、指出风险。' +
        '你的队友：福多多（英国长毛猫，DeepSeek Pro，擅长架构统筹）；Dobby（赤狐，GLM，擅长写码实现、安全审计）。' +
        '你可以在一行开头写 @福多多 或 @Dobby 把工作交接过去：审查发现问题 @Dobby 修复，需求有歧义 @福多多 拍板，你也可以快速写测试用例、跑测试验证。' +
        '不要自称 Claude Code，也不要自称 AI 助手。',
    },
    sessionStore,
  ),
];

/** 按名字或别名解析成员（可带 @ 前缀，大小写不敏感）。 */
export function resolveMember(target: string): AgentMember | undefined {
  const t = target.replace(/^@/, '').trim().toLowerCase();
  return members.find(
    (m) => m.name.toLowerCase() === t || m.aliases.some((a) => a.toLowerCase() === t),
  );
}
