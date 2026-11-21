import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { members } from './members.js';
import type { AgentMember, PermissionMode } from './agent-member.js';
import { HistoryStore } from './history-store.js';
import { buildSharedContext } from './shared-context.js';
import { parseA2AMentions } from './a2a-mentions.js';
import { predictStreak, type StreakEntry } from './ping-pong.js';
import { MemoryStore, type Memory } from './memory-store.js';
import { extractMemories, memoryTypeLabel, recall } from './memory.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3210);

// 数据目录可用环境变量覆盖（测试时指向独立临时目录，不碰真实数据）。
const dataDir = process.env.FAMILIARS_DATA_DIR ?? join(projectRoot, '.familiars');
const history = new HistoryStore(join(dataDir, 'history.json'));
const memoryStore = new MemoryStore(join(dataDir, 'memory.json'));

type ChatEvent = Record<string, unknown>;

/** 写一行 NDJSON 事件到响应流。 */
function writeEvent(res: ServerResponse, evt: ChatEvent): void {
  res.write(JSON.stringify(evt) + '\n');
}

/**
 * 把一个成员的流式回答写成 NDJSON 事件序列：start → text* → done | error。
 * 广播时多个成员并发写同一个 res，事件按行交错，每行是完整 JSON，客户端按 member 归位。
 * 同时把完整回答追加到聊天历史。
 */
async function streamMember(
  member: AgentMember,
  fullPrompt: string,
  permissionMode: PermissionMode,
  res: ServerResponse,
): Promise<string> {
  writeEvent(res, { member: member.id, name: member.name, animal: member.animal, start: true });
  let text = '';
  try {
    for await (const chunk of member.send(fullPrompt, { permissionMode })) {
      text += chunk;
      writeEvent(res, { member: member.id, name: member.name, text: chunk });
    }
    writeEvent(res, { member: member.id, name: member.name, done: true });
    history.append({ role: 'agent', member: member.id, name: member.name, animal: member.animal, text });
    // 结构化记忆：从回复里提取"记忆|类型|内容"标记，自动入库
    for (const mem of extractMemories(text)) {
      memoryStore.append(mem.type, mem.text);
    }
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeEvent(res, { member: member.id, name: member.name, error: msg });
    history.append({
      role: 'agent',
      member: member.id,
      name: member.name,
      animal: member.animal,
      text: text ? `${text}\n[error] ${msg}` : `[error] ${msg}`,
    });
    return text;
  }
}

/** 把召回的回忆拼成一段"相关记忆"文本。 */
function buildMemoryContext(memories: Memory[]): string {
  if (memories.length === 0) return '';
  const lines = memories.map((m) => `- [${memoryTypeLabel(m.type)}] ${m.text}`);
  return `【相关记忆】\n${lines.join('\n')}`;
}

/** 组装"基础 prompt"：相关记忆 + 共享上下文 + 用户原始问题。 */
function buildBasePrompt(sharedContext: string, memoryContext: string, prompt: string): string {
  const parts: string[] = [];
  if (memoryContext) parts.push(memoryContext);
  if (sharedContext) parts.push(sharedContext);
  parts.push(`【现在】用户说：${prompt}`);
  return parts.join('\n\n');
}

const MAX_A2A_DEPTH = 7;

/** A2A 链的共享状态（总回答数 + 连击）。 */
interface ChainState {
  depth: number;
  streak: StreakEntry | undefined;
}

/** 组装"交接 prompt"：告诉被拉起的成员"谁在叫你、TA 说了什么"。 */
function buildHandoffPrompt(callerName: string, callerResponse: string, warnPingPong: boolean): string {
  let p = `${callerName} 在回复里 @ 了你，请你接着处理。\n\n【${callerName} 说】\n${callerResponse}`;
  if (warnPingPong) {
    p += '\n\n【提醒】你们已经在来回传递了，如果没有新的实质进展，请直接给出结论或收尾，不要继续踢皮球。';
  }
  return p;
}

/**
 * A2A：解析一只成员回复里的"行首 @"，自动拉起被 @ 的成员（递归）。
 * 护栏：深度上限（MAX_A2A_DEPTH）+ ping-pong 连击（警告/拦截/实质重置）。
 */
async function runA2A(
  caller: AgentMember,
  callerResponse: string,
  permissionMode: PermissionMode,
  res: ServerResponse,
  state: ChainState,
): Promise<void> {
  const mentionedIds = parseA2AMentions(callerResponse, caller.id, members);
  for (const id of mentionedIds) {
    if (state.depth >= MAX_A2A_DEPTH) break;
    const target = members.find((m) => m.id === id);
    if (!target) continue;

    const verdict = predictStreak(state.streak, caller.id, target.id, callerResponse.length);
    if (verdict.block) continue;

    const handoffPrompt = buildHandoffPrompt(caller.name, callerResponse, verdict.warn);
    state.depth += 1;
    state.streak = { from: caller.id, to: target.id, count: verdict.count };

    const targetResponse = await streamMember(target, handoffPrompt, permissionMode, res);
    await runA2A(target, targetResponse, permissionMode, res, state);
  }
}

/**
 * 串行接力（#workflow）：成员按顺序依次回答，每只都能看到前面几只的完整答案；
 * 每只答完后，若回复里"行首 @" 了别人，会自动拉起（A2A，见 runA2A）。
 */
async function runSerial(
  targets: AgentMember[],
  prompt: string,
  permissionMode: PermissionMode,
  res: ServerResponse,
  sharedContext: string,
  memoryContext: string,
): Promise<void> {
  const basePrompt = buildBasePrompt(sharedContext, memoryContext, prompt);
  const previous: { name: string; content: string }[] = [];
  const state: ChainState = { depth: 0, streak: undefined };

  for (const m of targets) {
    let fullPrompt = basePrompt;
    if (previous.length > 0) {
      const prevText = previous.map((p) => `[${p.name} answered: ${p.content}]`).join('\n');
      fullPrompt = `${basePrompt}\n\n【前面成员的回答】\n${prevText}\n\n【现在轮到你了】请基于以上回答，给出你的看法或补充。`;
    }
    const text = await streamMember(m, fullPrompt, permissionMode, res);
    previous.push({ name: m.name, content: text });
    state.depth += 1;

    // A2A：这只答完，若回复里 @ 了别人，自动拉起
    await runA2A(m, text, permissionMode, res, state);
  }
}

/**
 * 按成员 id 路由：ids 非空 = 定向（可写 acceptEdits）；ids 空 = 广播（只读 plan）。
 * 前端负责解析消息里的 @：members = 被 @ 的成员 id，prompt = 剥掉 @ token 的正文，
 * display = 用户原文（含 @），用于聊天历史回放。
 */
async function handleChat(
  ids: string[],
  prompt: string,
  display: string,
  mode: string | undefined,
  res: ServerResponse,
): Promise<void> {
  const directed = ids.length > 0;
  const targets = directed
    ? ids.map((id) => members.find((m) => m.id === id)).filter((m): m is AgentMember => m !== undefined)
    : members;

  if (directed && targets.length === 0) {
    writeEvent(res, { error: '没有匹配的成员' });
    return;
  }

  const permissionMode: PermissionMode = directed ? 'acceptEdits' : 'plan';
  const label = directed ? targets.map((m) => '@' + m.name).join(' ') : '@all';

  // 组装共享上下文：当前这条消息之前的历史，让被 @ 的成员了解"大家刚才聊了什么"。
  const sharedContext = buildSharedContext(history.getAll());
  // 结构化记忆：按当前问题召回相关记忆，注入 prompt。
  const memoryContext = buildMemoryContext(recall(prompt, memoryStore.getAll()));

  history.append({ role: 'user', target: label, text: display });

  if (mode === 'workflow') {
    await runSerial(targets, prompt, permissionMode, res, sharedContext, memoryContext);
  } else {
    const basePrompt = buildBasePrompt(sharedContext, memoryContext, prompt);
    await Promise.all(targets.map((m) => streamMember(m, basePrompt, permissionMode, res)));
  }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(projectRoot, 'index.html')));
    return;
  }

  if (req.method === 'GET' && req.url === '/members') {
    const list = members.map((m) => ({
      id: m.id,
      name: m.name,
      aliases: m.aliases,
      animal: m.animal,
      model: m.model,
    }));
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(list));
    return;
  }

  if (req.method === 'GET' && req.url === '/history') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(history.getAll()));
    return;
  }

  if (req.method === 'DELETE' && req.url === '/history') {
    history.clear();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed: { members?: string[]; prompt?: string; display?: string; mode?: string };
      try {
        parsed = JSON.parse(body) as { members?: string[]; prompt?: string; display?: string; mode?: string };
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad json' }));
        return;
      }
      if (!parsed.prompt) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'prompt 必填' }));
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
      });
      handleChat(
        Array.isArray(parsed.members) ? parsed.members : [],
        parsed.prompt,
        parsed.display ?? parsed.prompt,
        parsed.mode,
        res,
      )
        .then(() => res.end())
        .catch((err) => {
          writeEvent(res, { error: err instanceof Error ? err.message : String(err) });
          res.end();
        });
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Familiars 前端已启动：http://localhost:${PORT}`);
});
