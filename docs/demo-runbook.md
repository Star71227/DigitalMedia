# 寻笺 LearnMate 比赛现场运行手册

本手册用于比赛现场。账号密码只存在本机 `.env`，由现场负责人分发，不写入本文或投屏日志。

## 讲解前启动

1. 从模板生成 `.env`，填写 `MYSQL_ROOT_PASSWORD`、`DB_PASSWORD`、至少 32 字符的 `JWT_SECRET` 和强 `DEMO_PASSWORD`。
2. 设置 `KNOWLEDGE_IMPORT_ON_START=true`、`SEED_DEMO_DATA=true`、`AI_ENABLED=false`。若该隔离比赛环境需要使用安全复位，必须在首次创建容器前设置 `NODE_ENV=development`；正式生产部署始终保持 `NODE_ENV=production`。
3. 启动并检查：

```powershell
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost:5800/api/health
docker compose exec backend npm run demo:verify
```

健康接口应返回 `status: ok`，数据库和存储均为 `ok`。`demo:verify` 必须以成功退出码结束；失败时不要带病示例。

## 内置账号准备

- 教师：`teacher_demo`
- 学生一：`zhangsan`
- 学生二：`lisi`
- 三个账号均使用现场 `.env` 中的 `DEMO_PASSWORD`

不要在投屏终端执行打印 `.env` 的命令。登录后确认教师角色为 TEACHER、学生角色为 STUDENT。

## 学生端讲解顺序

访问 http://localhost:8080 并使用 `zhangsan`：

1. 登录并查看动态学习画像；
2. 完成一次真实测验，展示反馈与掌握度变化；
3. 查看动态学习路径及当前阶段；
4. 在知识库问答中提出数据结构问题，展开真实引用；
5. 打开思维导图资源；
6. 下载 PPTX，并展示资源进度。

刷新当前子路由一次，确认 SPA 路由与登录恢复正常。

## 教师端讲解顺序

访问 http://localhost:8081 并使用 `teacher_demo`：

1. 查看真实工作台指标与班级学情；
2. 打开张同学详情，展示画像、掌握度、路径、资源与 RAG 活动；
3. 为管理范围内学生生成资源，回到学生端刷新确认可见；
4. 生成学习评估报告并下载 PDF；
5. 展示报告版本、checksum 和智能体运行摘要；
6. 说明学生角色无法访问教师接口。

## 讲解前快速验证

```powershell
docker compose ps
docker compose exec backend npm run demo:verify
docker compose logs --tail 80 backend
```

日志中不应出现密码、完整 JWT、Prompt 或学生完整画像。不要把完整 `docker compose config` 输出投屏或上传。

## 数据被操作乱后的安全复位

复位只允许在启动时已经明确配置为 `NODE_ENV=development` 的隔离比赛现场部署中执行，并提供精确确认值。不要通过 `docker compose exec` 临时覆盖 `NODE_ENV` 绕过生产保护：

```powershell
docker compose exec -e DEMO_RESET_CONFIRM=RESET_LEARNMATE_DEMO backend npm run demo:reset
```

脚本只清理内置账号关联数据，随后自动 seed 和 verify；不会删除知识库基础资料或非内置用户。普通执行、缺少确认值以及 `NODE_ENV=production` 都必须被拒绝。执行后再次运行：

```powershell
docker compose exec backend npm run demo:verify
```

禁止用删卷、清空全表或 `docker compose down -v` 代替示例复位。

## 常见故障

| 现象 | 处理 |
| --- | --- |
| MySQL 长时间不健康 | `docker compose logs --tail 100 mysql`，检查磁盘空间和 `.env`，不要删除卷 |
| 后端不健康 | `docker compose logs --tail 150 backend`，检查数据库、JWT 和存储检查结果 |
| 页面打不开 | 检查 8080/8081 端口占用及 `docker compose ps` |
| 子路由刷新 404 | 确认正在使用容器内 Nginx，而非直接打开 `dist/index.html` |
| 知识库不足 | 运行 `npm run import:knowledge-base` 和 `npm run verify:knowledge-base` |
| PDF 失败 | 检查后端日志中的 Chromium/中文字体错误，不要绕过 PDF 校验 |
| AI 请求失败 | 保持 `AI_ENABLED=false` 使用确定性降级，不在现场临时粘贴密钥 |

## 断网和 AI 降级

镜像已经构建、知识库已经导入时，断网不影响 MySQL、登录、画像、测验、学习路径读取、数据库内 RAG 检索、引用展示、已有 PPTX/PDF 下载和确定性报告。远程讯飞增强会不可用；总开关关闭后系统使用现有确定性路径、资源和审核规则，不应伪造在线 AI 结果。

如需重启，使用 `docker compose down` 后 `docker compose up -d`；命名卷会保留数据和文件。
