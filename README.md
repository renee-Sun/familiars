# Familiars

一个多 agent 协作平台——把多个 AI agent 聚到同一个界面里，像一群动物一样协作。每个 agent 都是一个**真正的 agent CLI**（保留读代码、改文件、跑命令的能力），平台只做身份、路由、会话和记忆。

> 灵感来自 Clowder AI；本项目是独立实现，从最简架构逐步搭建。

## 成员（动物们）

| 动物 | 名字（别名） | 背后模型 | 定位 |
|---|---|---|---|
| 英国长毛猫 | 福多多（福宝 / 多宝 / 多多） | DeepSeek | 温和统筹 |
| 赤狐 | Dobby | GLM | 机敏利落、写码实现 |
| 猫头鹰 | Hedwig | Kimi | 智慧夜行、分析审查 |

## 当前状态

**M5 完成 ✅** —— 有了 Web 前端（实时流式群聊）。

```bash
corepack pnpm install
corepack pnpm serve                     # 启动 Web 前端 → http://localhost:3210

corepack pnpm start                     # CLI：列出成员
corepack pnpm start @福多多 你的问题      # CLI 单聊（可写）
corepack pnpm start @福多多 @Dobby 你的问题  # CLI 同时 @ 多只（可写）
corepack pnpm start @all 你的问题        # CLI 广播（只读）
corepack pnpm start --reset @福多多      # 清空记忆

corepack pnpm check                     # 类型检查（tsc）
corepack pnpm test                      # 单元测试
```

## 代码结构

| 文件 | 职责 |
|---|---|
| `src/agent-member.ts` | `AgentMember` 接口 + `SendOptions`/`PermissionMode`（核心抽象） |
| `src/claude-member.ts` | `ClaudeCodeMember` 实现——spawn + 流式 + 会话 + 超时 |
| `src/stream-events.ts` | stream-json 纯解析函数（可单测，无副作用） |
| `src/session-store.ts` | `SessionStore`——「成员 id → 会话 id」磁盘持久化 |
| `src/history-store.ts` | `HistoryStore`——聊天记录落盘（`GET /history` 读取、`DELETE` 清空） |
| `src/members.ts` | 三只动物的配置（settings 路径 + 动物人设） |
| `src/index.ts` | CLI 入口：@路由 / @all 广播 / --reset |
| `src/server.ts` | Web 服务：`GET /`、`GET /members`、`GET /history`、`POST /chat`（NDJSON 流式） |
| `index.html` | 前端单页：@提及路由 + 消息气泡 + 流式渲染 |
| `src/*.test.ts` | 单元测试（node:test，零额外依赖） |

## 里程碑

- **M0 单 agent 流式闭环** ✅：`spawn claude -p` → 解析 stream-json → 流式输出。
- **M1 适配器抽象 + 三成员 + 人设** ✅：`AgentMember` 接口；`--append-system-prompt` 注入动物身份。
- **M2 会话持久化** ✅：从 init 事件抓 session_id，`--resume` 自动续接，`--reset` 清空。
- **M3 群聊语义** ✅：`@all` 广播（并发 fan-out）+ 多人 `@`（`@Dobby @Hedwig` 并发定向）+ 权限档位（广播 `plan` 只读、@一人或多人 `acceptEdits` 可写）。
- **M4 测试 + 打磨** ✅：抽纯函数、10 个单测、总超时保护、文档。
- **M5 Web 前端** ✅：Node 原生 http + NDJSON 流式 + 单页 HTML，零依赖、不引框架。

## M5 设计（面试可讲）

- 后端用 **Node 原生 `http`**，`POST /chat` 返回 NDJSON 流（`start → text* → done`），复用 `AgentMember.send()` 的流式接口——**UI 是 agent 抽象之上的薄层**，接前端时核心三层一行没改。
- 前端 `fetch` + `ReadableStream` 逐行解析，把事件按 `member` 归位到对应气泡；广播时三个成员**并发写同一响应流**，事件按行交错、无损。
- **刻意不引框架**：UI 复杂度（输入 + 气泡流式吐字）配不上 React，vanilla JS + 原生 http 零构建、更清晰——按需选型本身是设计判断。

## 亮点

1. **适配器抽象**：`AgentMember` 接口让"加一个新 agent 运行时"变成"加一个实现"（接 Codex = 加 `CodexMember`）。
2. **复用现有 settings 隔离 provider**：每厂商一份 settings，`claude -p --settings <file>` 直接复用，天然"一进程一后端"。
3. **流式解析**：stream-json 每行一个 JSON 事件，异步逐行读取，边生成边输出。
4. **会话持久化**：从 init 事件抓 session_id，跨轮 `--resume`，成员"有记忆"。
5. **权限档位**：广播用 `plan`（只读）、@一人或多人用 `acceptEdits`（可写），复用 agent CLI 现成的权限模型。
6. **零依赖 Web 层**：原生 http + 单页 HTML，不引框架。

## 踩过的坑

| 坑 | 解决 |
|---|---|
| `--output-format stream-json` 单独用会报错 | 必须配 `--verbose` |
| `claude -p` 会干等 stdin 3 秒 | spawn 时 `stdio: ['ignore', 'pipe', 'pipe']` |
| 同一 message 发两条 `assistant` 事件 | 先 `thinking` 块、再 `text` 块，只取 `type === 'text'` |
| pnpm 11/12 build 脚本默认 deny | `pnpm-workspace.yaml` 用 `allowBuilds` 映射放行 |
| 模型自报"我是 Claude Code" | 用 `--append-system-prompt` 覆盖身份 |
| 权限档位是否真生效 | 实测：`plan` 只输出计划不写文件；`acceptEdits` 能写文件 |

## 路线图

- ✅ M0 单 agent 流式闭环
- ✅ M1 适配器抽象 + 三个成员 + 动物人设
- ✅ M2 会话持久化
- ✅ M3 群聊语义：@单个 / 广播 + 权限档位
- ✅ M4 打磨 + 测试 + 文档
- ✅ M5 Web 前端（零依赖）

## 已知限制 / 后续

见 [TODO.md](TODO.md) —— 身份软覆盖、cwd 敏感、共享时间线、接入 Codex、markdown 渲染等。
