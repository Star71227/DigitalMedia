# LearnMate 学生端真实产品 UI 审计

日期：2026-07-15
目标：`frontend-new/src` 及 `http://127.0.0.1:8080` 真实学生端
方法：dual-agent（A：`design_critique`，B：`rendered_evidence`）+ 主代理接口和源码复核

## 1. 审计边界与完整性

- 根目录：`D:\LearnMate-Rescue`
- 分支：`main`
- 审计前 `git status --short`：空
- 审计后、写文档前 `git status --short`：空
- 后端：本地真实 Node 服务，`http://127.0.0.1:5800/api/health` 返回 `ok`
- 学生端：真实 Vite 页面，`http://127.0.0.1:8080`
- 账号：现有 `zhangsan` 学生账号，密码只从被忽略的本地环境文件读取，未写入报告或截图
- 数据：真实 MySQL、真实 API、真实内置账号数据；未使用 Mock 页面或静态替代数据
- 截图：50 张 PNG，位于被忽略的 `.impeccable/agent-b/screenshots/`，不提交 Git
- 浏览器 overlay：未注入。可用浏览器执行面是只读的，未声明存在可见 overlay
- `.impeccable/critique/ignore.md`：不存在

### 两个子代理的明确分工

**Assessment A：产品与视觉评审**

- 信息层级、任务清晰度、页面一致性、反模板/反 slop、可访问性和响应式判断。
- 独立查看真实页面和相关源码，不读取 detector 或 Assessment B 结论。
- 输出 Nielsen 评分、认知负荷、角色风险、优先问题和源码推断。

**Assessment B：证据收集**

- 只记录实际渲染、四视口尺寸、截图、交互、console、loading/empty/error/disabled、真实 API 和源码合同证据。
- 运行 Impeccable detector，记录规则、位置和可能误报。
- 详细结果只写入 `.impeccable/agent-b/evidence.md`，A 完成前不把结论带回主上下文。

## 2. 运行页面与视口

实际运行并检查：

1. 登录页
2. 学生首页
3. AI 学习助手
4. 学习画像
5. 学习路径
6. 资源生成中心
7. 每日测验
8. CodeLab
9. 知识图谱
10. 学习评估/评估报告

每个页面都由证据代理在以下视口生成完整页面截图：

- `390 x 844`
- `768 x 1024`
- `1280 x 800`
- `1440 x 900`

所有目标页面都没有文档级横向溢出。图谱和思维导图存在约 2199px 或 1000px 以上的内部画布，但被局部容器裁切或滚动，不会扩大 document 宽度。

### 实际页面高度

| 页面 | 390x844 | 768x1024 | 1280x800 | 1440x900 |
|---|---:|---:|---:|---:|
| 登录 | 1811 | 1024 | 800 | 900 |
| 首页 | 1827 | 1316 | 839 | 900 |
| AI 助手 | 901 | 1081 | 800 | 900 |
| 学习画像 | 2556 | 1844 | 1279 | 1258 |
| 学习路径 | 4407 | 3791 | 3000 | 3000 |
| 资源中心 | 4464 | 3404 | 2248 | 2248 |
| 测验 | 1247 | 1159 | 800 | 900 |
| CodeLab | 901 | 1081 | 800 | 900 |
| 知识图谱 | 2797 | 2238 | 1447 | 1447 |
| 评估报告 | 4685 | 3561 | 2487 | 2469 |

## 3. Skill 实际调用结果

### Taste 结果

可用环境没有名为 `redesign-existing-projects` 的 Skill。按用户目标使用了对应的 `design-taste-frontend`，完整读取后只执行 redesign Scan/Diagnose，没有执行 Fix。

Taste 的有效发现：

- 登录页的四张等权能力卡、渐变文字、玻璃容器和环境光斑具有明显营销页模板特征。
- 全局大量圆角卡片、pill、微型大写标签和状态点形成 AI 生成界面的重复语法。
- 页面使用多个无限 pulse、blur 和入场 motion，与 `MOTION_INTENSITY 2-3` 不符。
- 视觉系统没有稳定的圆角上限、阴影边界和色彩职责。
- 移动登录先展示宣传和能力卡，真实登录任务被推到约 `y=1328`。
- 390px 下 AI 三栏按整屏纵向堆叠，不是有效的移动端聊天结构。

Taste 自己明确说明它不适合 dashboard、密集产品 UI、多步骤表单和代码编辑器，因此它只提供反模板和视觉克制证据，不主导产品架构。

### Impeccable 结果

按顺序读取并执行了 `document`、`critique`、`audit` 等价流程，并加载 product register。

Impeccable 的主要发现：

- 产品 UI 最关键的缺陷不是“不够漂亮”，而是组件状态、学生语言、真实合同和任务层级不一致。
- AI 后端已提供持久化会话和完整结构化回答，当前前端只消费兼容 `parts`，造成核心能力不可见。
- 97 处 button 相关源码中，focus-visible、语义状态和可访问命名覆盖不完整。
- 中文正文大量使用 8-12px。源码统计包括 `text-[9px]` 28 处、`text-[10px]` 65 处、`text-[11px]` 41 处。
- `text-slate-400` 出现 103 次，常承担正文或彩色浅底文字，存在系统性低对比风险。
- 页面状态并不全是静态成功态：首页、资源、画像、路径和报告已有真实 loading/error/empty 基础；测验、AI 长等待、图谱失败和 CodeLab 权限状态仍不完整。
- 长文阅读缺少统一正文宽度、Markdown 排版、引用层级和代码块协议。

### 两者共同发现

- 卡片使用过度，且存在卡片内卡片。
- 视觉层级被同权容器、标签和内部状态稀释。
- 字号偏小、灰色偏浅、触控目标偏小。
- 玻璃、渐变、pulse、发光和技术状态文案喧宾夺主。
- 移动端虽然没有 document 横向滚动，但核心任务顺序和纵向长度不合理。
- 蓝色方向可以保留，但必须减少面积、饱和装饰和语义混用。

### 意见冲突与裁决

| 冲突 | 证据 | 最终决策 |
|---|---|---|
| Taste 倾向图片、双主题和替换 Lucide | 这些是营销页规则；项目明确保留 Lucide，且学生工作台以任务内容为主 | 不引入图片装饰、不新增暗色主题、不更换图标库 |
| Taste 默认高 variance/motion | 用户给定 4-5 / 2-3 / 6，产品 register 也要求稳定 | 使用 4-5 / 2-3 / 6 |
| PRODUCT.md 写翠绿点缀，项目约束要求保留蓝色 | 当前前端和用户覆盖规则都以蓝色为品牌方向 | 蓝色为主操作，翠绿只做 success |
| A 判断移动菜单和退出完全失效 | B 成功使用退出；主代理用 DOM 可见控件成功打开菜单；Playwright click 本身超时 | 不列为功能 P0，保留 32px/28px 触控目标和自动化不稳定问题 |
| A 判断长 AI 请求触发静默退出 | B 在同一浏览器会话主动退出，与 A 并发测试重叠；B 后续成功获得真实 2112 字回答 | 不认定认证回归，保留真实 503、草稿恢复和合同缺口 |
| 图谱是最具领域辨识度的页面 | 源码同时包含固定 root 85%、确定性伪 7 日趋势和“图神经网络”表述 | 保留交互图谱形态，删除或明确标记非真实证据，不改后端逻辑 |

## 4. 设计健康度

### Nielsen 评估

| # | Heuristic | Score | 关键问题 |
|---|---|---:|---|
| 1 | 系统状态可见性 | 2 | 多数页面有 loading，但测验空态和 AI 长等待不可信 |
| 2 | 符合真实世界 | 2 | 学术词汇有效，内部枚举、Agent 和数据库术语泄漏 |
| 3 | 用户控制与自由 | 2 | 有导航和重试，但取消、撤销、草稿恢复不足 |
| 4 | 一致性与标准 | 3 | 蓝色与 shell 一致，页面内部模式和状态文案不一致 |
| 5 | 错误预防 | 1 | 0 题测验仍启动计时、提示和交卷 |
| 6 | 识别优于回忆 | 3 | 导航、推荐问题和证据可见性较好 |
| 7 | 灵活与效率 | 1 | 无快捷路径，长页面和嵌套滚动拖慢重复任务 |
| 8 | 美观与极简 | 2 | 内容真实，但卡片、玻璃和元数据噪音过多 |
| 9 | 错误识别与恢复 | 2 | 部分页面有重试，CodeLab 提示不准确，AI 失败缺少会话恢复 |
| 10 | 帮助与文档 | 1 | 说明多为系统实现叙事，不是任务内帮助 |
| **Total** |  | **19/40** | **Poor，需要较大产品化改造** |

认知负荷 8 项中失败 6 项：single focus、chunking、visual hierarchy、one thing at a time、working memory、progressive disclosure。Grouping 和 recognition 是现有优势。

### Technical Audit

| 维度 | 分数 | 主要证据 |
|---|---:|---|
| Accessibility | 1/4 | 未关联 label、无统一 focus-visible、8-11px 文字、32px 控件、D3 鼠标操作、全局 select-none |
| Performance | 2/4 | 路由懒加载是优点；大量 backdrop blur/pulse、D3 大画布和全局动画增加成本 |
| Responsive | 2/4 | 无 document 横向溢出；登录、AI、路径、资源和报告的移动任务顺序与长度仍失败 |
| Theming | 1/4 | 大量硬编码 Tailwind 色值，无语义 token 和完整状态色合同 |
| Anti-Patterns | 0/4 | 玻璃拟态、渐变文字、光斑、等权卡片、pill、微型 uppercase、内部状态和装饰 pulse |
| **Total** | **6/20** | **Poor** |

### Detector 结果

- 扫描文件：64
- warnings：40
- `gray-on-color`：35
- `side-tab`：3
- `bounce-easing`：1
- `gradient-text`：1

`side-tab`、`bounce-easing`、`gradient-text` 为高置信源码命中。压缩为单行的资源组件会让 detector 在同一行配对不同后代或互斥状态的颜色，所以 35 个 `gray-on-color` 需要按真实状态复测，不能全部直接视为 WCAG 失败。

## 5. 页面逐项审计

### 5.1 登录页

- 核心任务：输入现有凭据进入学生工作台。
- 第一眼：品牌、宣传语、四张能力卡；移动端第一屏看不到表单。
- 主操作：桌面清楚；390px 表单起点约 `y=1328`，任务顺序错误。
- 层级/卡片：营销 hero + 4 等权卡 + 登录大卡，偏离产品登录页。
- 字体/留白：10px 英文元数据和大面积宣传占据首屏。
- 溢出：无横向溢出，390px 页面高 1811px。
- 状态：有 submit loading、disabled 和内联 error；空验证真实可用。
- focus：用户名和密码 computed outline 为 none，label 未通过 `htmlFor/id` 关联。
- 术语/内部信息：系统内核、Web-Container-S1、ProfileAgent、v2.5-CS。
- 假数据：在线状态点和节点文案不是可核验用户状态。
- 无响应：`忘记密码？` 是 `href="#"`，只把 URL 变成 `/student#`。
- 保留：真实认证、内联错误、明确登录按钮、系统字体。
- 修改：移动端表单前置，删除营销卡、渐变文字和内部节点，建立真实密码恢复入口或移除链接。

### 5.2 学生首页

- 核心任务：理解当前学习状态并进入今天最重要的行动。
- 第一眼：真实画像版本、薄弱课程、测验和路径操作，现有页面中层级最好。
- 主操作：两个操作较明确，但“今天先做什么”仍可更聚焦。
- 层级/卡片：6 个指标大卡和 2 个下方面板，移动端纵向重复。
- 字体：统计说明多为 10-11px。
- 溢出：无横向溢出，390px 高 1827px。
- 状态：loading、empty、error、retry 均存在；disabled 不适用。
- focus：按钮无统一 focus-visible。
- 术语/内部信息：画像 V3、CodeLab ID 活动可保留简化；全局 footer 仍显示节点和 Security Rules。
- 假数据：主体 API 数据真实。
- 无响应：未发现。
- 保留：个性化开场、真实指标、最近活动、跨页操作。
- 修改：把 6 卡压缩为 1 个今日重点 + 紧凑证据摘要，降低数值装饰感。

### 5.3 AI 学习助手

- 核心任务：提问、阅读长回答、核验引用、继续追问和恢复历史。
- 第一眼：桌面三栏清楚；移动端纵向堆叠三个整屏区域，消息和输入不是首要顺序。
- 主操作：输入和发送明确；会话按钮写“刷新后不保留”，与后端能力冲突。
- 层级/卡片：回答按 Agent 卡片堆叠，长文被切碎；右栏能力说明抢占注意力。
- 字体：正文 `text-xs`，不适合 2500 字阅读。
- 溢出：无 document 溢出；内部固定高度和嵌套滚动明显。
- 状态：empty、disabled send、generic loading、source error/retry 存在；没有 20 秒升级、取消或稍后查看。
- focus：textarea 有边框变化但没有统一 focus ring；复制等小按钮不足 44px。
- 术语/内部信息：Agent 标题、置信度、引用覆盖和检索编号直接暴露。
- 假数据：推荐问题是产品引导，不冒充用户数据；会话 ID 是本地 UUID，不是真实后端会话。
- 无响应：后端 followups 存在时 UI 仍显示“暂无服务端追问建议”。
- 保留：真实 API、引用按钮、Enter/Shift+Enter、错误重试、推荐问题。
- 修改：完整接入会话和回答合同，统一 Markdown 长文、引用、代码、followup、trace 与质量状态。

### 5.4 学习画像

- 核心任务：通过自然语言建立和完善画像，理解证据和版本。
- 第一眼：画像完整度 100%、版本和继续完善按钮，可信度较好。
- 主操作：继续完善明确；九张同权维度卡稀释重点。
- 层级/卡片：9 维卡 + evidence + history，存在卡片墙。
- 字体/留白：证据和置信度使用 10-11px；390px 页面高 2556px。
- 溢出：无横向溢出。
- 状态：loading/error/retry、对话 busy/disabled、确认状态存在；empty 用原始空字符串或“暂无”表达。
- focus：textarea 缺完整 focus-visible；对话缺 Escape/取消或保存草稿说明。
- 术语/内部信息：`unknown`、`procedure_confusion`、`currentCourse`、`quiz_submission` 可在真实数据中出现。
- 假数据：主体来自真实 profile API。
- 无响应：未发现。
- 保留：自然语言对话、证据、字段 confidence、版本历史、确认机制。
- 修改：按“目标、基础、偏好、时间”分组，翻译枚举，突出可行动的缺失项和变化。

### 5.5 学习路径

- 核心任务：知道下一阶段、目标、完成条件和进入动作。
- 第一眼：先看到路径标题、进度和重新评估，随后进入巨大图谱。
- 主操作：真正的当前阶段动作被图谱和热力图推到下方。
- 层级/卡片：图谱、热力图、6 个阶段和版本历史竞争；1280px 页面高 3000px。
- 字体/留白：大量 9-11px 图谱细节和长纵向滚动。
- 溢出：无 document 溢出，内部图谱被容器控制。
- 状态：loading、empty/generate、error、disabled generate 存在。
- focus：阶段 button 可键盘，图节点主要依赖鼠标。
- 术语/内部信息：数据库约束、raw diff、审核分和 progress 状态。
- 假数据：图谱固定 root 85%、伪 7 天趋势和“图神经网络”表述来自源码，不应作为证据。
- 无响应：未发现。
- 保留：真实 path、阶段解锁、completion 合同、跨测验/CodeLab/资源操作、版本历史。
- 修改：当前阶段先行，图谱降为 tab/折叠证据；删除假趋势与原始指标。

### 5.6 资源生成中心

- 核心任务：围绕当前路径阶段生成、选择、阅读并完成一种资源。
- 第一眼：当前阶段后立即出现五张生成器卡，选择压力高。
- 主操作：生成、浏览、重新生成、完成、版本、审核同时出现。
- 层级/卡片：五张等权卡、资源列表、预览和审核嵌套；390px 高 4464px。
- 字体：状态和审核信息大量 10-12px。
- 溢出：无 document 溢出；思维导图/PPT 使用局部滚动。
- 状态：loading/empty/generating/success/partial/error/disabled/retry 覆盖最完整。
- focus：大部分按钮可聚焦，缺统一 focus-visible 和 44px 触控保证。
- 术语/内部信息：`success`、`opened`、`not_started`、review version、agent、job 状态。
- 假数据：资源和版本来自真实 API；不得用静态内容填空的文案值得保留。
- 无响应：未发现。
- 保留：真实异步任务、SSE/poll 状态、版本、审核、进度和五类资源。
- 修改：先选学习目标，再推荐一种主资源；把质量审查、版本和技术状态移入 disclosure。

### 5.7 每日测验

- 核心任务：配置真实题库测验、作答、提交并查看画像变化。
- 第一眼：配置与一个已经运行的空试卷同时出现。
- 主操作：组卷按钮明确，但 `第 1 题 / 0 题`、计时器、AI 提示和交卷已启用。
- 层级/卡片：配置卡、深色 Agent 状态、试卷、答题卡和结果卡叠加。
- 字体：大量 10-11px uppercase 和内部状态。
- 溢出：无横向溢出。
- 状态：loading 有；empty 错误；submit error 有；disabled 不完整。
- focus：select 有局部 ring，按钮无统一 focus-visible。
- 术语/内部信息：QuizAgent、MySQL question_bank、deterministic rules、Student Response loops。
- 假数据：题目来自真实 API；组卷前计时和题号是错误 UI 状态。
- 无响应：0 题点击 AI 提示触发 `TypeError: Cannot read properties of undefined (reading 'hint')`；真实组卷后成功加载 5 题。
- 保留：真实题库、后端判分、错题/画像更新、题卡、hint 和结果证据。
- 修改：建立独立未开始态；无题时禁用提示、交卷和计时；移除内部 Agent 状态面板。

### 5.8 CodeLab

- 核心任务：筛选真实练习、进入编辑器、运行并查看解释。
- 第一眼：标题和筛选清楚，但列表为空并提示后端未启动。
- 主操作：核心练习入口被阻断。
- 层级/卡片：结构相对清楚；仍有“示例模式”和多张卡片。
- 字体：说明和标签偏小。
- 溢出：无 document 溢出。
- 状态：loading/error/empty/disabled 在源码中存在，错误文案不能区分 403 与服务离线。
- focus：select 有 ring，编辑器有 focus；列表为空时无法验证完整键盘流。
- 术语/内部信息：示例模式、样例运行器可以诚实说明，但不应成为主标题。
- 假数据：不新增假练习；dashboard 的历史 `1/1` 与当前 0 题矛盾。
- 无响应：主代理真实请求 `/api/code/exercises` 稳定返回 403。教师 router 的全局 role middleware 在 code router 之前拦截学生请求。
- 保留：现有练习、路由、编辑器、运行器和后端逻辑。
- 修改：本 UI 阶段只提供准确权限错误和状态统一；真实路由修复必须另立后端任务。

### 5.9 知识图谱

- 核心任务：探索知识关联、理解掌握证据并跳转到练习。
- 第一眼：最有计算机学习领域辨识度的页面。
- 主操作：搜索、复位和点节点清楚，但说明是鼠标专用。
- 层级/卡片：图谱、浮动 legend、hover 卡、详情卡、热力图同时存在。
- 字体：8-11px 标签密集，内部 English 指标直接显示。
- 溢出：无 document 溢出，内部 2199px 画布被裁切；390px 页面高 2797px。
- 状态：mastery 请求失败时静默回退，没有明确 loading/error/retry。
- focus：D3 节点缺键盘等价操作或可聚焦列表。
- 术语/内部信息：图神经网络、Dependency Flow、mastery/wrong_count/practice_count、P1/P2。
- 假数据：root 85%、伪 7 日趋势、固定 general topics/proficiency；实际是否出现取决于 course ID 匹配，但源码风险明确。
- 无响应：未发现普通按钮死链。
- 保留：D3 图谱、搜索、缩放、真实 mastery 热力图和跨测验动作。
- 修改：只做视觉/状态统一；移除假趋势和未经证实的算法声明，增加键盘等价列表。

### 5.10 学习评估

- 核心任务：基于真实证据理解掌握度、薄弱点、风险和下一步。
- 第一眼：桌面首屏的真实证据摘要有效。
- 主操作：报告主体没有直接操作按钮，建议位于长页面底部。
- 层级/卡片：约 57 个圆角容器；390px 页面高 4685px。
- 字体：证据和指标大量 10-11px。
- 溢出：无横向溢出。
- 状态：loading/error/retry、evidence insufficient、各 section empty 均存在。
- focus：主报告几乎没有交互，缺 section navigation。
- 术语/内部信息：画像版本、持久化报告版本、原始 evidence 文案可进一步人化。
- 假数据：评估 API 明确不推测缺失数据，是现有优势。
- 无响应：未发现。
- 保留：五类资源证据、掌握图、弱点/错误/优势/风险/建议和数据来源。
- 修改：先给结论和 1-2 个行动，详细证据折叠；增加目录/锚点和跨页行动。

## 6. AI 助手后端合同审计

后端真实路由已具备：

- `POST /api/chat/sessions`
- `GET /api/chat/sessions`
- `GET /api/chat/sessions/:sessionId/messages`
- `PATCH /api/chat/sessions/:sessionId`
- `DELETE /api/chat/sessions/:sessionId`

证据代理通过一次 disposable session 验证 create/list/messages/archive 全部真实可用，且归档后能出现在 archived list。

| 能力 | 后端/API | 当前前端 | 实际渲染 | 结论 |
|---|---|---|---|---|
| 会话创建/列表 | 真实可用 | 只建本地 UUID，不调用列表 | 新对话数刷新后 2 变 1 | 未接入 |
| 会话恢复/刷新恢复 | 真实可用 | 不调用 messages | 刷新丢失 | 未接入 |
| 归档 | 真实可用 | 无调用和按钮 | 无归档入口 | 未接入 |
| `answerMarkdown` | 真实返回，实测 2112 字 | 作为兼容 part.content 间接使用 | `#`/`##` 原样显示 | 错误接入 |
| `sourceMode` | 实测 `deterministic_fallback` | 不读取 | 不显示 | 未接入 |
| `knowledgeNotice` | 实测存在 | 不读取 | 不显示 | 未接入 |
| citations | 实测 5 条 | 兼容 part 支持 | `[S1]` 到 `[S5]` 可见 | 已部分接入 |
| `codeBlocks` | API 支持 | 只支持旧 `part.code` | 非空未实测 | 合同不匹配 |
| followups | 实测 2 条 | 不写入 suggestedFollowups | 错误显示“暂无” | 未接入 |
| `profileSuggestions` | API 支持 | 不读取 | 非空未实测 | 未接入 |
| trace 折叠 | 实测 4 步、collapsed=true | 不读取 | 无 details | 未接入 |
| quality | 实测 passed=false、1 issue | 不读取 | 不显示 | 未接入 |
| 超过 20 秒 | 后端一次回答在 20.5 秒前完成 | 只有无限通用 loading | 无升级或取消 | 未接入 |
| 生成失败 | 后端可返回公开 503 | 有 alert + retry 源码 | 未主动诱发真实失败 | 部分接入 |
| 重试 | 后端需要复用 session | 重试只复用 prompt，不传 sessionId | 会产生新孤立会话风险 | 错误接入 |

主代理另用两次真实问题请求观察到 503 `AI_SERVICE_UNAVAILABLE`，而证据代理成功获得一次 `deterministic_fallback`。这说明前端必须支持成功 fallback 和明确失败两条路径，不能假设环境永远返回同一种状态。

## 7. 证据分类与最终结论

### 两个代理共同确认

- 卡片和圆角容器过多，真实内容被包装层稀释。
- 字体偏小、元数据偏多、学生语言被内部系统语言侵占。
- 移动端无 document 横向溢出，但登录、AI、路径、资源和报告的任务顺序/纵向长度不合理。
- 学习证据、引用、版本历史和领域图谱是必须保留的产品资产。
- AI 会话持久化和结构化回答没有被当前前端正确使用。
- CodeLab 真实入口不可用，测验空状态不安全。

### 仅真实渲染/运行证据支持

- 390px 登录表单约在 `y=1328`。
- 0 题点击 AI 提示触发唯一 app console TypeError。
- 组卷后真实加载 5 道题。
- AI 本地会话刷新从 2 个回到 1 个。
- 2112 字 fallback 回答以原始 Markdown 文本显示，5 个 citation 可见，其他结构化字段缺失。
- 四视口完整页面高度和无 document 横向溢出。
- CodeLab 学生练习请求真实返回 403。

### 仅源码推断

- `App.tsx` 的全局 `select-none` 会阻止选择/复制学习正文。
- 全局 blur/pulse/fade 没有 `prefers-reduced-motion`。
- KnowledgeGraph 固定 root 85%、确定性伪 7 日趋势和固定 proficiency。
- 大量 `text-slate-400` 和 8-11px 字号构成对比和可读性系统风险。
- 多个资源单行组件的 detector 对比命中可能配对错误，需实现阶段逐状态计算。

### 冲突建议

- “移动菜单完全失效”被主复核否决；保留触控尺寸和 focus 问题。
- “AI 请求导致认证退出”被并发登出证据否决；保留真实 503 和草稿/会话恢复问题。
- “保留图谱整体”与“禁止假数据”并不矛盾：保留交互和真实 mastery，删除伪趋势/固定熟练度。

### 最终产品决策

采用“安静的学习工作台”：浅色中性画布、蓝色单一动作色、16px 中文正文、8px 卡片圆角、静止表面无阴影、信息密度 6、状态 motion 2-3。优先打通真实合同和任务层级，再做视觉统一；不引入图片装饰、暗色主题、大型 UI 框架或新图标库。

## 8. P0-P3 改造分类

### P0：明早必须完成

- 全局学生端框架和 token 基线。
- AI 学习助手：会话持久化、结构化回答、Markdown 长文、失败恢复。
- 学生首页：今日重点和紧凑证据。
- 自然语言画像：分组、枚举翻译、对话和确认状态。
- 登录页：移动端表单前置、真实 focus、删除空链接和营销噪音。

### P1：明天下午完成

- 学习路径：当前阶段先行，图谱降级为证据 tab。
- 资源中心：推荐优先、生成/阅读分步、审核详情折叠。
- 测验：修复 0 题状态、提示 crash、禁用合同和内部状态文案。

### P2：提交前有余力处理

- 评估报告：摘要、目录、行动前置、证据折叠。
- 错题本和 FocusTimer 的状态、尺寸与可访问性统一。
- 全项目 contrast、focus、44px 目标和 reduced motion 回归。

### P3：本次不做

- CodeLab 真实运行器和后端路由重构，只允许前端错误状态与视觉统一。
- 知识图谱后端逻辑重构，只处理假趋势、文案、键盘等价入口和视觉状态。
- 数字人接入。
- 路由迁移、框架迁移、大型 UI 框架、暗色主题。

## 9. Run Notes

- Target slug：`frontend-new-src`
- Ignore list：不存在
- Assessment independence：A/B 隔离完成
- CLI detector：完成，40 warnings，exit 2
- Browser visibility：后台执行
- Overlay injection：因只读注入能力不可用而跳过，未声称存在 overlay
- Screenshot cleanup：文件保留在被忽略的 `.impeccable/agent-b/`，不会提交
- Live server cleanup：审计完成后由主代理停止本地服务
- Questions skipped：用户已经明确产品方向、时间优先级、技术边界和禁止项，无需再次询问
