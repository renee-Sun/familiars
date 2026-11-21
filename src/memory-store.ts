import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type MemoryType = 'lesson' | 'decision' | 'fact';

export interface Memory {
  id: string;
  type: MemoryType;
  text: string;
  createdAt: number;
}

/**
 * MemoryStore —— 结构化记忆的持久化（教训 / 决策 / 事实）。
 * 与 SessionStore / HistoryStore 同套路：整文件读写。
 * 区别：这是"沉淀下来的知识"，跨会话长期保留，独立于聊天记录。
 */
export class MemoryStore {
  private memories: Memory[];

  constructor(private readonly file: string) {
    this.memories = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Memory[]) : [];
  }

  append(type: MemoryType, text: string): Memory {
    const memory: Memory = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      text,
      createdAt: Date.now(),
    };
    this.memories.push(memory);
    this.persist();
    return memory;
  }

  getAll(): Memory[] {
    return this.memories;
  }

  clear(): void {
    this.memories = [];
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.memories, null, 2));
  }
}
