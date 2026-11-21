# Familiars

一个多 agent 协作平台——把多个 AI agent 聚到同一个界面里，像一群动物一样协作。每个 agent 都是一个**真正的 agent CLI**（保留读代码、改文件、跑命令的能力），平台只做身份、路由、会话和记忆。

> 灵感来自 Clowder AI；本项目是独立实现，从最简架构逐步搭建。
>
> 设计决策 / 踩坑记录 / 面试要点见 [DESIGN.md](DESIGN.md)。

## 成员（动物们）

| 动物 | 名字（别名） | 背后模型 | 定位 |
|---|---|---|---|
| 英国长毛猫 | 福多多（福宝 / 多宝 / 多多） | DeepSeek V4 Pro | 架构统筹 |
| 赤狐 | Dobby | GLM 5.3 | 写码实现、安全审计 |
| 猫头鹰 | Hedwig | DeepSeek V4 Flash | 审查 + 快速测试 |

## 当前状态

**M9 完成 ✅** —— 记忆存储升级（JSON → SQLite + FTS5 全文索引 + BLOB 向量）。

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

Web 端额外支持 **`#workflow`**：

- `#workflow 问题` → 三只按顺序接力，每只看到前面答案；
- `#workflow @福多多 @Dobby 问题` → 按你 @ 的顺序接力；
- 接力过程中，agent 回复里"行首 @" 别人会自动拉起（A2A）。

## 代码结构

| 文件 | 职责 |
|---|---|
| `src/agent-member.ts` | `AgentMember` 接口 + `SendOptions`/`PermissionMode`（核心抽象） |
| `src/claude-member.ts` | `ClaudeCodeMember` 实现——spawn + 流式 + 会话 + 空闲超时 + `--model` |
| `src/stream-events.ts` | stream-json 纯解析函数（可单测，无副作用） |
| `src/session-store.ts` | `SessionStore`——「成员 id → 会话 id」磁盘持久化 |
| `src/history-store.ts` | `HistoryStore`——聊天记录落盘（`GET /history` 读取、`DELETE` 清空） |
| `src/shared-context.ts` | 把聊天历史压成摘要注入成员 prompt（共享时间线） |
| `src/memory-store.ts` | `MemoryStore`——SQLite（`node:sqlite`，零依赖）+ FTS5 全文索引 + BLOB 向量；`keywordSearch`/`semanticSearch`/`hybridSearch` |
| `src/memory.ts` | 记忆纯函数：`extractMemories`（提取）+ `extractKeywords`/`cosineSimilarity`/`mergeHybrid`（无副作用，可单测） |
| `src/embedding.ts` | 智谱 embedding 客户端：`embedTexts`/`embedOne`（env 可覆盖，provider-agnostic） |
| `src/a2a-mentions.ts` | 解析 agent 回复里的"行首 @"（A2A 路由手势） |
| `src/ping-pong.ts` | ping-pong 连击护栏（纯函数，防"踢皮球"死循环） |
| `src/members.ts` | 三只动物的配置（模型 + settings 路径 + 动物人设） |
| `src/index.ts` | CLI 入口：@路由 / @all 广播 / --reset |
| `src/server.ts` | Web 服务 + 串行接力 `runSerial` + A2A `runA2A` |
| `index.html` | 前端单页：@提及路由 + `#workflow` + 消息气泡 + 流式渲染 |
| `src/*.test.ts` | 单元测试（node:test，零额外依赖，60 个） |

## 里程碑

- **M0 单 agent 流式闭环** ✅：`spawn claude -p` → 解析 stream-json → 流式输出。
- **M1 适配器抽象 + 三成员 + 人设** ✅：`AgentMember` 接口；`--append-system-prompt` 注入动物身份。
- **M2 会话持久化** ✅：从 init 事件抓 session_id，`--resume` 自动续接，`--reset` 清空。
- **M3 群聊语义** ✅：`@all` 广播 + 多人 `@` + 权限档位（广播只读、定向可写）。
- **M4 测试 + 打磨** ✅：抽纯函数、单测、空闲超时保护、文档。
- **M5 Web 前端** ✅：Node 原生 http + NDJSON 流式 + 单页 HTML，零依赖。
- **M6 串行接力 + A2A** ✅：`#workflow` 串行接力（每只见前面答案）+ agent 回复里"行首 @" 自动拉起（A2A）+ 四道护栏。
- **M7 结构化记忆** ✅：agent 在回复里写「记忆|类型|内容」自动入库，调 agent 前按相关性召回注入（context 有限 vs memory 持久）。
- **M8 向量化检索** ✅：智谱 embedding（默认 `embedding-2`）给记忆打向量，召回 = 关键词命中优先 + 余弦相似度语义兜底（混合召回），旧记忆启动时自动回填向量。
- **M9 记忆存储升级** ✅：`memory.json` 整文件读写 → SQLite（`node:sqlite`，仍零依赖）；关键词走 FTS5 trigram 索引 + LIKE 兜底短中文词，向量存 BLOB 做余弦召回。

## M6 设计（面试可讲）

- **串行接力**：`runSerial` 依次回答，每只的 prompt = 原始问题 + `[前面成员 answered: 内容]`——"把上一只答案传给下一只"是链的底座。
- **A2A**：`runA2A` 递归——某只答完，解析它回复里的"行首 @"（`parseA2AMentions`，只认行首、最长匹配、过滤自己、最多 2 只），自动拉起被 @ 的成员，交接 prompt 里告诉它"谁在叫你、TA 说了什么"（`directMessageFrom` 语义）。
- **四道护栏**：
  1. 深度上限 `MAX_A2A_DEPTH = 7`（每只两轮 + 收尾的空间，同时挡住无限循环）；
  2. **ping-pong 连击**（`ping-pong.ts`）：无序对 `{from,to,count}`，`≥2` 注入警告、`≥4` 硬拦截、**回复 >200 字视为"实质活动"就重置**——精准掐死"踢皮球"，不误伤"真干活的正常来回"；
  3. 单条回复最多 @ 2 只；
  4. 行首 @ 才路由（正文里顺带提到的 @ 不触发）。

## 亮点

1. **适配器抽象**：`AgentMember` 接口让"加一个新 agent 运行时"变成"加一个实现"（接 Codex = 加 `CodexMember`）。
2. **模型单一真相来源**：`--model` 显式传，`members.ts` 的 `model` 字段决定模型，settings 只存 base_url + token——换模型改一处。
3. **串行接力 + A2A**：从"各答各的"升级到"能接力、能互 @"，配四道护栏防失控。
4. **复用现有 settings 隔离 provider**：每厂商一份 settings，`claude -p --settings <file>` 直接复用。
5. **流式解析**：stream-json 每行一个 JSON 事件，异步逐行读取，边生成边输出。
6. **会话持久化**：从 init 事件抓 session_id，跨轮 `--resume`，成员"有记忆"。
7. **零依赖 Web 层**：原生 http + 单页 HTML，不引框架。
8. **结构化记忆**：教训/决策/事实有类型、持久、按相关性召回（区别于"最近聊天摘要"的临时性）。
9. **向量化检索**：embedding 客户端 provider-agnostic（env 换厂商）；混合召回 = 关键词精确 + 向量语义，互相兜底。
10. **SQLite 存储 + 零依赖**：用 Node 内置 `node:sqlite`（不引第三方原生依赖）；append 不再整文件重写，关键词走 FTS5 索引，规模上来也不怕。

## 踩过的坑

| 坑 | 解决 |
|---|---|
| `--output-format stream-json` 单独用会报错 | 必须配 `--verbose` |
| `claude -p` 会干等 stdin 3 秒 | spawn 时 `stdio: ['ignore', 'pipe', 'pipe']` |
| 同一 message 发两条 `assistant` 事件 | 先 `thinking` 块、再 `text` 块，只取 `type === 'text'` |
| pnpm 11/12 build 脚本默认 deny | `pnpm-workspace.yaml` 用 `allowBuilds` 映射放行 |
| 模型自报"我是 Claude Code" | 用 `--append-system-prompt` 覆盖身份 |
| 权限档位是否真生效 | 实测：`plan` 只输出计划不写文件；`acceptEdits` 能写文件 |
| 测试老打到旧 server（EADDRINUSE） | 测试前 `lsof -ti :3210 \| xargs kill` 清残留 |
| 测试误删真实数据 | 数据目录用 `FAMILIARS_DATA_DIR` 隔离，测试指向临时目录 |
| 智谱 embedding 报 429「余额不足」 | embedding 单独计费（`api/paas/v4`），和 GLM 聊天不共资源包，需单独充值 |
| `embedding-3` 区分度反而不如 `embedding-2` | 中文短文本语义匹配上 embedding-2 相关/无关分得更开（0.42+ vs 0.35-），默认用 embedding-2，阈值标定 0.4 |
| FTS5 对 2 字中文词查不到 | `unicode61` 把无空格中文整句当一个 token，`trigram` 能子串匹配但 <3 字的词无效——用 trigram 做主索引 + `LIKE` 兜底短中文词 |

## 路线图

- ✅ M0 单 agent 流式闭环
- ✅ M1 适配器抽象 + 三个成员 + 动物人设
- ✅ M2 会话持久化
- ✅ M3 群聊语义：@单个 / 广播 + 权限档位
- ✅ M4 打磨 + 测试 + 文档
- ✅ M5 Web 前端（零依赖）
- ✅ M6 串行接力 + A2A 协作
- ✅ M7 结构化记忆
- ✅ M8 向量化检索
- ✅ M9 记忆存储升级（SQLite + FTS5）

## 已知限制 / 后续

见 [TODO.md](TODO.md) —— 接入 Codex、Markdown 渲染、liveness probe（区分卡死/忙）等。
