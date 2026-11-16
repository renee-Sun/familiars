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

const DEFAULT_TIMEOUT_MS = 600_000;

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
  /** git 提交邮箱（各成员共享操作者的账号；作者名用 name 区分）。 */
  gitEmail: string;
}

/**
 * ClaudeCodeMember —— 用 `claude -p` 子进程驱动一个 Claude Code agent。
 *
 * 关键点（已踩坑）：
 * 1. --output-format stream-json 必须配 --verbose；
 * 2. stdin 置 ignore，避免 claude 干等 3 秒；
 * 3. assistant 事件同一 message 会先发 thinking 块再发 text 块，只取 text（见 stream-events.ts）；
 * 4. 会话记忆：从 init 事件抓 session_id 存进 SessionStore，下次 --resume 续接；
 * 5. 空闲超时：默认 10 分钟无新输出即 SIGTERM 杀进程（在干活就不误杀）。
 */
export class ClaudeCodeMember implements AgentMember {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly animal: string;
  readonly model: string;
  private readonly settings: string;
  private readonly persona: string;
  private readonly gitEmail: string;
  private readonly sessionStore: SessionStore;

  constructor(config: ClaudeCodeMemberConfig, sessionStore: SessionStore) {
    this.id = config.id;
    this.name = config.name;
    this.aliases = config.aliases;
    this.animal = config.animal;
    this.model = config.model;
    this.settings = config.settings;
    this.persona = config.persona;
    this.gitEmail = config.gitEmail;
    this.sessionStore = sessionStore;
  }

  async *send(prompt: string, opts: SendOptions = {}): AsyncGenerator<string, void, void> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const resumeSessionId = this.sessionStore.get(this.id);

    const child = spawn('claude', this.buildArgs(prompt, resumeSessionId, opts.permissionMode), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // 每只 familiar 用自己的名字署名 commit（覆盖仓库级 user.name）。
        GIT_AUTHOR_NAME: this.name,
        GIT_COMMITTER_NAME: this.name,
        GIT_AUTHOR_EMAIL: this.gitEmail,
        GIT_COMMITTER_EMAIL: this.gitEmail,
      },
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetTimer = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);
      timer.unref();
    };
    resetTimer(); // 初始倒计时

    for await (const line of rl) {
      const evt = parseLine(line);
      if (!evt) continue;

      resetTimer(); // 有新输出就重置：只要在干活就不误杀

      const sessionId = extractSessionId(evt);
      if (sessionId) this.sessionStore.set(this.id, sessionId);

      for (const text of extractTextBlocks(evt)) yield text;

      const err = extractErrorResult(evt);
      if (err) throw new Error(err);
    }

    if (timer) clearTimeout(timer);
    const exitCode = await closed;
    if (spawnError) throw spawnError;
    if (timedOut) throw new Error(`claude 空闲超时（${Math.round(timeoutMs / 1000)}s 无新输出）`);
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
