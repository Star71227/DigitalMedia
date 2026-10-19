# LearnMate 本地大模型 Agent 接入与测试说明

## 一键启动

双击项目根目录的 `启动LearnMate本地AI全套.bat`。脚本会：

1. 检查 `http://127.0.0.1:8000/v1/models`；
2. 未启动时打开独立模型窗口并加载 `Qwen3-VL-2B-Instruct + LearnMate LoRA`；
3. 最长等待 8 分钟，模型就绪后重启后端、学生端和教师端；
4. 打开学生端 `http://127.0.0.1:5173` 和教师端 `http://127.0.0.1:5174`。

如果 WSL2 的 NAT/防火墙没有把 8000 端口转发给 Windows，脚本会自动识别 WSL 私有地址，并弹出一次 Windows 管理员确认来建立 `127.0.0.1:8000` 本地桥接。此确认只用于本机 8000 端口转发；选择“是”后脚本会继续，无需手输命令。

模型首次加载会明显慢于普通网页服务。看到模型窗口出现 OpenAI API 已监听 8000 端口，或浏览器访问 `http://127.0.0.1:8000/v1/models` 返回模型列表，才表示模型可调用。

## 架构与数据边界

浏览器只访问 Node 后端 `5800`；后端负责登录鉴权、学生数据隔离、知识检索、Agent 编排、输出校验和记录，随后通过 OpenAI 兼容协议调用本机 `8000` 模型 API。MySQL 保存资料、错题、会话、路径、测验和复习计划。课程资料与个人资料先由后端检索，再作为证据交给模型；学生私有资料的查询始终带当前 `student_id`。

```text
学生端 5173 / 教师端 5174
              ↓
Node API 5800：鉴权 → 检索 → Agent 编排 → 校验 → 入库
       ↓                         ↓
MySQL 3306                 本地 Qwen API 8000
课程库 + 学生私有库         Qwen3-VL-2B + LoRA
```

## 已接入的 11 个 Agent

| Agent | 项目中的作用 | 主要入口 |
| --- | --- | --- |
| 学习画像智能体 | 从对话、学习记录和表现提取画像 | `POST /api/profile/dialogue/message` |
| 私有知识辅导智能体 | 用课程库、个人资料和历史对话生成带引用回答 | `POST /api/chat` |
| 错题视觉识别智能体 | 识别错题图片、关联教材知识点和错因 | `POST /api/wrong-questions/analyze`、助手上传图片 |
| 学习路径规划智能体 | 汇总画像、错题、资料与提问历史生成路径 | `POST /api/path/generate` |
| 多模态学习资源智能体 | 生成讲义、思维导图、课件、练习包和代码案例 | `POST /api/resources/generate` |
| 资源质量审核智能体 | 检查结构、引用和教学质量，失败时回退 | 资源生成内部链路 |
| 个性化测验智能体 | 按路径、错题和题源生成学生独享测验 | `POST /api/quiz/personalized/generate` |
| 错因反馈智能体 | 根据作答与证据生成错因和下一步建议 | 测验提交、错题分析内部链路 |
| 学习效果评估智能体 | 汇总测验、资源和掌握度形成阶段评估 | `GET /api/student/assessment` |
| 代码解释智能体 | 解释编译、运行、输出和边界问题 | `POST /api/code/explain` |
| 滚动复习调度器 | 根据复习质量计算下一次复习时间 | `GET/POST /api/review/queue...` |

`GET /api/ai-learning/agents` 可查看每个 Agent 的模型、接口和运行期调用次数。`GET /api/ai-learning/model-health` 会真实访问模型 `/v1/models`，因此可以区分“环境变量已配置”和“模型进程真的可用”。两个接口都需要学生登录。

## 学生端验收顺序

1. 登录学生端，在首页“学习状态”确认显示“本地大模型已就绪”和 Agent 数量。
2. 进入“知识图谱/本地知识库”，选择课程并导入 TXT 或 Markdown。页面应显示资料名和知识块数量。
3. 进入“助手”，上传 PNG、JPEG 或 WebP 错题，选择课程后发送。回答应包含识别结果、知识点、错因和课程/个人资料引用。
4. 在“路径”生成个性化学习路径，确认路径会使用画像、错题、资料和历史提问。
5. 在“测验”生成个性化测验；未配置联网搜索时仍保留手动组卷，但联网题源能力会显示未启用。
6. 提交测验或复习结果，随后检查待复习队列是否更新。

## 配置与日志

项目根 `.env` 和 `backend/.env` 是本机私密配置，不进入共享包。组员从 `backend/.env.example` 复制配置，并设置：

```dotenv
AI_ENABLED=true
PATH_PLANNER_AI_ENABLED=true
MULTIMODAL_RESOURCE_AI_ENABLED=true
MULTIMODAL_REVIEW_AI_ENABLED=true
LLM_PROVIDER=local-llamafactory
LLM_API_URL=http://127.0.0.1:8000/v1/chat/completions
LLM_MODEL=Qwen3-VL-2B-Instruct
LLM_VISION_MODEL=Qwen3-VL-2B-Instruct
LLM_TUTOR_MODEL=Qwen3-VL-2B-Instruct
LLM_PLANNER_MODEL=Qwen3-VL-2B-Instruct
LLM_QUIZ_MODEL=Qwen3-VL-2B-Instruct
LLM_TIMEOUT_MS=180000
```

模型日志：`ai-training/logs/local-model-api.log`。网页服务日志由本机启动脚本指定的运行目录保存。共享包不含日志、MySQL 数据、模型基础权重、依赖目录和任何密钥。

## 共享包内容

根目录的 `LearnMate-本地大模型Agent接入包.zip` 包含本次修改的后端、学生端、启动脚本、WSL 端口桥接脚本、训练/推理配置、最终 LoRA 适配器和说明文档。适配器只保留最终文件，不包含 `checkpoint-*`，避免把约 700MB 的中间检查点上传到 Git。基础模型权重不在压缩包内，由 LLaMA Factory/ModelScope 在每台机器上按配置下载。
