/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 八智能体教学全链路
 * ---------------------------------------------------------------------------
 * 把分散在各自流程里的智能体串成一条完整教学闭环，让「多智能体协作」不只是概念图：
 *
 *   ProfileAgent 学情  →  PlannerAgent 定阶段  →  ResourceAgent 讲义  ⇄  ReviewAgent 审核
 *        →  QuizAgent 出题  ⇄  ReviewAgent 审核  →  AssessmentAgent 评估基线
 *        →  FeedbackAgent 归因与复习建议  →  TutorAgent 答疑要点  →  ReviewAgent 全局终审
 *
 * 共 8 个智能体、包含 3 段「生成→审核→打回重写」闭环，全程写进同一个协作轨迹
 * （agent_run_logs.trace_id），因此学生端/教师端都能回放“这一次协作到底发生了什么”。
 *
 * 设计取舍：每一步都复用各流程已有的智能体，不新增“为了好看而存在”的角色；
 * 审核环节全部基于确定性规则（agentReviewRules），因此闭环判定稳定、可测试、不额外烧 token。
 */
const {
  AssessmentAgent,
  FeedbackAgent,
  PlannerAgent,
  ProfileAgent,
  QuizAgent,
  ResourceAgent,
  ReviewAgent,
  TutorAgent,
} = require("./agents");
const { runLoggedAgent } = require("./agentOrchestrator");
const {
  currentCollaborationSummary,
  recordReviewStep,
  runReviewLoop,
  runWithCollaboration,
} = require("./agentCollaborationService");
const { reviewQuestions, reviewResourceContent } = require("./agentReviewRules");

/** 从模型输出里尽量抠出一个 JSON 对象（模型偶尔会带 Markdown 代码围栏或前后缀） */
function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced ? fenced[1] : raw];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null;
}

function textOf(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * 跑一次八智能体全链路。
 * @returns {Promise<object>} 各智能体产物 + 审核结论 + 协作轨迹摘要
 */
async function runTeachingFullLoop({
  studentId = null,
  subject = "数据结构",
  topic = "",
  difficulty = "基础",
} = {}) {
  const startedAt = Date.now();

  return runWithCollaboration({ pipelineKey: "full_loop", studentId }, async () => {
    const base = { studentId, subject, topic, difficulty };
    const artifacts = {};
    const reviews = {};
    const loops = [];

    // ---- 1. ProfileAgent：先读学情，作为后续所有环节的共享上下文 ----
    artifacts.profile = await runLoggedAgent(
      ProfileAgent,
      "full_loop_profile",
      base,
      [
        `请汇总「${subject}」学习中该学生的画像：`,
        "1) 当前基础水平；2) 最薄弱的 2-3 个知识点；3) 学习偏好与建议起点。",
        "输出 Markdown，控制在 200 字以内。",
      ].join("\n"),
      { agentRole: "profiler" },
    );

    // ---- 2. PlannerAgent：在课程目录约束下定阶段 ----
    artifacts.plan = await runLoggedAgent(
      PlannerAgent,
      "full_loop_plan",
      { ...base, profile: artifacts.profile },
      [
        `请围绕「${topic || subject}」给出本次学习的阶段划分（2-3 个阶段）与先后顺序。`,
        "必须服从课程目录，不要引入目录之外的章节；输出 Markdown 小节。",
      ].join("\n"),
      { agentRole: "planner" },
    );

    // ---- 3+4. ResourceAgent ⇄ ReviewAgent：讲义生成 + 审核 + 打回重写 ----
    const resourcePrompt = [
      `请为「${subject} · ${topic || "当前阶段"}」生成 Markdown 讲义，必须包含章节：`,
      "# 标题",
      "## 学习目标",
      "## 核心概念",
      "## 公式或方法",
      "## 例题讲解",
      "## 易错点",
      "## 巩固练习",
      "## 学习建议",
      "如果知识点适合代码（C 语言 / 数据结构 / Python），请附代码示例。",
    ].join("\n");

    const resourceLoop = await runReviewLoop({
      maxRounds: 2,
      generate: ({ round, feedback }) =>
        runLoggedAgent(
          ResourceAgent,
          "full_loop_resource",
          { ...base, profile: artifacts.profile, plan: artifacts.plan, round: round + 1 },
          feedback.length
            ? `${resourcePrompt}\n\n【上一轮未通过审核，请修正后重写全文】\n${feedback
                .map((message, index) => `${index + 1}. ${message}`)
                .join("\n")}`
            : resourcePrompt,
          { agentRole: "generator" },
        ),
      review: async (draft) => {
        const verdict = reviewResourceContent(draft, { subject, topic: topic || subject });
        reviews.resource = verdict;
        await recordReviewStep({
          agent: "ReviewAgent",
          taskType: "full_loop_resource_review",
          label: `讲义审核（${subject} / ${topic || subject}）`,
          verdict,
          note: "讲义章节完整、篇幅达标、主题贴合且无提示词泄漏",
        });
        return verdict;
      },
    });
    artifacts.resource = resourceLoop.draft;
    loops.push({ stage: "讲义生成", rounds: resourceLoop.rounds, passed: resourceLoop.passed });

    // ---- 5. QuizAgent ⇄ ReviewAgent：据讲义出题 + 结构审核 + 重出 ----
    const quizPrompt = [
      "请根据上面的讲义内容生成一道中文单选题，只输出 JSON 对象，不要使用 Markdown。",
      "字段：question、options（恰好 4 项）、answerIndex（0-3）、explanation。",
    ].join("\n");

    const quizLoop = await runReviewLoop({
      maxRounds: 2,
      generate: ({ feedback }) =>
        runLoggedAgent(
          QuizAgent,
          "full_loop_quiz",
          { ...base, resource: artifacts.resource, reviseFeedback: feedback },
          feedback.length
            ? `${quizPrompt}\n\n【上一轮未通过审核，请修正后重新出题】\n${feedback
                .map((message, index) => `${index + 1}. ${message}`)
                .join("\n")}`
            : quizPrompt,
          { agentRole: "generator" },
        ),
      review: async (draft) => {
        const parsed = parseJsonObject(draft);
        // 注意：题目 JSON 里的 question 字段是**题干文本**；只有它是对象时才当作外层包装
        const raw = parsed
          ? parsed.question && typeof parsed.question === "object"
            ? parsed.question
            : parsed
          : null;
        const verdict = raw
          ? reviewQuestions(
              [
                {
                  stem: raw.question || raw.stem || raw.questionText,
                  options: raw.options,
                  answerIndex: raw.answerIndex,
                  analysis: raw.explanation || raw.analysis,
                },
              ],
              { existingStems: [] },
            )
          : {
              passed: false,
              issues: [{ code: "quiz_unparsable", message: "没有返回可解析的题目 JSON" }],
              checks: {},
            };
        reviews.quiz = verdict;
        await recordReviewStep({
          agent: "ReviewAgent",
          taskType: "full_loop_quiz_review",
          label: `题目审核（${topic || subject}）`,
          verdict,
          note: "题干、4 个选项、正确答案下标与解析均合法",
        });
        return verdict;
      },
    });
    const parsedQuiz = parseJsonObject(quizLoop.draft);
    artifacts.quiz = parsedQuiz ? parsedQuiz.question || parsedQuiz : { raw: textOf(quizLoop.draft) };
    loops.push({ stage: "测验生成", rounds: quizLoop.rounds, passed: quizLoop.passed });

    // ---- 6. AssessmentAgent：给出评估基线 ----
    artifacts.assessment = await runLoggedAgent(
      AssessmentAgent,
      "full_loop_assessment",
      { ...base, profile: artifacts.profile, plan: artifacts.plan },
      "请给出本次学习的评估基线与达标判断口径（学生会拿到这套口径自评），Markdown，200 字以内。",
      { agentRole: "assessor" },
    );

    // ---- 7. FeedbackAgent：归因与下一步复习建议 ----
    artifacts.feedback = await runLoggedAgent(
      FeedbackAgent,
      "full_loop_feedback",
      { ...base, plan: artifacts.plan, assessment: artifacts.assessment },
      "请针对上述阶段给出：最常见的 2 个错因、对应的复习动作、以及下一步安排。Markdown 输出。",
      { agentRole: "generator" },
    );

    // ---- 8. TutorAgent：面向学生的答疑要点 ----
    artifacts.tutor = await runLoggedAgent(
      TutorAgent,
      "full_loop_tutor",
      { ...base, plan: artifacts.plan, resource: artifacts.resource },
      "请面向学生输出「本次学习的答疑要点与易错提醒」，Markdown，300 字以内，不要重复讲义原文。",
      { agentRole: "tutor" },
    );

    // ---- 9. ReviewAgent 终审：确定性地核对整条链路产物是否齐备且互相一致 ----
    const finalIssues = [];
    const required = ["profile", "plan", "resource", "assessment", "feedback", "tutor"];
    for (const key of required) {
      if (textOf(artifacts[key]).trim().length < 40) {
        finalIssues.push({ code: `final_missing_${key}`, message: `「${key}」环节的产物缺失或过短` });
      }
    }
    if (!resourceLoop.passed)
      finalIssues.push({ code: "final_resource_unapproved", message: "讲义在 2 轮内仍未通过审核" });
    if (!quizLoop.passed)
      finalIssues.push({ code: "final_quiz_unapproved", message: "题目在 2 轮内仍未通过审核" });

    const finalVerdict = {
      passed: finalIssues.length === 0,
      issues: finalIssues,
      checks: { artifactCount: required.length },
    };
    reviews.final = finalVerdict;
    await recordReviewStep({
      agent: "ReviewAgent",
      taskType: "full_loop_final_review",
      label: "全链路终审",
      verdict: finalVerdict,
      note: "六个环节产物齐备，两段审核闭环均已通过",
    });

    const agentNames = [
      "ProfileAgent",
      "PlannerAgent",
      "ResourceAgent",
      "ReviewAgent",
      "QuizAgent",
      "AssessmentAgent",
      "FeedbackAgent",
      "TutorAgent",
    ];

    return {
      subject,
      topic: topic || subject,
      difficulty,
      agentCount: agentNames.length,
      agents: agentNames,
      artifacts,
      reviews,
      loops,
      reviewPassed: finalVerdict.passed,
      collaboration: currentCollaborationSummary(),
      durationMs: Date.now() - startedAt,
    };
  });
}

module.exports = { parseJsonObject, runTeachingFullLoop };
