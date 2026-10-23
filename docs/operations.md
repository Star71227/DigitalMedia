# 寻笺 LearnMate 运维手册

本文面向单机 Docker Compose 部署。所有备份应加密、限制访问并定期在隔离环境验证恢复。以下操作均在仓库根目录执行。

## 1. 日常状态与健康检查

查看服务状态：

```powershell
docker compose ps
Invoke-RestMethod http://localhost:5800/api/health
```

查看单个容器的 Docker 健康状态：

```powershell
docker inspect --format '{{json .State.Health}}' $(docker compose ps -q backend)
```

基础健康检查不调用 AI，因此远程模型故障不会把后端判为不健康。

## 2. 日志查看

所有应用日志写到 stdout/stderr，不在容器内维护日志文件。Compose 的 `json-file` 日志按单文件 10 MB、最多 5 个文件轮换：

```powershell
docker compose logs --tail 200 backend
docker compose logs --since 30m mysql
docker compose logs --tail 100 -f student-web teacher-web
```

生产日志应包含 requestId 以便关联错误，但不得记录密码、完整 JWT、AI Key、完整 Prompt 或完整学生画像。导出日志前仍需人工复核脱敏。

## 3. 数据库备份

先创建宿主机受保护的 `backups` 目录。用容器内环境变量完成 dump，避免把密码放到命令参数：

```powershell
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --single-transaction --no-tablespaces --routines --triggers -u"$MYSQL_USER" "$MYSQL_DATABASE" > /tmp/learnmate-backup.sql'
docker compose cp mysql:/tmp/learnmate-backup.sql ./backups/learnmate-backup.sql
docker compose exec mysql rm -f /tmp/learnmate-backup.sql
Get-FileHash ./backups/learnmate-backup.sql -Algorithm SHA256
```

检查备份文件非空，并保存生成时间、应用版本和 SHA-256。备份文件包含个人学习数据，必须加密保存，不能提交到 Git。

## 4. 数据库恢复

先在隔离的 Compose 项目上验证备份。正式恢复前停止会写数据库的应用服务并再做一次当前快照：

```powershell
docker compose stop student-web teacher-web backend
docker compose cp ./backups/learnmate-backup.sql mysql:/tmp/learnmate-restore.sql
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE" < /tmp/learnmate-restore.sql'
docker compose exec mysql rm -f /tmp/learnmate-restore.sql
docker compose start backend
docker compose up -d student-web teacher-web
```

恢复后执行健康检查、`npm run demo:verify`（若该环境包含示例数据）和关键登录回归。不要在未确认目标数据库的情况下导入，也不要用删除数据卷代替恢复。

## 5. 资源与报告存储备份

数据库行与文件需要处于同一维护窗口。停止写入后复制两个独立卷：

```powershell
docker compose stop student-web teacher-web backend
docker compose cp backend:/app/storage/resources ./backups/resources
docker compose cp backend:/app/storage/reports ./backups/reports
docker compose start backend
docker compose up -d student-web teacher-web
```

保存目录清单与 checksum。恢复文件时应在隔离环境或明确为空的新卷中进行，并与同一时间点的数据库备份配套；直接覆盖正在使用的目录可能造成版本或 checksum 不一致。

## 6. 重启服务

重启一个服务：

```powershell
docker compose restart backend
```

配置或镜像改变后应重新创建，而不是只 restart：

```powershell
docker compose up -d --build --force-recreate --wait backend
docker compose up -d student-web teacher-web
```

后端会等待数据库并运行幂等初始化，不会自动 reset 示例数据。

## 7. 磁盘空间与数据卷

```powershell
docker system df
docker volume inspect learnmate_mysql_data
docker volume inspect learnmate_backend_resources
docker volume inspect learnmate_backend_reports
```

重点监控 MySQL 卷、PPTX/PDF 卷和 Docker 构建缓存。清理构建缓存前确认没有影响正在使用的镜像。严禁直接删除三个命名卷；`docker compose down -v` 会造成不可逆的数据丢失。

## 8. 密钥轮换

- `JWT_SECRET`：安排维护窗口，更新 `.env` 后强制重新创建 backend；所有现有 JWT 会失效，需通知用户重新登录。
- 讯飞密钥：在提供方撤销旧密钥，更新 `.env`，重新创建 backend，并验证日志未输出新旧值。
- 数据库密码：MySQL 初始化环境变量只在首次建库时生效。必须先通过不在命令行暴露密码的交互式数据库管理流程修改应用用户，再同步 `.env` 并重新创建 mysql/backend。先验证回滚账号或会话，避免锁死应用。
- `MYSQL_ROOT_PASSWORD`：同样不能只改 `.env`；按 MySQL 官方管理流程轮换并保留受控恢复方案。

轮换后运行健康、登录、资源下载与报告下载测试。不要打印环境变量全集或将 `.env` 复制到聊天、CI Artifact、镜像层中。

## 9. 报告与 PPTX 文件维护

资源和报告路径由后端生成，客户端不能指定。文件与数据库记录、版本号、大小和 SHA-256 关联：

- 不要直接移动、改名或覆盖卷内文件；
- 不要只删除数据库记录或只删除文件；
- 清理策略必须先定义保留期、历史版本要求和审计记录，再通过受限脚本实施；
- 下载异常时检查权限、文件头、大小和 checksum，不要关闭校验；
- 孤立文件清理前先备份，并在事务化清单中确认不再被任何版本引用。

当前发布不提供全局清理命令，避免比赛现场误删私人报告或学生资源。

## 10. 故障处理顺序

1. `docker compose ps` 确认哪个服务不健康；
2. 查看该服务最近 100～200 行日志并记录 requestId；
3. 检查磁盘、数据卷和 `.env` 必填项，但不输出变量值；
4. MySQL 正常后再重启 backend，backend 健康后再启动两套前端；
5. 运行 `/api/health` 和最小登录/下载回归；
6. 若恢复失败，保持卷不动，使用已验证备份在隔离环境重建并升级处置。

不要用删卷、全表清空、`git reset --hard` 或无边界文件删除处理运行故障。
