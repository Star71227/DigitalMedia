# 本地大模型 Agent 接入文件清单

## 团队应提交的文件

- `backend/.env.example`：可共享的本地模型配置示例，不含密钥。
- `backend/src/services/aiService.js`：本地 OpenAI 兼容模型调用、超时、健康探测和调用统计。
- `backend/src/services/agentCatalogService.js`：11 个 Agent 与真实接口、模型角色的统一目录。
- `backend/src/controllers/aiLearningController.js`、`backend/src/routes/aiLearning.js`：Agent 清单与模型健康接口。
- `backend/src/services/agents/**` 及本次修改的生成服务：为每次模型调用标记具体能力，支持运行诊断。
- `frontend-new/src/api.ts`：学生端 AI 闭环接口类型与请求函数。
- `frontend-new/src/components/Dashboard.tsx`：本地模型和 Agent 就绪状态。
- `frontend-new/src/components/MentorView.tsx`：助手内上传错题图片并调用视觉模型。
- `frontend-new/src/components/KnowledgeBaseOverview.tsx`：学生私有 TXT/Markdown 资料导入、列表和删除。
- `backend/test/aiService.localModel.test.js`、`backend/test/aiTutorService.test.js`：本地模型、Agent 清单和辅导链回归测试。
- `ai-training/configs/**`、`ai-training/scripts/**`、`ai-training/data/**`：训练、推理配置和可复现实验数据。
- `ai-training/output/qwen3vl-2b-learnmate-v1/` 顶层文件：最终 LoRA 适配器、分词配置和训练指标。
- `启动LearnMate本地AI全套.bat`、`start-learnmate-ai.ps1`、`configure-wsl-model-port.ps1`：全套启动、WSL 地址探测和必要时的本地端口桥接。
- `重启LearnMate.bat`、`停止LearnMate.bat`、`start-learnmate.ps1`：可移植网页服务启停入口。
- `启动本地模型API.bat`、`start-local-model-api.bat`：只启动模型 API 的入口。
- `backend/docs/AI学习闭环后端接口说明.md`、`docs/本地大模型Agent接入与测试说明.md`：接口与验收说明。

## 明确不共享的内容

- 根目录 `.env`、`backend/.env`：包含本机数据库密码和 JWT 等私密配置。
- `.ai-cache/`：约 3GB 的基础模型下载缓存，每台机器可重新下载。
- `ai-training/output/**/checkpoint-*/`：约 700MB 的中间训练检查点，最终推理不需要。
- `node_modules/`、运行日志、MySQL 数据目录、临时文件。

`.gitignore` 已加入上述缓存、日志和检查点规则，降低 GitHub Desktop 误选大文件的风险。根目录压缩包 `LearnMate-本地大模型Agent接入包.zip` 是便于转交的覆盖包；团队正常协作时仍建议直接提交清单中的源文件。
