# 五类资源生成

## 通用流程

资源请求必须匹配当前学生的真实路径版本和阶段。服务构造包含画像、掌握度、错误模式、阶段目标、时间预算、允许题目 ID 和允许 CodeLab ID 的上下文；候选内容通过严格类型 Schema、规则审核和可选模型审核后，保存资源版本、内容指纹、阶段绑定、进度记录和文件元数据。

## 五类资源

### `study_note`

结构包含个性化目标、基础摘要、核心概念、图示说明、方法/公式、例题、常见错误、练习任务、学习建议和引用依据。学生可在资源中心阅读、推进进度并形成完成证据。个性化依据来自阶段目标、掌握度、错误模式、讲解与资源偏好。

### `mind_map`

树形节点带 `nodeType`、重要度、描述和可选引用；支持跨节点关系、重点节点、易错节点和推荐学习顺序。Schema 限制 8–40 个节点、深度不超过 6、ID 唯一、链接必须指向真实节点。数据结构导图生成时需要检索证据并绑定引用。

### `pptx`

生成可下载、可解压的真实 `.pptx`，不是截图。Schema 要求 6–15 页，至少包含标题、目标、概念、易错点和总结；视觉引擎支持 `academic-light`、`dark-tech`、`warm-paper` 三个稳定主题，以及 title/objectives/concept/process/comparison/misconception/example/code/quiz/summary/next_steps 等语义页。代码中写入 speaker notes、页脚引用和真实参考资料页，并由测试检查 ZIP/OOXML 核心条目、引用及版式拆页。

### `quiz_pack`

包含 5–10 道题、难度分布、生成依据、解析与个性化提示。每个 `questionId` 必须来自当前路径允许的真实题库，题库证据不足时拒绝生成；学生提交进入既有 `/api/quiz/submit` 闭环，由后端判分并更新掌握度/错误模式。

### `code_case`

包含背景、目标、语言、起始代码、任务、输入输出、测试用例、边界、解释、常见错误和进阶挑战。`verified` 必须绑定允许的真实 CodeLab 练习 ID；`generated` 不得冒用 ID。后者完成后为 `completed_unverified`，不能形成路径证据。

## 能力对照表

| 资源类型 | 个性化依据 | 审核 | 版本 | 进度 | 路径证据 | 下载/交互 |
| --- | --- | --- | --- | --- | --- | --- |
| `study_note` | 画像、阶段、掌握度、错因 | Schema + 规则 + 可选 AI | 是 | 打开/阅读/完成 | 满足完成条件时可用 | 页面阅读 |
| `mind_map` | 同上，含推荐顺序和易错点 | Schema + 引用 + 审核 | 是 | 打开/阅读/完成 | 满足完成条件时可用 | 交互查看 |
| `pptx` | 同上，含主题与页面语义 | Schema + 引用 + OOXML 测试 | 是 | 打开/下载/完成 | 满足完成条件时可用 | 真 PPTX 下载与预览 |
| `quiz_pack` | 掌握度、错因、允许题目 | 真实 ID + 难度 + 审核 | 是 | 测验提交 | 由真实测验证据驱动 | 在线作答 |
| `code_case` | 允许练习、基础、目标 | 真实 ID/生成态 + 审核 | 是 | CodeLab 提交 | 仅 verified 且判定成功 | CodeLab 交互 |

资源生成使用数据库锁避免同阶段同类型并发冲突；相同上下文与内容指纹不创建无意义版本。PPTX 文件限制为 25 MiB，保存 SHA-256 和安全相对路径。

## 可解释异步生成

系统使用 `resource_generation_jobs` 与 `resource_generation_events` 持久化任务和阶段事件，初始化幂等且不删除旧表。旧同步调用保持兼容；异步调用由真实后端工作流驱动，不使用前端定时器伪造进度。

- `POST /api/resources/generate`
- `GET /api/resources/jobs/latest`
- `GET /api/resources/jobs/:jobId`
- `GET /api/resources/jobs/:jobId/events`

阶段依次覆盖 `queued`、`profile_analysis`、`learning_context_analysis`、`knowledge_retrieval`、`content_generation`、`deterministic_review`、`ai_review`、`rendering`、`persistence`、`path_linking`、`completed`，失败时进入 `failed`。SSE 事件为 `job`、`stage`、`review`、`resource`、`error`、`complete`、`heartbeat`。任务和事件按认证学生归属读取；页面刷新可恢复持久化快照，SSE 断开不取消后端任务，重连也不会创建新资源，进度单调递增。

PPTX 继续经过“视觉引擎 → 同存储根临时文件 → OOXML 验证 → checksum → 原子保存 → 版本记录”，下载时再次校验文件元数据。
