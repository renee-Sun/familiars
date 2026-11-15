import { members, resolveMember } from './members.js';
import type { AgentMember } from './agent-member.js';

const BROADCAST_TARGETS = new Set(['@all', '@全体', 'all']);

function printHelp(): void {
  console.log('Familiars — 一个多 agent 协作平台\n');
  console.log('成员：');
  for (const m of members) {
    const aliases = m.aliases.filter((a) => a !== m.name).join('/');
    const aliasText = aliases ? `（别名 ${aliases}）` : '';
    console.log(`  @${m.name}  ${m.animal} · ${m.model}${aliasText}`);
  }
  console.log('\n用法：');
  console.log('  pnpm start @福多多 你的问题         # 单聊（可写）');
  console.log('  pnpm start Dobby 你的问题           # 不带 @ 也行');
  console.log('  pnpm start @all 你的问题            # 广播给三只（只读）');
  console.log('  pnpm start --reset @福多多          # 清空福多多的会话记忆');
}

/** 广播：同一问题并发发给所有成员，各答各的（只读，plan）。 */
async function broadcast(prompt: string): Promise<void> {
  const results = await Promise.all(
    members.map(async (m) => {
      let text = '';
      for await (const chunk of m.send(prompt, { permissionMode: 'plan' })) {
        text += chunk;
      }
      return { member: m, text };
    }),
  );

  for (const { member, text } of results) {
    console.log(`\n[${member.name} · ${member.animal}]`);
    console.log(text);
  }
}

/** 单聊：与某个成员对话（可写，acceptEdits）。 */
async function chat(member: AgentMember, prompt: string): Promise<void> {
  console.log(`[${member.name} · ${member.animal}]`);
  for await (const chunk of member.send(prompt, { permissionMode: 'acceptEdits' })) {
    process.stdout.write(chunk);
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    return;
  }

  if (args[0] === '--reset') {
    const target = args[1];
    if (!target) {
      console.error('用法：pnpm start --reset @福多多');
      process.exitCode = 1;
      return;
    }
    const member = resolveMember(target);
    if (!member) {
      console.error(`不认识「${target}」。`);
      process.exitCode = 1;
      return;
    }
    member.reset();
    console.log(`已清空 ${member.name} 的会话记忆。`);
    return;
  }

  const target = args[0]!;
  const prompt = args.slice(1).join(' ');

  if (BROADCAST_TARGETS.has(target)) {
    if (!prompt) {
      console.error('广播请带上问题，例如：pnpm start @all 聊聊这个方案');
      process.exitCode = 1;
      return;
    }
    await broadcast(prompt);
    return;
  }

  const member = resolveMember(target);
  if (!member) {
    console.error(`不认识「${target}」。可用成员：`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (!prompt) {
    console.error('请带上问题，例如：pnpm start @福多多 用一句话介绍你自己');
    process.exitCode = 1;
    return;
  }

  await chat(member, prompt);
}

main().catch((err) => {
  console.error(`\n[error] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
