# 寻笺 LearnMate 部署指南

本文说明 LearnMate 在单台主机上的 Docker Compose 交付方式。默认启动 MySQL、后端、学生端和教师端；MySQL 只加入容器内部网络，不发布宿主机端口。

每次 push 和 pull request 都会运行 `.github/workflows/ci.yml`：后端 MySQL 集成测试、两套前端 lint/build、仓库与 Gitleaks 安全检查，以及三个 Docker 镜像的构建。CI 不推送镜像，且任一检查失败都会阻止交付通过。

## 1. 准备环境

需要：

- Docker Engine 或 Docker Desktop；
- Docker Compose v2（使用 `docker compose` 命令）；
- 建议至少 4 核 CPU、8 GB 内存和 10 GB 可用磁盘；
- 首次构建镜像时可以访问 npm 与 Docker 镜像仓库。

Windows 建议使用 Docker Desktop 的 Linux 容器模式。Linux 主机需要确保当前用户有权限调用 Docker。

## 2. 配置环境变量

在仓库根目录复制模板，生成只保存在本机的 `.env`：

```powershell
Copy-Item .env.docker.example .env
```

Linux/macOS：

```bash
cp .env.docker.example .env
```

至少填写以下三个生产必填值：

- `MYSQL_ROOT_PASSWORD`：MySQL 管理密码；
- `DB_PASSWORD`：LearnMate 数据库用户密码；
- `JWT_SECRET`：至少 32 个字符的随机字符串。

这些值必须各不相同，不要写进命令行、文档、截图或 Git。`.env` 已被忽略，但仍应在提交前检查 `git status`。`DEMO_PASSWORD` 只用于比赛现场账号；仅当显式启用 `SEED_DEMO_DATA=true` 时设置强密码。

常用非秘密配置：

| 变量 | 默认用途 |
| --- | --- |
| `NODE_ENV` | Compose 模板使用 `production` |
| `DB_NAME` / `DB_USER` | 应用数据库与最小权限应用用户 |
| `JWT_EXPIRES_IN` | JWT 有效期 |
| `CORS_ALLOWED_ORIGINS` | 逗号分隔的学生端、教师端精确 Origin |
| `KNOWLEDGE_IMPORT_ON_START` | 首次启动时幂等导入仓库内知识库 |
| `SEED_DEMO_DATA` | 显式创建或补齐示例数据，默认关闭 |
| `AI_ENABLED` | 远程 AI 总开关，默认关闭 |
| `RESOURCE_STORAGE_DIR` / `REPORT_STORAGE_DIR` | Compose 内固定到独立数据卷；一般无需覆盖 |
| `REPORT_BROWSER_PATH` / `REPORT_FONT_PATH` | 容器内 Chromium 和中文字体路径 |
| `BIND_ADDRESS` | 默认 `127.0.0.1`，避免应用意外暴露到局域网 |

前端环境变量不得包含 JWT、数据库密码或 AI 密钥。容器中的两套前端使用同源 `/api`，由 Nginx 转发给后端。

两套 Nginx 使用 Docker 内置 DNS 动态解析 `backend` 服务；后端容器重建并更换内部地址后，不需要把地址写回前端镜像。

## 3. 构建和启动

先做只验证、不打印展开配置的检查：

```powershell
docker compose config --quiet
```

不要将完整 `docker compose config` 输出上传到工单或比赛材料，因为展开结果可能包含本机环境变量。

构建并后台启动：

```powershell
docker compose up -d --build
docker compose ps
```

正常地址：

- 学生端：http://localhost:8080
- 教师端：http://localhost:8081
- 后端：http://localhost:5800
- 健康检查：http://localhost:5800/api/health

后端只会在 MySQL 健康并完成幂等数据库初始化后启动。学生端和教师端会等待后端健康。首次导入知识库可能延长后端的启动时间。

## 4. 数据库、知识库和示例数据

容器每次启动都会运行可重复的数据库初始化；它不会自动清空或复位已有数据。

手动执行初始化：

```powershell
docker compose exec backend npm run db:init
```

手动幂等导入仓库内数据结构知识库：

```powershell
docker compose exec backend npm run import:knowledge-base
docker compose exec backend npm run verify:knowledge-base
```

创建并验证比赛现场数据：

```powershell
docker compose exec backend npm run demo:seed
docker compose exec backend npm run demo:verify
```

`demo:seed` 从运行时 `DEMO_PASSWORD` 获取密码并使用 bcrypt 存储。它不会打印完整密码。示例数据的安全复位流程见 [demo-runbook.md](demo-runbook.md)。

从没有 `users.is_demo` 标记的旧版数据卷升级时，旧的保留账号会被默认视为普通用户，`demo:seed` 将安全拒绝覆盖。先完成数据库和文件卷备份，停止其他写入，确认四个账号确为历史内置账号且仍使用当前 `DEMO_PASSWORD`，再仅执行一次显式登记：

```powershell
docker compose exec -e DEMO_ADOPT_LEGACY_CONFIRM=ADOPT_LEARNMATE_LEGACY_DEMO backend npm run demo:adopt-legacy
docker compose exec backend npm run demo:seed
docker compose exec backend npm run demo:verify
```

登记命令会逐项核对 username、学号、角色和 bcrypt 密码，任一不符即整批回滚，并向 `agent_run_logs` 写入不含密码的运维审计摘要。正常部署必须让 `DEMO_ADOPT_LEGACY_CONFIRM` 保持为空；该命令不是日常 seed 或 reset 的一部分。

## 5. 停止、重启和更新

停止并删除容器，但保留全部命名卷：

```powershell
docker compose down
```

再次启动会复用数据库、PPTX 资源和 PDF 报告：

```powershell
docker compose up -d
```

更新版本前先备份数据库与两个文件卷，再通过团队批准的 release tag 或 commit 更新工作副本；不要在生产主机直接合并未审查修改。随后重新构建：

```powershell
docker compose build --pull
docker compose up -d
docker compose ps
```

不要执行 `docker compose down -v`，除非已经完成备份，并且明确要销毁全部 LearnMate 数据。

## 6. 数据卷

Compose 项目名固定为 `learnmate`，主要命名卷为：

- `learnmate_mysql_data`：MySQL 数据目录；
- `learnmate_backend_resources`：思维导图与 PPTX 等学习资源；
- `learnmate_backend_reports`：学习评估 PDF。

知识库原始 Markdown 随后端镜像发布，导入后的知识点、来源和 chunk 位于 MySQL，因此不需要第四个可写知识库卷。备份和恢复步骤见 [operations.md](operations.md)。

## 7. 可选的数据库本地调试

主 Compose 不发布 3306。仅在受控本机调试时使用覆盖文件，它也只绑定回环地址：

```powershell
docker compose -f docker-compose.yml -f docker-compose.db-debug.yml up -d mysql
```

调试结束后用主配置重新创建 MySQL 以移除端口映射：

```powershell
docker compose up -d --force-recreate mysql
```

随后确认 MySQL 与后端恢复健康。不要在公网主机使用调试覆盖文件，也不要将 `BIND_ADDRESS` 改为公网地址。

## 8. 生产安全

- 保持 `NODE_ENV=production`，生产环境缺少数据库密码或合格的 `JWT_SECRET` 时后端必须拒绝启动；
- 默认关闭 `SEED_DEMO_DATA`，生产环境不得自动创建内置账号，更不得执行示例复位；
- `AI_ENABLED=false` 时基础认证、画像、测验、路径、知识库检索、确定性资源和报告仍可运行；
- 仅在运行时注入讯飞配置，不要把密钥构建进镜像；
- `CORS_ALLOWED_ORIGINS` 必须列出精确的 HTTPS Origin，不使用 `*` 或 Origin 反射；
- 前端只连接 Nginx `/api`，没有数据库网络、数据库凭据或服务端秘密；
- 后端、学生端和教师端镜像以非 root 用户运行；
- 健康接口只返回状态、版本和时间，不返回路径、密码、密钥或异常堆栈；
- 报告与资源下载仍由后端认证和权限检查保护，不要绕过后端直接发布数据卷。

## 9. Linux 字体和浏览器

后端镜像内置用于 PDF 的 Chromium 与 Noto CJK 字体，Compose 默认路径已配置。若不使用容器运行后端，Linux 主机需要自行安装兼容的无头 Chromium 和中文字体，并设置：

```text
REPORT_BROWSER_PATH=/path/to/chromium
REPORT_FONT_PATH=/path/to/NotoSansCJK-Regular.ttc
```

字体只作为系统包安装在镜像中，不进入 Git 仓库。PDF 失败时先检查后端日志与两个路径，不要关闭文件头、checksum 或权限验证。

## 10. HTTPS 与外部 Nginx

当前 Compose 是单机交付基线，默认仅监听 `127.0.0.1`。正式域名部署应在其前方增加受维护的 HTTPS 反向代理或负载均衡器：

1. TLS 在外层代理终止；
2. 学生域名转发到 8080，教师域名转发到 8081；
3. 保留 `/api` 同源路径；
4. 将两个实际 HTTPS Origin 写入 `CORS_ALLOWED_ORIGINS`；
5. 仅开放 80/443，继续禁止公网访问 MySQL；
6. 设置证书续期、请求体上限和访问日志轮换。

如需在比赛局域网访问，可将 `BIND_ADDRESS` 改为指定的内网网卡地址，并同步 CORS Origin 与主机防火墙；不要无条件使用 `0.0.0.0`。

## 11. 前端分包基线（2026-07-13）

两套前端均以 `React.lazy` 延迟加载路由页面，并按 React、图表、D3、动画和图标依赖进行有限度的稳定分包。构建前后的主入口对比如下：

| 前端 | 优化前主入口 | 优化后主入口 | 登录页初始 JS（优化后） |
| --- | --- | --- | --- |
| 学生端 | 1015.59 kB（gzip 306.32 kB） | 49.75 kB（gzip 16.37 kB） | 402.75 kB（gzip 125.95 kB） |
| 教师端 | 683.83 kB（gzip 199.66 kB） | 14.04 kB（gzip 5.30 kB） | 219.62 kB（gzip 69.11 kB） |

学生端 D3（119.47 kB）与 Recharts（317.14 kB）、教师端 Recharts（432.04 kB）均不在登录页初始加载链中；报告、班级分析、学生详情和资源页也按访问时加载。大小来自同一工作区的正式 Vite 构建输出，后续升级依赖时应重新记录，不应为了追求单个数字继续拆出大量微小 chunk。
