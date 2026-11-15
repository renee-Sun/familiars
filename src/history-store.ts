import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type HistoryMessage = {
  role: 'user' | 'agent';
  /** user 消息：发给谁（@福多多 / @all）。 */
  target?: string;
  /** agent 消息：成员 id。 */
  member?: string;
  name?: string;
  animal?: string;
  text: string;
};

/**
 * HistoryStore —— 把聊天记录（用户消息 + agent 回复）追加落盘。
 * 与 SessionStore 同套路：整文件读写，个人工具体量足够。
 */
export class HistoryStore {
  private messages: HistoryMessage[];

  constructor(private readonly file: string) {
    this.messages = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as HistoryMessage[]) : [];
  }

  append(msg: HistoryMessage): void {
    this.messages.push(msg);
    this.persist();
  }

  getAll(): HistoryMessage[] {
    return this.messages;
  }

  clear(): void {
    this.messages = [];
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.messages, null, 2));
  }
}
