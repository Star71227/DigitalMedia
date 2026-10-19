# 安全与隐私

## 身份与数据边界

- JWT 从 `Authorization: Bearer` 读取并验证；接口再从数据库读取当前角色，避免只信任旧 Token 角色。
- 学生接口使用 JWT 中的 `studentId`，不接受请求体伪造身份；资源、画像、路径、引用和报告按学生 ID 查询。
- 教师接口要求 TEACHER/ADMIN；普通教师还必须通过 active 班级与师生关系检查。
- 班级与师生绑定：只有班级所属教师（或 ADMIN）才能建班、查看成员、增删成员；跨教师访问一律 403。
- 入班申请：学生身份取自 JWT，只能提交和撤回自己的申请，申请本身不产生班级关系；只有班级所属教师或 ADMIN 能审核，通过后在同一个事务里写入 teacher_class_students 并把申请置为 approved，重复审核返回 409。学生端 `GET /api/student/classes` 只按 JWT 中的 userId 返回自己所属的班级与任课教师，不接受任何身份参数，非学生角色返回空列表。
- CORS 在生产环境要求明确 Origin 白名单，拒绝通配符和未知 Origin；JSON 请求体限制 2 MiB。
- 教师端提供自助注册（`TEACHER_REGISTRATION_MODE`，默认 `open`，可置为 `closed` 关闭）。只有 `/api/auth/register-teacher` 会创建 TEACHER 账号，且忽略客户端传入的 `role`；学生注册接口始终只创建 STUDENT。注册接口复用注册限流，账号密码使用 bcrypt 保存。

## 配置与密钥

生产环境缺少数据库密码、合格 JWT 密钥或安全 CORS 配置时拒绝启动。AI 开关默认关闭，星火密钥只通过运行时环境变量注入；仓库禁止提交 `.env`、密钥、密码、私有 PDF/PPTX、`node_modules` 和 `dist`。健康接口只返回状态、版本与时间，不返回路径、密码、密钥或堆栈。

## 示例数据

示例 seed 显式读取 `DEMO_PASSWORD` 并用 bcrypt 保存，不打印完整密码。reset 必须处于非生产环境并携带 `RESET_LEARNMATE_DEMO`，删除用户时附加 `is_demo=1`；预留账号被普通账号占用时 seed 拒绝覆盖。重置过程只处理内置账号及其关联记录和受控文件。

## 文件与容器

资源和报告存储拒绝绝对路径、盘符和 `..` 穿越；文件位于配置根目录内。PPTX 最大 25 MiB，PDF 服务校验 `%PDF-` 文件头；两者保存大小、MIME 和 SHA-256。临时文件和最终文件位于同一文件系统，通过 rename 原子保存；失败时清理临时/已落盘文件。后端、学生端、教师端容器均以非 root 用户运行，启用健康检查和 `no-new-privileges`；MySQL 位于内部网络。

## 工程安全

CI 权限为 `contents: read`，checkout 禁止持久化凭据；仓库安全任务检查未跟踪环境文件、依赖/构建产物、私有 PDF/PPTX、嵌套 Git、遗留模型接入、危险 HTML 渲染和已知模拟业务代码。Gitleaks 扫描完整历史。CI 定义 Docker 镜像构建，但本机实机结果需单独记录。

Agent 日志只向教师端返回摘要；失败详情留在服务端。教师资源备注仅记录是否提供、长度和 SHA-256，不把原始 Prompt 或敏感内容写入验收摘要。没有专业渗透测试证据，因此不得宣称“已通过渗透测试”或“绝对安全”。
