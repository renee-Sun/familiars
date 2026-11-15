import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type SessionMap = Record<string, string>;

/**
 * SessionStore —— 把「成员 id → 会话 id」的映射持久化到磁盘。
 *
 * 会话 id 是 agent CLI 的会话标识，用 `--resume` 续接；本类只负责存取，
 * 不含任何 agent 知识，方便单独测试。
 */
export class SessionStore {
  private readonly map: SessionMap;

  constructor(private readonly file: string) {
    this.map = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as SessionMap) : {};
  }

  get(memberId: string): string | undefined {
    return this.map[memberId];
  }

  set(memberId: string, sessionId: string): void {
    this.map[memberId] = sessionId;
    this.persist();
  }

  delete(memberId: string): void {
    delete this.map[memberId];
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.map, null, 2));
  }
}
