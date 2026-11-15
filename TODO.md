# TODO / 已知限制

M0–M5 已完成。以下是已知限制与后续方向，按优先级排列。

## 已知限制

- **身份覆盖是"软"的**：人设用 `--append-system-prompt` 追加，偶尔可能"串味"。更强控制可试 `--system-prompt` 全量替换（需验证）。
- **cwd 敏感**：会话持久化依赖 `claude -p` 的运行目录；从别的目录启动 `pnpm start`/`pnpm serve` 时 `--resume` 可能找不到历史会话。目前 spawn 未显式固定 cwd。
- **超时是"一刀切"**：只有总超时（默认 5 分钟，SIGTERM 杀进程），不像 Clowder 有 liveness probe 区分"卡死 vs 忙"。长任务需手动调 `timeoutMs`。
- **广播是 fan-out，不是互看**：三只各答各的，彼此看不到对方答案；"共享时间线 / 跨 agent 互审"未做。
- **acceptEdits 的 Bash 行为未深测**：acceptEdits 自动放行文件编辑，但跑命令（Bash）可能触发权限提示；headless 下的具体行为（自动拒绝？）本次只用 Write 工具验证过。
- **无进程清理 / cancellation**：Ctrl-C 中断时子进程可能残留（未做 abort → kill 的清理）；前端断开连接时后端也不会主动终止正在跑的 agent。
- **消息是纯文本**：Markdown（如 `**加粗**`、代码块）未渲染；前端 `res.write` 未做背压处理（个人工具可接受）。

## 后续方向

- **共享时间线 / 跨 agent 互审**：让成员互相看到彼此发言（对应最初"让另外两个模型看到我说的话"）。
- **接入 Codex**：验证 `AgentMember` 抽象——加一个 `CodexMember` 实现（用 `codex exec`）。
- **自动化集成测试**：spawn / HTTP 路径目前靠手工验证，可 mock spawn 做集成测试。
- **Markdown 渲染 + 会话恢复 UI**：前端渲染富文本、展示历史会话、`--reset` 按钮。
