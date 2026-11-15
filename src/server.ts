import { createServer, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { members } from './members.js';
import type { AgentMember, PermissionMode } from './agent-member.js';
import { HistoryStore } from './history-store.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3210);

const history = new HistoryStore(join(projectRoot, '.familiars', 'history.json'));

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
  prompt: string,
  permissionMode: PermissionMode,
  res: ServerResponse,
): Promise<void> {
  writeEvent(res, { member: member.id, name: member.name, animal: member.animal, start: true });
  let text = '';
  try {
    for await (const chunk of member.send(prompt, { permissionMode })) {
      text += chunk;
      writeEvent(res, { member: member.id, name: member.name, text: chunk });
    }
    writeEvent(res, { member: member.id, name: member.name, done: true });
    history.append({ role: 'agent', member: member.id, name: member.name, animal: member.animal, text });
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
  }
}

/**
 * 按成员 id 路由：ids 非空 = 定向（可写 acceptEdits）；ids 空 = 广播（只读 plan）。
 * 前端负责解析消息里的 @，把被 @ 的成员 id 传过来。
 */
async function handleChat(ids: string[], prompt: string, res: ServerResponse): Promise<void> {
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

  history.append({ role: 'user', target: label, text: prompt });
  await Promise.all(targets.map((m) => streamMember(m, prompt, permissionMode, res)));
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
      let parsed: { members?: string[]; prompt?: string };
      try {
        parsed = JSON.parse(body) as { members?: string[]; prompt?: string };
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
      handleChat(Array.isArray(parsed.members) ? parsed.members : [], parsed.prompt, res)
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
