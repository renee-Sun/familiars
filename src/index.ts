import { members } from './members.js';
import type { AgentMember, PermissionMode } from './agent-member.js';
import { parseCliArgs } from './cli-parse.js';

function printHelp(): void {
  console.log('Familiars — 一个多 agent 协作平台\n');
  console.log('成员：');
  for (const m of members) {
    const aliases = m.aliases.filter((a) => a !== m.name).join('/');
    const aliasText = aliases ? `（别名 ${aliases}）` : '';
    console.log(`  @${m.name}  ${m.animal} · ${m.model}${aliasText}`);
  }
  console.log('\n用法：');
  console.log('  pnpm start @福多多 你的问题           # 单聊（可写）');
  console.log('  pnpm start @福多多 @Dobby 你的问题    # 同时 @ 多只（可写）');
  console.log('  pnpm start Dobby 你的问题             # 不带 @ 也行');
  console.log('  pnpm start @all 你的问题              # 广播给三只（只读）');
  console.log('  pnpm start --reset @福多多            # 清空福多多的会话记忆');
}

/** 并发把同一问题发给多个成员，各答各的，按成员分组输出。 */
async function fanOut(
  targets: AgentMember[],
  prompt: string,
  permissionMode: PermissionMode,
): Promise<void> {
  const results = await Promise.all(
    targets.map(async (m) => {
      let text = '';
      for await (const chunk of m.send(prompt, { permissionMode })) {
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

/** 单聊：与某个成员对话（可写，acceptEdits），实时流式输出。 */
async function chat(member: AgentMember, prompt: string): Promise<void> {
  console.log(`[${member.name} · ${member.animal}]`);
  for await (const chunk of member.send(prompt, { permissionMode: 'acceptEdits' })) {
    process.stdout.write(chunk);
  }
  process.stdout.write('\n');
}

async function main(): Promise<void> {
  const action = parseCliArgs(process.argv.slice(2));

  switch (action.kind) {
    case 'help':
      printHelp();
      return;
    case 'error':
      console.error(action.message);
      process.exitCode = 1;
      return;
    case 'reset':
      action.target.reset();
      console.log(`已清空 ${action.target.name} 的会话记忆。`);
      return;
    case 'broadcast':
      await fanOut(members, action.prompt, 'plan');
      return;
    case 'directed':
      if (action.targets.length === 1) {
        await chat(action.targets[0]!, action.prompt);
      } else {
        await fanOut(action.targets, action.prompt, 'acceptEdits');
      }
      return;
  }
}

main().catch((err) => {
  console.error(`\n[error] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
