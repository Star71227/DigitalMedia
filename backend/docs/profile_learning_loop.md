# 对话式动态画像与测验反馈闭环

## 数据库兼容迁移

后端启动时由 `initLearningProfileDB` 幂等执行。旧版 `users`、`student_profiles` 字段全部保留，仅追加兼容字段和索引。

新增或扩展的数据表：

- `users`：追加 `student_no`、`display_name`、`password_hash`。
- `student_profiles`：追加九维画像、字段证据、完整度和当前版本字段。
- `student_profile_versions`：不可变画像快照及更新依据。
- `profile_dialogue_sessions`、`profile_dialogue_messages`：多轮画像会话。
- `student_learning_events`：画像确认和测验提交事件。
- `student_error_patterns`：按学生、课程、知识点、错误类型累计。
- `quiz_attempts`、`quiz_attempt_answers`：真实测验记录和幂等结果。
- `question_bank.option_error_types`：错误选项到错误类型的确定性映射。

旧版错题、掌握度和代码提交表的 `student_id` 默认值被移除，业务身份只来自 JWT。

## API

除登录和健康检查外，以下接口均要求 `Authorization: Bearer <token>`。

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/auth/login` | 学号/用户名和密码登录 |
| GET | `/api/auth/me` | 当前认证身份 |
| GET/PATCH | `/api/profile/me` | 读取或修改允许的画像字段 |
| GET | `/api/profile/history` | 画像版本历史 |
| GET | `/api/profile/events` | 当前学生真实学习事件 |
| POST | `/api/profile/dialogue/start` | 创建或恢复画像会话 |
| POST | `/api/profile/dialogue/message` | 提交一轮自然语言回答 |
| POST | `/api/profile/dialogue/confirm` | 确认画像并生成版本 |
| GET | `/api/quiz/questions` | 读取不含答案的真实题库题目 |
| POST | `/api/quiz/submit` | 事务判分并完成掌握度、错题、错误模式、画像和推荐闭环 |
| POST | `/api/generate-resource` | 使用最小必要画像上下文生成推荐资源 |

## 测验更新规则

掌握度由确定性规则计算：基础题权重 2、提高/中等题权重 3、综合/困难题权重 4；答对增加 `3 + 权重`，答错减少同样数值，并限制在 0–100。大模型不参与数值评分。

## 示例数据

在 `backend/.env` 配置 `DEMO_PASSWORD` 和 `JWT_SECRET` 后执行：

```bash
npm run seed:learning-loop
```

内置账号 `zhangsan` 的红黑树旋转掌握度会复位为 45。选择题 `DS-RBT-ROTATE-001` 选择 B 后，掌握度应变为 39，产生 `procedure_confusion`，画像版本递增，并推荐分步图解和代码练习。

该复位脚本只清理此示例题产生的数据，不影响其他课程和学生。

## 安全说明

- 密码只保存 bcrypt 哈希。
- JWT 密钥、账号密码和讯飞密钥均来自环境变量。
- 业务接口不接受可信 `student_id` 或前端分数。
- ProfileAgent 输出经过代码围栏清理、JSON 解析、字段白名单、类型校验和置信度保护。
- 讯飞不可用时，只保留学生明确表达的规则提取结果；测验事务不依赖模型。
