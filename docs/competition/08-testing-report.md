# 测试报告

稳定基线：`950711e4956e2da91cc8d98378fac08e47813827`。本报告记录最终集成分支的本轮本机实测，并区分 CI 配置覆盖和尚未完成的 Docker 实机验收。

| 项目 | 命令 | 本轮结果 | 适用环境 | 完整性与限制 |
| --- | --- | --- | --- | --- |
| 后端测试 | `cd backend; npm test` | 138/138 通过 | Node 24 + MySQL | 包含数据库集成、资源进度、六维审核、PPTX/PDF 与安全规则 |
| 学生端 lint | `npm run lint` | 通过 | Node 24 | 完整 TypeScript 检查 |
| 学生端 build | `npm run build` | 通过，2698 modules transformed；数字讲师独立 HTML/CSS/JS chunk | Node 24 | 无 chunk-size warning；生成本地忽略的 `dist`，不提交 |
| 教师端 lint | `npm run lint` | 通过 | Node 24 | 完整 TypeScript 检查 |
| 教师端 build | `npm run build` | 通过，2271 modules transformed | Node 24 | 生成本地忽略的 `dist`，不提交 |
| Release Engineering 专项 | `node --test test/releaseEngineering.test.js` | 15/15 通过 | Node 24 | 覆盖运行时配置、CORS、健康、存储、reset、防泄密与重试 |
| PPTX 验证 | `node --test test/pptxService.test.js test/pptxCitations.test.js test/ppt/visualEngine.test.js` | 5/5 通过 | Node 24 | 检查 ZIP/OOXML、引用、三主题、拆页；不等于人工审美验收 |
| demo reset/seed/verify | `npm run demo:reset`、`demo:seed`、`demo:verify` | 全部通过；verify 17/17 检查通过 | MySQL + PDF 浏览器/字体 | 4 账号、5 类资源、1 个 CodeLab 成功、1 份 approved 报告、3 次检索、13 条引用 |
| PPTX 脚本验证 | `npm run verify:pptx` | 通过 | Node 24 | 三主题各 15 页及兼容主题 2 页；临时目录、OOXML 与文件结构有效 |
| API/浏览器验收 | 健康、登录、学生/教师核心接口与数字讲师 | 通过：学生九个主页面、真实异步生成/SSE、六维审核、教师工作台/班级/资源/报告/学生详情均可用；三端控制台无 warning/error | 后端 + MySQL + 两套前端 | 内置浏览器阻止 SpeechSynthesis，已验证纯文字降级；任务完成过快，活动中刷新由自动化持久化测试覆盖 |
| Docker/Compose | `docker compose config --quiet`、build/up/ps | 未执行 | Docker Engine/Compose v2 | 本机无 docker 命令；静态文件与 CI 配置存在，不等同实机验收 |
| Actionlint | `actionlint` | 未执行 | actionlint | 本机工具缺失 |
| ShellCheck | `shellcheck` | 未执行 | ShellCheck | 本机工具缺失 |
| Gitleaks | `gitleaks detect ...` | 未执行 | Gitleaks | 本机工具缺失；CI 已配置完整历史扫描，不代表本轮通过 |

CI 的 `backend-test` 任务提供 MySQL、初始化数据库、导入知识库和基础题库后运行 `npm test`；`demo-lifecycle` 独立执行 seed、verify 和受保护 reset；两套前端分别 lint/build；另有仓库安全、Gitleaks 和三个 Docker 镜像 build 任务。CI 配置是覆盖范围证据，不应在没有对应运行记录时写成“本轮全部通过”。

## 测试数字口径

- 后端测试数量来自最终集成分支本轮 `node --test` 输出：138/138。
- 知识源/块来自当前仓库文件按现行切分和安全函数静态执行：15/150，安全块 150。
- 本轮 `demo:verify` 实测为 4 个内置账号、5 类资源、5 条资源进度、1 个可形成路径证据的 CodeLab 成功提交、1 份 approved 报告、3 次 RAG 检索和 13 条引用；下次示例仍以当次输出为准。

## 浏览器待处理问题

学生端登录页当前可见“最优学习里程碑”“数据全程进行加密”等表述，但仓库没有对应最优性证明或端到端/静态数据加密专项验收。比赛现场和材料不得复述这些句子；后续应由产品与安全负责人核对后调整前端文案。本任务按文件范围约束未修改前端。

数字讲师在本轮内置浏览器中因 SpeechSynthesis 不可用自动切换为纯文字模式；播放状态、暂停、继续、停止、静音、关闭偏好刷新保留和 390px 无横向溢出均已实测。该结果不等于真实扬声器发声验收。

## Docker 状态

Dockerfile 和 Compose 已完成静态设计、安全检查和配置解析；由于当前机器缺少 Docker Engine，真实镜像构建、四容器启动、卷重启持久化仍待补充验收。
