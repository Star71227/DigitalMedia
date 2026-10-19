# 比赛能力证据矩阵

| 能力 | 代码/数据证据 | 测试/验收证据 | 现场证据 | 状态与边界 |
| --- | --- | --- | --- | --- |
| 七维画像 | profileSchema、studentProfileService | profileAgent 与数据库集成测试 | 画像页、证据、版本 | 已实现；不是心理测评 |
| 真实测验闭环 | quizSubmissionService、题库 JSON | authAndQuiz 集成测试 | 提交、错因、掌握度 | 完整实测需 MySQL |
| 动态路径 | learningPathService/Schema | learningPathSchema 测试 | 路径版本与条件 | 已实现；不宣称全局最优 |
| 八类 Agent | agents/index、agentOrchestrator | Agent/Prompt 测试 | Agent 日志 | 已注册；不是八个聊天 UI |
| 五类资源 | resourceSchema、生成/存储服务 | resourceSchema 与资源集成测试 | 五类资源与审核 | 已实现；完整链路需 MySQL |
| 真 PPTX | pptxService 与语义渲染器 | PPTX、引用、视觉引擎测试 | 预览与下载 | OOXML 自动测试已覆盖；人工视觉另验 |
| RAG 引用 | knowledge、grounded、citation 服务 | knowledge/citation 测试 | 来源、引用、检索记录 | 当前数据结构；15 源/150 块为静态口径 |
| 资源进度与六维审核 | generation jobs/events、SSE、ReviewRules | resourceProgress/resourceReview 测试 | 真实阶段、刷新恢复、审核卡 | 规则必过，AI 可选且不伪造分数 |
| CodeLab | exercise/runner/submission 服务 | 规则与资源集成测试 | exercise ID、run、success | 受限受限运行器 |
| 学生概览/评估 | studentInsightService | studentInsight 测试 | 首页与评估页 | 真实聚合；无效果准确率声明 |
| 教师分析/报告 | analytics/report/access 服务 | teacher 系列测试 | 工作台、学生详情、PDF | 关系隔离；无实时监考 |
| demo 生命周期 | competitionDemoService 与脚本 | demoLifecycle、CI job | verify 摘要 | 只操作 is_demo=1；需受控 MySQL |
| 安全交付 | JWT/CORS/storage/runtime/CI | release engineering 与安全测试 | 健康与权限拒绝 | 无专业渗透测试 |
| Docker 交付 | Dockerfile、Compose、Nginx | CI 定义镜像 build | compose ps（若成功） | 静态配置完成；实机以报告为准 |
| 数字讲师 MVP | 独立 HTML、原创 SVG/CSS、语音与口型 hooks | TypeScript lint/build；独立分包 | `/digital-tutor.html` 30–35 秒示例 | 已完成隔离 MVP；不是 Live2D 商业数字人，未接入正式主链路 |

## 禁止宣称清单

学校部署、真实用户数量、模型准确率或提升比例、性能/并发指标、专业渗透测试、完整 Live2D 商业数字人、数字讲师已接入正式课程主页面、任意代码安全沙箱、实时监考、全学科覆盖、无当次记录的 Docker 实机通过，均不得作为完成成果表述。
