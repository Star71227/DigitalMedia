# LearnMate 学生端 UI 精确实施计划

本计划只定义下一阶段的改造文件和验收方式。本次 1D.0 不执行这些源码修改。

## 1. 不可变边界

- 保留 React + TypeScript + Vite、当前 `App.tsx` 路由方式和 `lucide-react`。
- 不新增大型 UI 框架，不引入网络字体，不更换整套图标库。
- 不删除、伪造或绕过真实 API，不使用静态假数据替代后端。
- 不修改 CodeLab 和知识图谱后端逻辑；需要后端路由修复时另立任务。
- 不接入数字人，不改 `digitalTutor/`。
- 所有设计支持长中文和 2500 字以上 AI 回答。
- 每次实现只按对应优先级验收，不自动开始下一优先级。

## 2. P0 文件计划

### 全局框架与登录

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/index.css` | 玻璃、渐变、blur、custom scrollbar 和 fade-in 构成全局视觉；无语义 token、reduced motion 和统一 focus | Tailwind v4 import、系统中英文字体回退 | 建立 DESIGN.md 对应颜色/字号/间距/圆角/边框/focus token；移除 glass 工具和装饰动画；添加 reduced motion | 不引入新字体或 UI 框架 | 大量旧 class 依赖 glass 名称 | `rg glass-` 清零或只留兼容过渡；四视口无回归；focus/contrast 人工检查 |
| `frontend-new/src/App.tsx` | 全局 `select-none`、环境光斑、256px 大侧栏、8-10px 元数据、Node/Security 文案、32px 移动按钮、通用整页 chunk loader | 登录恢复、真实 profile 加载、现有 tab/URL、移动抽屉、FocusTimer、logout | 使用安静画布和 224px 侧栏；移除光斑/内部状态；允许文本选择；44px header 控件；`aria-current`；shell 内 skeleton；移动抽屉 Escape/滚动锁 | 不迁移路由，不改 API，不改变 tab id 和 URL | 手写 history 路由易受结构改动影响 | 10 路由直达/前进/后退/刷新；390 菜单键盘可用；长文可选择复制；无 document 溢出 |
| `frontend-new/src/components/Portal.tsx` | 移动端表单在 y≈1328；营销 hero、4 等权卡、渐变文字、空密码恢复链接、label 未关联 | 真实登录提交、内联错误、submitting/disabled、品牌名 | 任务优先登录版式；移动端标题后立即表单；真实 label/id/autocomplete；删除营销卡、渐变和节点文案；移除或接入密码恢复 | 不改变 login 参数和账号规则 | 登录页改动影响首屏品牌展示 | 390 首屏可见账号、密码和提交；键盘顺序正确；空验证保留；无 `href="#"` |

### 首页

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/components/Dashboard.tsx` | 6 张指标卡同权，移动端 1827px；说明文字 10-11px | `getStudentOverview`、真实指标、empty/error/retry、课程和活动 | 首屏改为“今日重点 + 主动作”；6 指标压缩为紧凑证据组；活动和课程按优先级排列；正文至少 14px | 不制造趋势或统计，不删真实字段 | 过度压缩会隐藏重要证据 | 真实数据值一致；empty/error 仍可用；390 首屏看到重点和动作；1440 信息密度不空洞 |

### AI 学习助手合同与长文

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/api.ts` | 没有 chat session 和完整 answer 的前端类型/函数；现有 mentor 只能请求 `{parts}` | 认证 token、`apiRequest`、所有现有资源/画像/路径 API | 增加 create/list/messages/rename/archive session API；定义完整 ChatAnswer；错误携带 status/sessionId/requestId；重试复用 session | 不改后端路径，不删除兼容接口 | 类型与后端 public sanitizer 不一致 | 用真实账号完成 create/list/send/refresh/archive；401/403/503 映射准确；无 token 泄漏 |
| `frontend-new/src/types.ts` | ChatSession 使用 string UUID 和 legacy parts，无法表示真实 session/message/answer | 其他课程、测验、路径类型 | 改为后端 session/message/answer 结构；保留 UI view model 适配层；明确 loading/failed/completed | 不改变无关业务类型 | 类型调整会扩大 Mentor 编译影响 | `npm run lint`；fixtures 只来自真实 API response；历史消息能无损恢复 |
| `frontend-new/src/components/MentorView.tsx` | 本地会话刷新丢失；每次发送不传 sessionId；只读 parts；三栏移动纵向堆叠；text-xs 长文；无 20 秒升级/取消/归档 | 推荐问题、Enter 发送、错误重试、citation、copy、prefill | 加载真实会话/消息；发送复用 sessionId；归档/重命名；渲染 answerMarkdown、notice、source mode、followups、profile suggestions、trace、quality；移动改为消息主区 + 会话/证据 drawer/tab；20 秒状态和草稿保留 | 不在前端伪造回答、followup 或质量；不展示敏感 trace | 会话分页、并发发送、失败重试可能重复写入 | 创建会话后刷新仍在；归档消失；503 保留 prompt；2112 字真实回答无原始 `#`；390 输入常驻可达 |
| `frontend-new/src/components/MarkdownRenderer.tsx` | 已有 renderer 未用于 AI；存在 `border-l-4`，排版字号偏小；解析能力需验证长文 | 标题、段落、代码复制、基础 Markdown | 作为所有 AI/讲义长文统一入口；16px/1.75；68-76ch；表格和代码局部滚动；blockquote 改完整边框/浅底；链接/标题/列表语义 | 不使用 `dangerouslySetInnerHTML`，不新增网络解析服务 | 自定义解析器可能漏掉嵌套列表/代码 fence | 用真实 2500+ 字、C/Java 代码、表格、引用测试；键盘复制；无页面横向溢出 |
| `frontend-new/src/components/knowledge/CitationPanel.tsx` | 单行压缩、彩色左边条、低对比小字、暴露 chunk 细节风险 | 真实 citation label/title/excerpt/support 数据 | 改为答案末尾可折叠参考资料；显示来源标题/章节/摘录；隐藏 chunkId/retrieval id；44px 引用按钮 | 不伪造或重排引用，不删除来源元数据 | 引用数量多时页面变长 | 5 条真实引用可定位/展开；屏幕阅读器名称清楚；无 `border-l-2` |

### 自然语言画像

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/components/ProfileView.tsx` | 9 张同权卡、原始枚举/字段名、证据与历史过长 | `/api/profile/me`、版本、完整度、画像对话、测验跳转 | 按“学习目标、基础、偏好、时间”分组；先显示可行动缺口和最近变化；翻译后端枚举；证据/历史折叠 | 不改画像数据和确认规则 | 翻译映射遗漏新枚举 | 真实 V3 数据不丢；unknown/field key 不直出；390 页面明显缩短 |
| `frontend-new/src/components/profile/ProfileDialogue.tsx` | Agent 术语、进度条无详细语义、缺取消/恢复说明、focus 不统一 | start/message/confirm 真实会话、busy/error/disabled | 改学生语言；保留草稿说明；提交/失败靠近输入；label/id；键盘发送规则；确认前显示缺失项 | 不自动补全画像，不改 sessionId 合同 | 重进页面可能新建对话 | 完成 start/message/confirm；失败不清空输入；键盘和 390 布局通过 |
| `frontend-new/src/components/profile/ProfileConfirmation.tsx` | 摘要只显示 3 项，可能让学生误确认不完整画像 | confirmedProfile 提交和 disabled | 分组展示所有待确认字段，缺失项显式标记；主次按钮和 44px 高度 | 不更改 confirmedProfile 内容 | 长字段在移动端溢出 | 1000 字输入不溢出；确认内容与请求一致 |
| `frontend-new/src/components/profile/ProfileDimensionCard.tsx` | 重复卡片、10-11px evidence/confidence、空值层级弱 | 维度值和 meta | 改为分组 definition list/list row；14px 辅助文本；置信度只在需要时展开 | 不推断空字段 | 去卡片后信息边界不清 | 9 维数据可扫读；空值和证据均可识别；无嵌套卡 |
| `frontend-new/src/components/profile/ProfileEvidence.tsx` | 证据项同权且技术来源直出 | 真实 evidenceSummary | 按字段分组并默认折叠；翻译 source；保留原始值在可选详情 | 不删除证据 | 证据量大时性能/高度 | 至少 20 条证据仍可快速定位；键盘展开 |
| `frontend-new/src/components/profile/ProfileVersionHistory.tsx` | 时间 + sourceType 以 10px 原始枚举显示 | `/api/profile/history` | 翻译来源，使用紧凑 timeline/list；提供 empty/error 区分 | 不改版本排序 | API error 当前被吞为空数组 | API 失败显示 error，不误报 empty；版本顺序一致 |

## 3. P1 文件计划

### 学习路径

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/components/PathView.tsx` | 图谱在当前阶段之前，页面 3000-4407px；raw diff/审核/进度竞争 | 真实 path/generate/version/resources、stage completion、跨页动作 | 当前阶段和唯一下一步前置；阶段列表用 progressive disclosure；图谱/版本移到 tabs；中文化状态 | 不改变路径生成、解锁和完成逻辑 | 重新排序可能隐藏关键证据 | 当前 active stage 首屏可见；6 阶段完整；跨 quiz/resource/CodeLab 参数不变 |

### 资源中心

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/components/ResourceView.tsx` | 5 个生成器同权；生成/浏览/审核/版本/完成同时出现；状态枚举直出 | path context、真实资源、异步任务、版本、完成、下载 | 拆成“推荐/选择类型 -> 生成状态 -> 阅读”三段；默认推荐一类但不自动生成；审核和版本折叠；中文状态 | 不新增假推荐，不删除五类资源 | 流程拆分影响 deep-link prefill | 五类均可达；prefill 选中正确；任务恢复；390 主操作不超过一个 |
| `frontend-new/src/components/resources/GenerationProgressPanel.tsx` | job/agent/connection 等技术字段过多，进度卡嵌套 | 真实 job、stages、failed retry | 主层只显示阶段、人类文案、真实百分比；连接和 agent 放诊断 disclosure；失败保留 retry | 不伪造阶段或百分比 | SSE 状态切换遗漏 | queued/running/completed/failed 逐一截图；断线 fallback 可理解 |
| `frontend-new/src/components/resources/GenerationTimeline.tsx` | 多个同权小卡、10px agent 文案 | stage 顺序和 event message | 改为紧凑 step list；当前/完成/等待同时有文字和图标；隐藏待分配 agent | 不改变 ORDER 和后端 stage key | 长 message 换行 | 10 个阶段长中文不溢出；颜色不是唯一状态 |
| `frontend-new/src/components/resources/ResourcePreview.tsx` | 目标学习者、进度、review、citation 形成多层容器 | 按 resourceType 选择真实 preview、progress、citations | 建立统一文章头和阅读宽度；progress 降级；review/citation 使用 tabs/disclosure | 不改资源 content schema | 各类型结构差异大 | 五类真实资源均渲染；2500 字讲义可读；无嵌套卡 |
| `frontend-new/src/components/resources/StudyNotePreview.tsx` | 彩色浅底和小字多，长文缺统一节奏 | 真实讲义章节和引用 | 使用 Markdown 长文规则、语义 heading/list/callout；重点不靠彩色侧条 | 不改正文内容 | 旧数据结构可能不一致 | 最长真实讲义四视口截图和复制测试 |
| `frontend-new/src/components/resources/MindMapViewer.tsx` | `min-w-[1000px]` 内部画布、btn class 不统一、选中详情卡 | D3/SVG、缩放、全屏、SVG/PNG 导出、citation | 工具条 44px；明确局部横滚/缩放；选中详情为侧栏/底部 sheet；键盘说明 | 不改图谱生成和导出逻辑 | 全屏和移动布局 | 390 局部操作不扩大 document；导出仍成功；Escape 退出全屏 |
| `frontend-new/src/components/resources/PptxPreview.tsx` | 缩略图和内容层级偏密，控件不统一 | 真实 PPT slide canvas、版本和引用 | 统一预览工具条、缩略图选择状态和局部滚动；不改 slide 内容布局 | 不修改 PPTX 生成/下载后端 | 预览与下载样式不一致 | 真实 PPTX 逐页可选，下载仍成功，390 无 document 溢出 |
| `frontend-new/src/components/resources/QuizPackPreview.tsx` | 小字和彩色容器，和每日测验操作关系不清 | 真实 questionId、题目、提交入口 | 明确“预览/开始练习”状态；题目默认折叠；中文 difficulty | 不在前端判分 | 题库 ID 参数可能丢失 | 真实题包跳转后题目匹配，空题包有专用 empty |
| `frontend-new/src/components/resources/CodeCasePreview.tsx` | 多层卡、内部练习 ID 直出、未验证状态层级弱 | verificationStatus、starterCode、test cases、CodeLab 跳转 | 先显示验证状态与学习目标；ID 进详情；代码/测试使用统一组件；verified 才显示主 CTA | 不改变 verification 判定和 CodeLab 后端 | 隐藏 ID 后排障困难 | verified/generated 两状态可区分；真实跳转 exerciseId 不变 |
| `frontend-new/src/components/resources/ResourceReviewPanel.tsx` | 审核规则和模型状态直接占据学习正文 | 真实 review score/issues/checks | 默认显示“可学习/待修订”摘要；完整 rubric 折叠；学生语言映射 | 不隐藏阻断性质量问题 | 过度折叠影响可信度 | failed critical issue 首层可见；完整 evidence 可展开 |
| `frontend-new/src/components/resources/ReviewScoreCard.tsx` | 每维一张小卡和进度轨道，11px 文案 | dimension score/issues | 改为紧凑列表或表格，无背景轨道；文字说明优先 | 不改 score/maxScore | 分数对比可读性 | 6+ 维度在 390 不拥挤，颜色不是唯一标识 |

### 测验

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/components/QuizView.tsx` | 0 题仍计时、提示、交卷；提示触发 TypeError；内部 MySQL/Agent 状态；结果卡墙 | 真实 questions/hint/submit、后端判分、错题/画像更新、题卡、prefill | 明确 idle/loading/active/submitting/result/error 状态机；idle 禁用题目控件和 timer；修复 undefined hint；移除内部状态面板；结果先给结论和下一步 | 不在前端伪造题目/答案/分数，不改 API | 状态重构可能影响 timer 和提交幂等 | idle 无 timer/hint/submit；组卷 5 题；未答完阻止提交；真实提交一次且结果一致 |

## 4. P2 文件计划

| 文件 | 当前问题 | 保留功能 | 计划修改 | 禁止修改 | 风险 | 验收方式 |
|---|---|---|---|---|---|---|
| `frontend-new/src/components/StudentAssessmentView.tsx` | 57 级容器，390px 高 4685px，建议无动作且在底部 | 真实 assessment、证据不足、五类资源、mastery、结论、来源 | 首屏“结论 + 1-2 动作”；section nav；证据折叠；指标改紧凑摘要；14-16px 文本 | 不改变结论和 evidence，不伪造优势 | 折叠后信息可发现性 | 所有 API 字段可展开；390 首屏有行动；空证据路径可达 quiz/CodeLab |
| `frontend-new/src/components/KnowledgeGraph.tsx` | 固定 root 85%、伪 7 日趋势、固定 topics/proficiency、未经证实的图神经网络文案、鼠标专用、8-10px 指标 | D3 图、真实 courses/weakPoints/mastery、搜索、缩放、跨测验 | 删除假趋势和固定熟练度；只显示真实/缺失；增加键盘等价节点列表；翻译指标；状态 loading/error/retry | 不改知识图谱后端逻辑，不新增假数据 | D3 事件与 React 状态耦合 | API 失败明确 error；无固定 85/伪趋势；键盘能选择节点；图谱功能不退化 |
| `frontend-new/src/components/CodeLabView.tsx` | 学生请求 403 被错误显示为后端未启动；“示例模式”主导 | 真实筛选、练习列表、路由和资源/测验跳转 | 区分 401/403/empty/offline；准确恢复文案；统一 44px filter/control；降低示例标签 | 不修改后端路由或练习逻辑 | 后端未修复时仍不可完成任务 | 403 显示权限阻断；后端修复后真实题目自动出现；无假练习 |
| `frontend-new/src/components/CodeLabWorkspace.tsx` | 编辑器和结果多卡，运行器说明与主任务竞争 | 真实 exercise、source、stdin、run、explain、submission | 统一编辑/运行/结果布局、状态和键盘；结果 stdout/stderr 分层；准确标注受限运行器 | 不改 runner 或保存逻辑 | 大文本和移动编辑器 | 真实 exercise 打开、运行、解释；390 局部滚动；错误不丢代码 |
| `frontend-new/src/components/ErrorView.tsx` | 错题卡层级与全局规范不一致，内部状态可能直出 | 真实错题、展开、状态更新、error/retry | 改紧凑列表、统一状态和 focus；把推荐行动前置 | 不改错题状态 API | 展开状态和更新并发 | 真实错题更新后列表一致；empty/error/keyboard 通过 |
| `frontend-new/src/components/FocusTimer.tsx` | 浮动 timer 覆盖内容，存在 bounce、32px 控件和大量复杂视觉 | 计时、暂停、完成回调和学习时长 | 44px 控件；默认折叠到不遮挡安全区；移除 bounce；reduced motion；可访问名称 | 不改时间累计和 onComplete | 全局固定定位跨视口 | 390 不遮主 CTA；键盘完成全流程；时间记录准确 |
| `frontend-new/src/components/ChunkErrorBoundary.tsx` | chunk 失败状态未使用统一 error/recovery 语言 | lazy chunk 错误边界 | 接入统一错误组件，保留 reload 和当前 route 上下文 | 不吞掉错误，不改 lazy loading | reload 循环 | 模拟 chunk failure 后给明确恢复，不退出 shell |

## 5. P3 明确不修改

| 文件/区域 | 决策 | 原因 |
|---|---|---|
| `backend/**` | 本阶段不修改 | 1D.0 和后续 UI 阶段边界；CodeLab 403 单独建后端任务 |
| `frontend-new/src/components/digitalTutor/**` | 不修改、不接入 | 用户明确本轮不接数字人 |
| `frontend-new/src/hooks/useDigitalTutor.ts`、`useAudioLipSync.ts`、`services/ttsService.ts` | 不修改 | 数字人完整链路不在范围 |
| `frontend-new/src/components/resources/ppt/**` | 不修改 slide 内容系统 | 保留真实 PPT 生成与版式，P1 只改 PptxPreview 外壳 |
| `frontend-new/src/components/AssessmentView.tsx` | 不修改 | 当前路由实际使用 StudentAssessmentView，避免整理未使用旧页面扩大范围 |
| `frontend-new/src/components/SimplePlaceholderView.tsx` | 不修改 | 不用静态占位替代真实页面 |

## 6. 跨文件实施顺序

1. `index.css` 和 `App.tsx` 建立 token、shell、focus、motion 与响应式基线。
2. `api.ts`、`types.ts` 先完成 AI 合同，再改 Mentor，避免 UI 继续绑定 legacy parts。
3. 完成 Portal、Dashboard、Profile P0，逐页四视口回归。
4. 完成 Path、Resource、Quiz P1，每页独立提交和真实 API 验收。
5. P2 只在 P0/P1 稳定后执行；CodeLab 和 KnowledgeGraph 只做前端视觉/状态。
6. 每个优先级结束运行 lint/build、真实登录、刷新恢复、console 检查和 `git diff --check`。

## 7. 总体验收清单

- 四视口 10 页面无 document 横向溢出、无文字遮挡、无首要操作出视口。
- 中文正文不低于 14px，长文为 16px/1.75；产品元数据不低于 12px。
- 所有常用交互 44x44px，键盘 focus-visible 清楚。
- 页面有真实 loading/empty/error/disabled/retry，且不会用 success UI 代替未知状态。
- AI 会话创建、列表、恢复、刷新恢复、归档全部走真实后端。
- AI 正确呈现 answerMarkdown、sourceMode、knowledgeNotice、citations、codeBlocks、followups、profileSuggestions、trace、quality。
- 20 秒等待、503、401/403、重试和草稿恢复均有真实验收。
- 测验 idle 不运行计时、不允许提示/交卷；组卷和提交仍使用真实题库和后端判分。
- 不出现固定熟练度、伪趋势、假在线状态、内部 ID/日志和原始枚举。
- 不修改 CodeLab/知识图谱后端逻辑，不接数字人，不新增大型 UI 框架。
