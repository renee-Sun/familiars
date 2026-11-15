import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentMember, PermissionMode, SendOptions } from './agent-member.js';
import type { SessionStore } from './session-store.js';
import {
  extractErrorResult,
  extractSessionId,
  extractTextBlocks,
  parseLine,
} from './stream-events.js';

const DEFAULT_TIMEOUT_MS = 300_000;

export interface ClaudeCodeMemberConfig {
  id: string;
  name: string;
  aliases: readonly string[];
  animal: string;
  model: string;
  /** settings 文件路径（隔离 provider 的 base_url + token + model）。 */
  settings: string;
  /** 追加到 system prompt 的人设。 */
  persona: string;
}

/**
 * ClaudeCodeMember —— 用 `claude -p` 子进程驱动一个 Claude Code agent。
 *
 * 关键点（已踩坑）：
 * 1. --output-format stream-json 必须配 --verbose；
 * 2. stdin 置 ignore，避免 claude 干等 3 秒；
 * 3. assistant 事件同一 message 会先发 thinking 块再发 text 块，只取 text（见 stream-events.ts）；
 * 4. 会话记忆：从 init 事件抓 session_id 存进 SessionStore，下次 --resume 续接；
 * 5. 超时：默认 5 分钟，超时 SIGTERM 杀进程并报错（防止 agent 卡死）。
 */
export class ClaudeCodeMember implements AgentMember {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly animal: string;
  readonly model: string;
  private readonly settings: string;
  private readonly persona: string;
  private readonly sessionStore: SessionStore;

  constructor(config: ClaudeCodeMemberConfig, sessionStore: SessionStore) {
    this.id = config.id;
    this.name = config.name;
    this.aliases = config.aliases;
    this.animal = config.animal;
    this.model = config.model;
    this.settings = config.settings;
    this.persona = config.persona;
    this.sessionStore = sessionStore;
  }

  async *send(prompt: string, opts: SendOptions = {}): AsyncGenerator<string, void, void> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const resumeSessionId = this.sessionStore.get(this.id);

    const child = spawn('claude', this.buildArgs(prompt, resumeSessionId, opts.permissionMode), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const rl = createInterface({ input: child.stdout! });

    let spawnError: Error | undefined;
    child.once('error', (err) => {
      spawnError = err;
    });
    const closed = new Promise<number | null>((resolve) => {
      child.once('close', (code) => resolve(code));
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    timer.unref();

    for await (const line of rl) {
      const evt = parseLine(line);
      if (!evt) continue;

      const sessionId = extractSessionId(evt);
      if (sessionId) this.sessionStore.set(this.id, sessionId);

      for (const text of extractTextBlocks(evt)) yield text;

      const err = extractErrorResult(evt);
      if (err) throw new Error(err);
    }

    clearTimeout(timer);
    const exitCode = await closed;
    if (spawnError) throw spawnError;
    if (timedOut) throw new Error(`claude 超时（${Math.round(timeoutMs / 1000)}s）`);
    if (exitCode !== 0) throw new Error(`claude 退出码 ${exitCode}`);
  }

  reset(): void {
    this.sessionStore.delete(this.id);
  }

  private buildArgs(prompt: string, resumeSessionId?: string, permissionMode?: PermissionMode): string[] {
    const args = [
      '-p',
      prompt,
      '--settings',
      this.settings,
      '--output-format',
      'stream-json',
      '--verbose', // stream-json 必需
      '--append-system-prompt',
      this.persona,
    ];
    if (resumeSessionId) args.push('--resume', resumeSessionId);
    if (permissionMode) args.push('--permission-mode', permissionMode);
    return args;
  }
}
