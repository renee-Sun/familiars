# Familiars 设计笔记 · 面试要点

> 作品集 / 面试用的完整记录：每个里程碑的**改进**、**踩过的坑**、**值得讲的设计点**。
> 与 README 的分工：README 是「快速上手 + 一句话概览」，这里是「面试能展开讲的细节」。

---

## 一、面试值得讲的点（Top 10）

1. **接入的是 agent，不是裸 API**
   - 每个成员是一个真正的 Claude Code CLI 子进程（`claude -p`），保留读代码 / 改文件 / 跑命令的能力；平台只做身份、路由、会话、记忆。
   - 为什么值钱：多 agent 平台难的不是「调多个模型」，而是「让多个有自主能力的 agent 安全协作」。裸 API 没有工具、没有会话、没有权限模型，不是 agent。

2. **`AgentMember` 适配器抽象**
   - 核心接口只有 `send(prompt, opts)` + `reset()`；接一个新 agent 运行时 = 加一个实现（接 Codex = 加 `CodexMember`），不改任何路由逻辑。
   - provider 隔离靠「每厂商一份 settings 文件」，`claude -p --settings <file>` 直接复用。

3. **模型单一真相来源**
   - `--model` 显式传、`members.ts` 的 `model` 字段决定模型；settings 只存 base_url + token。换模型改一处，不散落在 N 份配置里。

4. **子进程流式稳健性**
   - spawn `claude -p --output-format stream-json`，逐行解析 NDJSON，边生成边输出；空闲超时兜底（默认 600s，有事件就重置）。
   - 踩了 4 个坑才跑通（见 M0），这是「真的跑过 CLI 流」才会有的经验，比「调 SDK 的 stream」硬核。

5. **会话持久化：跨轮记忆**
   - 从 init 事件抓 `session_id`，跨轮 `--resume` 自动续接，按成员隔离；`--reset` 清空。

6. **权限模型：人控制，agent 不能自我提权**
   - 广播 = 只读（`--permission-mode plan`），@单个 = 可写（`acceptEdits`）。写文件 / 跑命令的边界由平台按路由决定，不是 agent 自己说了算。

7. **A2A 四道护栏（防"踢皮球"死循环）**
   - 深度上限 7、ping-pong 连击（≥2 警告 / ≥4 拦截 / 回复 >200 字视为「实质活动」重置）、单条最多 @2 只、行首 @ 才路由。
   - 关键洞察：拦无限循环不能只靠深度上限，要能区分「真干活的来回」和「踢皮球」——用「实质活动重置连击」精准掐死后者。

8. **结构化记忆：context vs memory**
   - 教训 / 决策 / 事实三种类型、持久落盘、按相关性召回注入 prompt。
   - 核心区分：context 是有限窗口（临时、被动截断），memory 是持久可检索的知识（主动沉淀）——这是最容易忽略、最能体现架构水平的一层。

9. **向量化检索：混合召回 + 模型选型实测**
   - 召回 = 关键词命中优先（精确）+ 余弦相似度语义兜底（补字面不重合的），互相兜底。
   - 实测发现 `embedding-3`（2048 维）对中文短文本区分度反而不如 `embedding-2`（1024 维），所以默认用 embedding-2、阈值标定 0.4——「不是越新越好，要拿数据说话」。

10. **SQLite 存储 + 零依赖 + 诚实标注边界**
    - 用 Node 内置 `node:sqlite`（不引第三方原生依赖）；append 不再整文件重写，关键词走 FTS5 索引。
    - 向量存 BLOB 做余弦暴搜，代码里明确注释「量再大上 sqlite-vec」——不假装做了向量索引，诚实标注当前边界。

---

## 二、改进 + 坑（按里程碑）

### M0 单 agent 流式闭环 ✅
- **改进**：`spawn claude -p` → 解析 stream-json → 流式输出，终端能看 agent 边想边答。
- **坑**：
  - `--output-format stream-json` 单独用会报错，必须配 `--verbose`；
  - `claude -p` 会干等 stdin 3 秒 → spawn 时 `stdio: ['ignore', 'pipe', 'pipe']`；
  - 同一 message 发两条 `assistant` 事件（先 thinking 块、再 text 块），只取 `type === 'text'`；
  - pnpm 11/12 build 脚本默认 deny → `pnpm-workspace.yaml` 用 `allowBuilds` 放行；
  - 模型自报「我是 Claude Code」→ 后面用 `--append-system-prompt` 覆盖身份。
- **面试点**：子进程流式解析的稳健性（见 Top 4）。

### M1 适配器抽象 + 三成员 + 人设 ✅
- **改进**：`AgentMember` 接口 + `ClaudeCodeMember` 实现 + 三只动物配置 + 人设注入。
- **面试点**：适配器抽象（Top 2）。

### M2 会话持久化 ✅
- **改进**：从 init 事件抓 session_id，`--resume` 续接，`SessionStore` 落盘，`--reset` 清空。
- **坑**：改名/改人设后旧会话（`--resume`）仍带旧人设，需 `--reset` 或清 sessions.json 才彻底生效。
- **面试点**：跨轮记忆、按成员隔离（Top 5）。

### M3 群聊语义 ✅
- **改进**：`@all` 广播 + 多人 `@` + 权限档位。
- **面试点**：权限模型（Top 6）。

### M4 打磨 + 测试 + 文档 ✅
- **改进**：抽纯函数（stream-events 等）、单测、空闲超时保护。
- **面试点**：纯函数可测性——把副作用隔离出去，检索/解析逻辑都能零依赖单测。

### M5 Web 前端 ✅
- **改进**：Node 原生 http + NDJSON 流式 + 单页 HTML，零依赖不引框架。

### M6 串行接力 + A2A ✅
- **改进**：`#workflow` 串行接力（每只见前面答案）+ A2A（行首 @ 自动拉起）+ 四道护栏。
- **面试点**：A2A 护栏（Top 7）；串行接力 = 「把上一只答案传给下一只」是链的底座。

### M7 结构化记忆 ✅
- **改进**：agent 在回复里写「记忆|类型|内容」自动入库，调 agent 前按相关性召回注入。
- **面试点**：context vs memory（Top 8）。

### M8 向量化检索 ✅
- **改进**：智谱 embedding 给记忆打向量，召回 = 关键词 + 语义混合；旧记忆启动时自动回填。
- **坑**：
  - 智谱 embedding 报 429「余额不足」→ embedding 单独计费（`api/paas/v4`），和 GLM 聊天不共资源包，需单独充值；
  - `embedding-3` 区分度不如 `embedding-2`（实测相关 0.42~0.51 vs 无关 0.09~0.35，embedding-2 干净分开）。
- **面试点**：混合召回 + 模型选型实测（Top 9）。

### M9 记忆存储升级（JSON → SQLite）✅
- **改进**：`memory.json` 整文件读写 → SQLite（`node:sqlite`）；关键词走 FTS5 trigram 索引 + LIKE 兜底短中文词；向量存 BLOB。
- **坑**：FTS5 对中文——`unicode61` 把无空格中文整句当一个 token（查 2 字词全空），`trigram` 能子串匹配但对 <3 字的词无效，故 trigram + LIKE 兜底。
- **面试点**：SQLite + 零依赖 + 诚实标注边界（Top 10）；中文全文检索的分词坑。

### M10 召回质量（Clowder 对齐）✅
- **改进**：候选按「向量距离 × 时间衰减」重排（不再关键词优先）+ MMR 多样性去重。三个组件全是纯函数：`computeRecencyFactor`（fractional decay）、`jaccardSimilarity` + `applyMMR`（Carbonell & Goldstein 1998）、`unionById`。
- **发现（重要）**：读 Clowder 源码发现它的 `SemanticReranker` **根本不是 cross-encoder**——只是「FTS 候选按预存向量距离重排」，外加 MMR + 时间衰减两个纯函数（注释原文：*"rerank doesn't replace lexical recall, only reorders"*）。所以没上新模型、零新依赖就对齐了它。
- **面试点**：召回质量 = 查全 vs 查准的平衡；「精排」不一定要 cross-encoder——向量重排 + 多样性 + 时间衰减就解决了大部分问题；cross-encoder 是「比 Clowder 更进一步」的选项。

---

## 三、坑汇总（速查表）

| 坑 | 根因 | 解决 |
|---|---|---|
| `--output-format stream-json` 单独用报错 | CLI 要求 | 必须配 `--verbose` |
| `claude -p` 干等 stdin 3 秒 | 等 stdin EOF | `stdio: ['ignore', 'pipe', 'pipe']` |
| 同一 message 两条 `assistant` 事件 | thinking 块 + text 块 | 只取 `type === 'text'` |
| pnpm 11/12 build 默认 deny | 安全默认 | `pnpm-workspace.yaml` 用 `allowBuilds` |
| 模型自报「我是 Claude Code」 | system prompt 写死身份 | `--append-system-prompt` 覆盖 |
| 旧会话带旧人设 | `--resume` 缓存 | `--reset` 或清 sessions.json |
| 测试老打到旧 server（EADDRINUSE） | 残留进程 | 测试前 `lsof -ti :3210 \| xargs kill` |
| 测试误删真实数据 | 数据目录写死 | `FAMILIARS_DATA_DIR` 隔离，测试指向临时目录 |
| 智谱 embedding 429「余额不足」 | embedding 单独计费 | 单独充值（和 GLM 聊天不共资源包） |
| `embedding-3` 区分度差 | 模型特性 | 默认 `embedding-2` + 阈值 0.4 |
| FTS5 查不到 2 字中文词 | unicode61 整句一 token / trigram <3 字无效 | trigram 主索引 + LIKE 兜底短词 |

---

## 已知差距 / 下一步（对照 Clowder）

- **真正的 cross-encoder 精排（超出 Clowder）**：M10 已做 Clowder 对齐版（向量重排 + MMR + 时间衰减）；若要更准可再加 bge-reranker-v2-m3（cross-encoder）——但 Clowder 本身没有这层，属「比 Clowder 更进一步」。
- **liveness probe**：区分「卡死 vs 忙」（现在只有一刀切超时）。
- **记忆自动化（反思/摘要）**：不靠 agent 手写标记，平台主动把会话压成记忆。
- **向量索引**：余弦暴搜 → sqlite-vec（记忆量级上一个台阶再做）。
