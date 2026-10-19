/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import {
  assignmentApi,
  type TeacherAssignmentDetail,
  type TeacherAssignmentOpenQuestion,
  type TeacherAssignmentQuestion,
  type TeacherAssignmentStudent,
} from "../api/assignments";
import { Metric, PageTitle, State, fmt, pct } from "../components/Ui";
import { navigate } from "../router";

/** 判题状态 → 中文标签；遇到未知状态原样回显，避免后端新增状态时界面报错 */
const CODE_STATUS_LABEL: Record<string, string> = {
  accepted: "全部用例通过",
  wrong_answer: "答案错误",
  compile_error: "编译错误",
  runtime_error: "运行错误",
  timeout: "运行超时",
  output_limit: "输出超限",
  internal_error: "判题异常",
  runner_unavailable: "运行器不可用",
};

function codeStatusLabel(status: string) {
  return CODE_STATUS_LABEL[status] || status || "未知状态";
}

/** 判题环境回显：教师据此判断这次结果是不是真实沙箱里跑出来的 */
function executionModeLabel(mode: string) {
  if (mode === "docker") return "Docker 沙箱";
  if (mode === "local") return "本地运行器";
  return mode;
}

/** 填空题的「正确答案」可能用 | 分隔多个可接受写法（如 递增|升序|有序），拆成「/」展示更好读 */
function acceptedAnswersLabel(answer: string) {
  return String(answer || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" / ");
}

/** 客观题的题型标签；未知题型原样回显，避免后端新增题型时界面出错 */
function questionTypeLabel(questionType: string) {
  if (questionType === "fill_blank") return "填空";
  if (questionType === "single_choice") return "单选";
  return questionType || "单选";
}

export function AssignmentDetailPage({ assignmentId }: { assignmentId: number }) {
  const [data, setData] = useState<TeacherAssignmentDetail>();
  const [error, setError] = useState("");
  // 展开查看学生提交的源码 / 某个学生的逐题作答
  const [openCode, setOpenCode] = useState<string>("");
  const [openStudent, setOpenStudent] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await assignmentApi.detail(assignmentId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "作业统计加载失败");
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 显式标注类型：本项目的 useState 来自无类型的 react 包（未装 @types/react），
  // 不标注的话 data 是 any，后面的字段写错也不会被发现
  const summary = data?.summary;
  const questions: TeacherAssignmentQuestion[] = data?.questions || [];
  const openQuestions: TeacherAssignmentOpenQuestion[] = data?.openQuestions || [];
  const codeExercises = data?.codeExercises || [];
  const students: TeacherAssignmentStudent[] = data?.students || [];
  const codeCount = data?.assignment.codeExerciseCount ?? codeExercises.length;
  const hasCode = codeCount > 0;
  const codeSubmittedCount = summary?.codeSubmittedCount ?? 0;
  const codeAcceptedCount = summary?.codeAcceptedCount ?? 0;
  // questionCount 含单选 + 填空，所以单选题数要减掉填空题数
  const fillBlankCount: number = summary?.fillBlankCount ?? data?.assignment.fillBlankCount ?? 0;
  const openQuestionCount: number = summary?.openQuestionCount ?? openQuestions.length;
  const openAnsweredCount: number = summary?.openAnsweredCount ?? 0;
  const hasOpen = openQuestionCount > 0;
  const singleChoiceCount = Math.max((data?.assignment.questionCount || 0) - fillBlankCount, 0);

  const description = (() => {
    if (!data) return "正在读取作业提交情况。";
    const parts = [data.assignment.className, data.assignment.subject];
    if (data.assignment.questionCount) {
      // 老作业只有单选：保持原来的「单选题 N 道 / 共 N 题」写法不变
      if (!fillBlankCount) {
        parts.push(
          hasCode ? `单选题 ${data.assignment.questionCount} 道` : `共 ${data.assignment.questionCount} 题`,
        );
      } else {
        parts.push(`单选 ${singleChoiceCount} 道 · 填空 ${fillBlankCount} 道`);
      }
    }
    if (hasOpen) parts.push(`简答题 ${openQuestionCount} 道`);
    if (hasCode) parts.push(`代码题 ${codeCount} 道`);
    if (!data.assignment.questionCount && !hasCode && !hasOpen) parts.push("暂无题目");
    parts.push(`截止 ${data.assignment.dueAt ? fmt(data.assignment.dueAt) : "未设置"}`);
    return parts.join(" · ");
  })();

  return (
    <>
      <PageTitle
        title={data?.assignment.title || "作业统计"}
        description={description}
        action={
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm"
            onClick={() => navigate("/assignments")}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            返回作业列表
          </button>
        }
      />

      <State loading={!data && !error} error={error} onRetry={() => void load()}>
        {data && summary && (
          <>
            <div className={`mt-5 grid gap-4 ${hasCode ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
              <Metric label="应交学生" value={summary.studentCount} detail="班级在册学生" />
              <Metric
                label="已提交"
                value={`${summary.submittedCount}/${summary.studentCount}`}
                detail={
                  summary.studentCount
                    ? `提交率 ${pct(Math.round((summary.submittedCount / summary.studentCount) * 100))}`
                    : "暂无学生"
                }
                tone="green"
              />
              <Metric
                label="平均分"
                value={summary.averageScore === null ? "暂无数据" : `${summary.averageScore} 分`}
                detail="已提交学生平均得分"
                tone="blue"
              />
              <Metric
                label="平均正确率"
                value={summary.averageCorrectRate === null ? "暂无数据" : pct(summary.averageCorrectRate)}
                detail="按提交的题目统计"
              />
              {fillBlankCount > 0 && (
                <Metric
                  label="填空题"
                  value={fillBlankCount}
                  detail="学生按文本作答，答案以 | 分隔的多种写法都算对"
                />
              )}
              {hasOpen && (
                <>
                  <Metric
                    label="简答题"
                    value={openQuestionCount}
                    detail="主观题，不参与自动判分"
                    tone="amber"
                  />
                  <Metric
                    label="简答题已交"
                    value={`${openAnsweredCount}/${summary.studentCount}`}
                    detail={
                      summary.studentCount
                        ? `已交 ${pct(Math.round((openAnsweredCount / summary.studentCount) * 100))}，待你评阅`
                        : "暂无学生"
                    }
                    tone="blue"
                  />
                </>
              )}
              {hasCode && (
                <>
                  <Metric
                    label="代码题提交"
                    value={codeSubmittedCount}
                    detail="按「代码题 × 学生」去重累加"
                    tone="amber"
                  />
                  <Metric
                    label="代码题通过"
                    value={codeAcceptedCount}
                    detail={
                      codeSubmittedCount
                        ? `通过率 ${pct(Math.round((codeAcceptedCount / codeSubmittedCount) * 100))}`
                        : "暂无代码提交"
                    }
                    tone="green"
                  />
                </>
              )}
            </div>

            <section
              className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="pending-heading"
            >
              <h2 id="pending-heading" className="text-base font-semibold">
                未提交名单
              </h2>
              {summary.pendingCount === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  全部学生已提交。
                </p>
              ) : (
                <p className="mt-2 flex items-start gap-2 text-sm text-amber-700">
                  <Clock size={16} aria-hidden="true" />
                  还有 {summary.pendingCount} 人未提交：{summary.pendingStudents.join("、")}。
                </p>
              )}
            </section>

            {data.assignment.description && (
              <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                {data.assignment.description}
              </p>
            )}

            <section
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="questions-heading"
            >
              <h2 id="questions-heading" className="text-base font-semibold">
                每题正确率
              </h2>
              <p className="mt-1 text-sm text-slate-500">按已提交学生的作答统计，用于定位全班共性薄弱点。</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">知识点</th>
                      <th className="px-3 py-2">难度</th>
                      <th className="px-3 py-2">作答人数</th>
                      <th className="px-3 py-2">答对人数</th>
                      <th className="px-3 py-2">正确率</th>
                      <th className="px-3 py-2">正确答案</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {questions.map((question, index) => {
                      const isFillBlank = question.question_type === "fill_blank";
                      return (
                        <tr key={question.question_id}>
                          <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                          <td className="px-3 py-2">
                            {question.knowledge_point || question.subject}
                            {isFillBlank && (
                              <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                                填空
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{question.difficulty || "—"}</td>
                          <td className="px-3 py-2">{question.answerCount}</td>
                          <td className="px-3 py-2">{question.correctCount}</td>
                          <td className="px-3 py-2">
                            {question.correctRate === null ? (
                              <span className="text-slate-400">暂无数据</span>
                            ) : (
                              <span className="inline-flex items-center gap-2">
                                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                  <span
                                    className="block h-full rounded-full bg-brand-500"
                                    style={{ width: `${question.correctRate}%` }}
                                  />
                                </span>
                                <span className="font-medium">{question.correctRate}%</span>
                              </span>
                            )}
                          </td>
                          {/* 填空题的正确答案是文本，| 分隔的多个写法拆开更好读 */}
                          <td className={`px-3 py-2 font-semibold ${isFillBlank ? "font-normal" : ""}`}>
                            {isFillBlank ? acceptedAnswersLabel(question.answer) || "—" : question.answer}
                          </td>
                        </tr>
                      );
                    })}
                    {!questions.length && (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                          这份作业没有单选 / 填空题
                          {hasCode ? "，成绩只看代码题判题结果。" : hasOpen ? "，成绩只看简答题评阅。" : "。"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {hasCode && (
              <section
                className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
                aria-labelledby="code-heading"
              >
                <h2 id="code-heading" className="text-base font-semibold">
                  代码题
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  共 {codeCount} 道 CodeLab
                  代码题，逐题列出学生最近一次判题结果；同一学生多次提交只显示最新一次。
                </p>
                <div className="mt-4 grid gap-4">
                  {codeExercises.map((exercise, index) => {
                    const publicCount = Math.max((exercise.caseCount || 0) - (exercise.hiddenCount || 0), 0);
                    return (
                      <article key={exercise.exerciseId} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold">
                              {index + 1}. {exercise.title}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {[
                                exercise.knowledgePoint || exercise.subject,
                                exercise.language,
                                exercise.difficulty,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
                              用例 {exercise.caseCount} 道（公开 {publicCount} · 隐藏 {exercise.hiddenCount}）
                            </span>
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
                              通过 {exercise.acceptedCount}/{exercise.submittedCount}
                            </span>
                          </div>
                        </div>

                        {exercise.description && (
                          <p className="mt-2 text-sm leading-6 text-slate-600">{exercise.description}</p>
                        )}

                        {exercise.submissions.length ? (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50 text-xs text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">学生</th>
                                  <th className="px-3 py-2">结果</th>
                                  <th className="px-3 py-2">通过用例</th>
                                  <th className="px-3 py-2">判题环境</th>
                                  <th className="px-3 py-2">提交时间</th>
                                  <th className="px-3 py-2">作答代码</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {exercise.submissions.map((submission) => (
                                  <Fragment key={submission.submissionId}>
                                    <tr className={submission.accepted ? "" : "bg-amber-50/40"}>
                                      <td className="px-3 py-2 font-medium">{submission.studentName}</td>
                                      <td className="px-3 py-2">
                                        {submission.accepted ? (
                                          <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                                            已通过
                                          </span>
                                        ) : (
                                          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
                                            未通过 · {codeStatusLabel(submission.status)}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 font-semibold">
                                        {submission.passedCount}/{submission.totalCount}
                                      </td>
                                      <td className="px-3 py-2 text-slate-500">
                                        {executionModeLabel(submission.executionMode) || "—"}
                                      </td>
                                      <td className="px-3 py-2 text-slate-500">
                                        {submission.submittedAt ? fmt(submission.submittedAt) : "—"}
                                      </td>
                                      <td className="px-3 py-2">
                                        <button
                                          type="button"
                                          className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                          onClick={() =>
                                            setOpenCode(
                                              openCode === String(submission.submissionId)
                                                ? ""
                                                : String(submission.submissionId),
                                            )
                                          }
                                        >
                                          {openCode === String(submission.submissionId)
                                            ? "收起代码"
                                            : "查看代码"}
                                        </button>
                                      </td>
                                    </tr>
                                    {openCode === String(submission.submissionId) && (
                                      <tr>
                                        <td colSpan={6} className="px-3 pb-4">
                                          <p className="mb-1 text-xs text-slate-500">
                                            {submission.studentName} 提交的{" "}
                                            {submission.language || exercise.language || "c"} 源码：
                                          </p>
                                          {submission.sourceCode ? (
                                            <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100">
                                              {submission.sourceCode}
                                            </pre>
                                          ) : (
                                            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                                              这次提交没有保存源码。
                                            </p>
                                          )}
                                          {submission.compileOutput ? (
                                            <>
                                              <p className="mb-1 mt-2 text-xs text-rose-700">编译输出：</p>
                                              <pre className="max-h-40 overflow-auto rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-700">
                                                {submission.compileOutput}
                                              </pre>
                                            </>
                                          ) : null}
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                            暂无提交：还没有学生提交这道代码题。
                          </p>
                        )}
                      </article>
                    );
                  })}
                  {!codeExercises.length && (
                    <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
                      这道作业挂了代码题但没能读到题面，请稍后重试。
                    </p>
                  )}
                </div>
              </section>
            )}

            {hasOpen && (
              <section
                className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
                aria-labelledby="open-heading"
              >
                <h2 id="open-heading" className="text-base font-semibold">
                  简答题
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  共 {openQuestionCount}{" "}
                  道简答题，没有自动判分：逐题列出每个学生提交的文本作答，需要你自行评阅；标注「未作答」的学生这道题没交。
                </p>
                <div className="mt-4 grid gap-4">
                  {openQuestions.map((question, index) => {
                    return (
                      <article
                        key={question.openQuestionId}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold">
                              {index + 1}. {question.prompt}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {[
                                question.knowledgePoint || question.chapter || question.subject,
                                question.difficulty,
                                question.openQuestionId,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <span className="rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-700">
                            已交 {question.answeredCount}/{students.length}
                          </span>
                        </div>

                        {students.length ? (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50 text-xs text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">学生</th>
                                  <th className="px-3 py-2">状态</th>
                                  <th className="px-3 py-2">作答内容</th>
                                  <th className="px-3 py-2">提交时间</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {students.map((student) => {
                                  const record = (student.openAnswers || []).find(
                                    (item) => item.openQuestionId === question.openQuestionId,
                                  );
                                  return (
                                    <tr key={student.studentId} className={record ? "" : "bg-amber-50/40"}>
                                      <td className="px-3 py-2 align-top font-medium">
                                        {student.displayName}
                                      </td>
                                      <td className="px-3 py-2 align-top">
                                        {record ? (
                                          <span className="rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-700">
                                            待评阅
                                          </span>
                                        ) : (
                                          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
                                            未作答
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 align-top">
                                        {record ? (
                                          <p className="max-w-[560px] whitespace-pre-wrap break-words leading-6 text-slate-700">
                                            {record.answer || "（提交了空作答）"}
                                          </p>
                                        ) : (
                                          <span className="text-slate-400">—</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 align-top text-slate-500">
                                        {record?.submittedAt ? fmt(record.submittedAt) : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                            该班级当前没有在册学生。
                          </p>
                        )}
                      </article>
                    );
                  })}
                  {!openQuestions.length && (
                    <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
                      这道作业挂了简答题但没能读到题干，请稍后重试。
                    </p>
                  )}
                </div>
              </section>
            )}

            <section
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              aria-labelledby="students-heading"
            >
              <h2 id="students-heading" className="text-base font-semibold">
                学生提交情况
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">学生</th>
                      <th className="px-3 py-2">学号/用户名</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">得分</th>
                      <th className="px-3 py-2">答对题数</th>
                      <th className="px-3 py-2">作答明细</th>
                      <th className="px-3 py-2">提交时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map((student) => (
                      <Fragment key={student.studentId}>
                        <tr className={student.submitted ? "" : "bg-amber-50/40"}>
                          <td className="px-3 py-2 font-medium">{student.displayName}</td>
                          <td className="px-3 py-2 text-slate-500">{student.username}</td>
                          <td className="px-3 py-2">
                            {student.submitted ? (
                              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                                已提交
                              </span>
                            ) : (
                              <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
                                未提交
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {student.score === null ? (
                              student.openAnswerCount > 0 ? (
                                // 只交了简答题：没有自动分，显示成 0 会误导，标成待评阅
                                <span className="text-xs font-normal text-sky-700">待评阅</span>
                              ) : (
                                "—"
                              )
                            ) : (
                              `${student.score} 分`
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {student.correctCount === null
                              ? "—"
                              : `${student.correctCount}/${student.totalCount}`}
                          </td>
                          <td className="px-3 py-2">
                            {student.submitted ? (
                              <button
                                type="button"
                                className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                                onClick={() =>
                                  setOpenStudent(openStudent === student.studentId ? null : student.studentId)
                                }
                              >
                                {openStudent === student.studentId ? "收起作答" : "查看作答"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {student.submittedAt ? fmt(student.submittedAt) : "—"}
                          </td>
                        </tr>
                        {openStudent === student.studentId && (
                          <tr>
                            <td colSpan={7} className="bg-slate-50/70 px-3 py-3">
                              {student.answers && student.answers.length ? (
                                <ul className="space-y-1.5 text-xs">
                                  {student.answers.map((answer, index) => {
                                    const question = questions.find(
                                      (item) => item.question_id === answer.questionId,
                                    );
                                    const stem = question?.stem || answer.questionId;
                                    const isFillBlank = answer.questionType === "fill_blank";
                                    return (
                                      <li
                                        key={answer.questionId}
                                        className="flex flex-wrap items-center gap-2"
                                      >
                                        <span className="text-slate-400">第 {index + 1} 题</span>
                                        <span className="rounded-md bg-white px-1.5 py-0.5 text-slate-500">
                                          {questionTypeLabel(answer.questionType)}
                                        </span>
                                        <span className="max-w-[420px] truncate text-slate-700" title={stem}>
                                          {stem}
                                        </span>
                                        {/* 填空题的作答与答案都是文本（正确答案可能是 递增|升序|有序 这种多写法） */}
                                        <span
                                          className={answer.isCorrect ? "text-emerald-700" : "text-rose-700"}
                                        >
                                          学生答：{answer.selectedAnswer || "未作答"}
                                        </span>
                                        <span className="text-slate-500">
                                          正确答案：
                                          {isFillBlank
                                            ? acceptedAnswersLabel(answer.correctAnswer) || "—"
                                            : answer.correctAnswer || "—"}
                                        </span>
                                        <span
                                          className={answer.isCorrect ? "text-emerald-700" : "text-rose-700"}
                                        >
                                          {answer.isCorrect ? "✓ 正确" : "✗ 错误"}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  该学生没有客观题（单选 / 填空）作答记录
                                  {student.openAnswerCount > 0
                                    ? "，只交了简答题（见下面的简答题区块）。"
                                    : "。"}
                                </p>
                              )}
                              {student.openAnswers && student.openAnswers.length > 0 && (
                                <div className="mt-3 border-t border-slate-200 pt-3">
                                  <p className="text-xs font-medium text-slate-600">
                                    简答题作答（共 {student.openAnswers.length} 道，待评阅）
                                  </p>
                                  <ul className="mt-1.5 space-y-1.5 text-xs">
                                    {student.openAnswers.map((item) => {
                                      const prompt =
                                        openQuestions.find(
                                          (question) => question.openQuestionId === item.openQuestionId,
                                        )?.prompt || item.openQuestionId;
                                      return (
                                        <li
                                          key={item.openQuestionId}
                                          className="flex flex-wrap items-start gap-2"
                                        >
                                          <span
                                            className="max-w-[420px] truncate text-slate-500"
                                            title={prompt}
                                          >
                                            {prompt}
                                          </span>
                                          <span className="max-w-[560px] whitespace-pre-wrap break-words text-slate-700">
                                            {item.answer || "（空作答）"}
                                          </span>
                                          <span className="text-slate-400">
                                            {item.submittedAt ? fmt(item.submittedAt) : "—"}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {!students.length && (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                          该班级当前没有在册学生。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </State>
    </>
  );
}
