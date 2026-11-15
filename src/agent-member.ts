/**
 * AgentMember —— 平台里"一个成员"的抽象契约。
 *
 * 这是整个项目的核心抽象：平台只认这个接口，不关心成员背后是哪个 agent CLI。
 * 目前只有 ClaudeCodeMember 一种实现；以后接 Codex / Gemini CLI 就是加一个实现，
 * 前端和路由完全不用改。
 */

/** 权限档位，映射到 agent CLI 的 --permission-mode。 */
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface SendOptions {
  /** 本次会话的权限档位。广播默认只读（plan），@单个默认可写（acceptEdits）。 */
  permissionMode?: PermissionMode;
  /** 总超时（毫秒）。默认 5 分钟，防止 agent 卡死。 */
  timeoutMs?: number;
}

export interface AgentMember {
  /** 稳定 id，如 'deepseek'。 */
  readonly id: string;
  /** 动物名，如 '福多多'。 */
  readonly name: string;
  /** 别名，如 ['福宝', '多宝', '多多']。 */
  readonly aliases: readonly string[];
  /** 动物，如 '英国长毛猫'。 */
  readonly animal: string;
  /** 背后模型，如 'deepseek-v4-pro[1m]'（仅用于展示，实际由 settings 决定）。 */
  readonly model: string;

  /** 向该成员发消息，流式产出文本片段。会话记忆由实现自己维护。 */
  send(prompt: string, opts?: SendOptions): AsyncGenerator<string, void, void>;

  /** 清空该成员的会话记忆，下次对话从零开始。 */
  reset(): void;
}
