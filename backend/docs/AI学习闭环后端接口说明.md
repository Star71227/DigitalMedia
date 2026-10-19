# LearnMate 大模型学习闭环后端

本实现保留原有手动题库、手动组卷、资源生成、助手、路径和错题接口，并已将本地 `Qwen3-VL-2B-Instruct + LearnMate LoRA` 接入学生端助手、错题识别、学习路径、资源生成、个性化测验、反馈与评估等 Agent。新增接口提供模型健康探测、Agent 清单、图片错题识别、学生私有资料、知识图谱资源框架、路径上下文链、联网个性化测验和滚动复习。

## 1. 模型与联网检索配置

在项目根目录的 `.env` 中填写以下变量。`.env` 已被 Git 忽略，不要把真实密钥提交到仓库。

```dotenv
AI_ENABLED=true
PATH_PLANNER_AI_ENABLED=true

LLM_PROVIDER=local-llamafactory
LLM_API_URL=http://127.0.0.1:8000/v1/chat/completions
LLM_API_KEY=
LLM_MODEL=Qwen3-VL-2B-Instruct
LLM_VISION_MODEL=Qwen3-VL-2B-Instruct
LLM_TUTOR_MODEL=Qwen3-VL-2B-Instruct
LLM_PLANNER_MODEL=Qwen3-VL-2B-Instruct
LLM_QUIZ_MODEL=Qwen3-VL-2B-Instruct
LLM_TIMEOUT_MS=180000

WEB_SEARCH_ENABLED=true
WEB_SEARCH_PROVIDER=generic-json
WEB_SEARCH_API_URL=https://你的搜索服务接口
WEB_SEARCH_API_KEY=你的搜索密钥
WEB_SEARCH_TIMEOUT_MS=12000
```

`LLM_API_URL` 使用 OpenAI 兼容的 Chat Completions 请求格式。本地免密模式只允许 `localhost`、`127.0.0.1` 或 `::1`，不会把未鉴权的远程服务误认为可信本地模型。错题图片识别使用消息中的 `image_url`，因此所选模型必须支持视觉输入。

当 WSL2 NAT 需要使用 `172.16.0.0/12` 私有地址时，一键启动器会临时设置 `LLM_LOCAL_ALLOW_PRIVATE=true`；后端只在该显式开关存在时信任私有 WSL 地址，公网地址仍不允许免密调用。

通用联网检索适配器向 `WEB_SEARCH_API_URL` 发送：

```json
{"query":"数据结构 红黑树 历年真题","count":8}
```

响应可使用 `results`、`items`、`data` 或 `web.results` 数组；每项需要包含 `title`、`url`（或 `link`）以及 `snippet`（或 `description`、`content`）。

## 2. 新增接口

所有接口均需要学生登录后获得的 Bearer Token。

| 功能 | 方法与路径 | 用途 |
|---|---|---|
| 能力状态 | `GET /api/ai-learning/status` | 检查模型、视觉识别、联网搜索和学习闭环是否可用 |
| Agent 清单 | `GET /api/ai-learning/agents` | 返回 11 个 Agent、模型角色、具体接口和本次进程的调用统计 |
| 模型健康探测 | `GET /api/ai-learning/model-health` | 实时探测本地 `/v1/models`，用于学生端显示本地模型是否就绪 |
| 闭环概览 | `GET /api/ai-learning/overview` | 返回资料、错题、提问、路径、个性化题和待复习数量 |
| 上传个人资料 | `POST /api/personal-knowledge/documents` | 写入学生独享的文字资料并自动分块 |
| 列出个人资料 | `GET /api/personal-knowledge/documents` | 仅返回当前学生自己的资料 |
| 删除个人资料 | `DELETE /api/personal-knowledge/documents/:documentId` | 删除资料及其分块 |
| 知识图谱数据 | `GET /api/knowledge/graph?subject=数据结构` | 返回知识点节点、先修关系、课程资源和个人资料框架 |
| 图片/文字错题分析 | `POST /api/wrong-questions/analyze` | 视觉识别后只使用课程知识库与个人资料进行归因，并返回教材引用 |
| 助手内上传错题 | `POST /api/chat` | 在原助手请求中附带 `wrongQuestion`，复用会话、错题入库和引用展示 |
| 联网个性化测验 | `POST /api/quiz/personalized/generate` | 汇总路径、错题、助手历史、个人资料和联网题源，生成当前学生独享题目 |
| 手动组卷 | `GET /api/quiz/questions` | 原接口保留，可读取公共题目和当前学生独享题目 |
| 滚动复习队列 | `GET /api/review/queue` | 返回到期复习任务 |
| 提交复习效果 | `POST /api/review/queue/:itemId/result` | `quality` 为 0–5，按间隔重复算法安排下次复习 |
| 资源分类 | `GET /api/resources/catalog` | 返回清晰的资源分组、生成流程和接口衔接 |

### 上传个人资料

```json
{
  "title": "数据结构课程讲义",
  "fileName": "chapter-4.md",
  "mimeType": "text/markdown",
  "subject": "数据结构",
  "contentText": "这里填写由前端读取或 OCR 提取的资料正文"
}
```

个人资料写入独立的 `student_knowledge_documents` 和 `student_knowledge_chunks` 表。每个检索查询均强制带 `student_id`，不会混入其他学生资料。

### 分析错题

```json
{
  "subject": "数据结构",
  "imageDataUrl": "data:image/png;base64,...",
  "studentAnswer": "B",
  "correctAnswer": "C"
}
```

也可传 `questionText` 代替图片。接口先识别题目，再检索课程教材与当前学生资料，模型只能依据这些证据作答。`T1`、`T2` 表示课程教材引用，`P1`、`P2` 表示个人资料引用。若模型没有返回教材引用，后端拒绝保存结果。

学生端“助手”可直接使用原 `/api/chat` 接口：

```json
{
  "message": "请分析我上传的错题",
  "sessionId": 12,
  "wrongQuestion": {
    "subject": "数据结构",
    "imageDataUrl": "data:image/jpeg;base64,...",
    "studentAnswer": "B",
    "correctAnswer": "C"
  }
}
```

不传 `sessionId` 时自动创建对话。返回结构与普通助手回答一致，并保存教材引用、错题编号和滚动复习提示。

### 生成个性化测验

```json
{
  "subject": "数据结构",
  "knowledgePoint": "红黑树",
  "questionCount": 8,
  "difficulty": "提高"
}
```

联网结果只作为题源线索；模型生成原创改编题，并保存来源 URL、标题和验证时间。后端不会把题目冒充为原版真题。生成题带 `owner_student_id`，其他学生无法读取或提交。

## 3. 完整学习链

1. 学生上传课程资料，后端按学生隔离并切分为私有知识块。
2. 学生上传错题图片，视觉模型完成忠实识别。
3. 后端仅检索课程教材和该学生资料，生成带教材原文引用的错因分析。
4. 错题自动进入错题本和滚动复习队列。
5. 路径生成汇总学习画像、掌握度、错题、个人资料和助手提问记录。
6. 个性化测验根据当前路径和错题触发联网检索，生成带来源的学生独享题目。
7. 测验结果继续更新错题、知识掌握度和路径调整证据，形成下一轮学习闭环。

## 4. 本地验证

启动后端后访问 `http://localhost:5800/api/health`。数据库迁移会自动创建新表并给 `question_bank` 增加学生归属和来源字段。学生端仍为 `http://localhost:5173`，教师端仍为 `http://localhost:5174`。

本地模型未启动时，普通系统仍可启动；`GET /api/ai-learning/model-health` 会返回 `ready: false` 和原因，图片识别和模型组卷会明确返回服务不可用，不会伪造 AI 结果。学生端“学习状态”会显示本地模型就绪情况和启用的 Agent 数量。
