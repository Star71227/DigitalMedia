/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import AsyncState from "./ui/AsyncState";
import MarkdownRenderer from "./MarkdownRenderer";
import {
  apiRequest,
  describeApiError,
  getAssignmentDetail,
  getMyAssignments,
  submitAssignmentCode,
  type AssignmentCodeCase,
  type AssignmentCodeExercise,
  type AssignmentCodeRunResult,
  type AssignmentCodeSubmission,
  type AssignmentDetail,
  type AssignmentQuestion,
  type AssignmentResultItem,
  type AssignmentSummary,
  type QuizSubmitAnswer,
  type QuizSubmissionResult,
} from "../api";

interface Props {
  onNavigateToTab: (tab: string, data?: unknown) => void;
  initialAssignmentId?: number | null;
}

type AnswerMap = Record<string, string>;

/**
 * 作业里的简答题（主观题）：学生端只负责作答，批改结果不下发给学生。
 * 后端已经下发该字段，但 api.ts 的 AssignmentDetail 还没声明，按「只改本文件」的约束在这里就地补充。
 */
interface AssignmentOpenQuestion {
  openQuestionId: string;
  orderIndex: number;
  subject?: string | null;
  chapter?: string | null;
  knowledgePoint?: string | null;
  difficulty?: string | null;
  prompt: string;
  /** 本人已提交的作答文本；尚未提交或后端未回填时为空串。 */
  myAnswer?: string | null;
}

/** 作业详情：在原有结构上补充简答题列表。 */
type AssignmentDetailPayload = AssignmentDetail & {
  openQuestions?: AssignmentOpenQuestion[] | null;
};

/** 填空题：题干用 ____ 占位，作答走自由文本；后端下发的 options 全是空串，不能当选项渲染。 */
function isFillBlank(question: AssignmentQuestion): boolean {
  return question.question_type === "fill_blank";
}

/** 客观题是否已作答：填空题按「去掉首尾空格后非空」判断，其余沿用原来「有没有值」的判断。 */
function isQuestionAnswered(question: AssignmentQuestion, answers: AnswerMap): boolean {
  const value = answers[question.question_id];
  if (isFillBlank(question)) return Boolean(value && value.trim());
  return Boolean(value);
}

/** assignment.openQuestionCount 未在 api.ts 中声明，按可选字段安全读取。 */
function openQuestionCountOf(assignment: AssignmentDetail["assignment"]): number {
  const value = (assignment as unknown as Record<string, unknown>).openQuestionCount;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** 填空题的 correctAnswer 是文本，多解时用「升序|有序|递增」这种竖线分隔，展示时拆开更好读。 */
function formatBlankCorrectAnswer(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "—";
  const parts = text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.join(" / ") : text;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

/** 卡片里的短日期：YYYY/MM/DD，用在「截止」「提交」等标签上。 */
function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} `;
}

/** 卡片摘要：把作业说明压成一行可读的短句（题库列表卡片也是这种 3 行内的摘要）。 */
function summarizeDescription(value: string | null | undefined, maxLength = 96) {
  const text = String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** 判题状态文案：与 CodeLab 保持一致，runner_unavailable 单独措辞以免被误读成学生代码错误。 */
const CODE_STATUS_LABELS: Record<string, string> = {
  accepted: "AC · 全部用例通过",
  wrong_answer: "WA · 答案错误",
  compile_error: "CE · 编译错误",
  runtime_error: "RE · 运行错误",
  timeout: "TLE · 超出时间限制",
  output_limit: "OLE · 输出超过限制",
  runner_unavailable: "判题器暂不可用",
  internal_error: "评测服务异常",
};

function codeStatusLabel(status: string | null | undefined) {
  if (!status) return "暂无判题结果";
  return CODE_STATUS_LABELS[status] || status;
}

/** 判题器不可用属于环境问题，不是学生代码错误，界面要单独提示。 */
function isRunnerUnavailable(status: string | null | undefined) {
  return status === "runner_unavailable";
}

function codeCaseLabel(item: AssignmentCodeCase, index: number) {
  const name = item.name || item.title;
  if (name) return name;
  const order = item.index ?? index + 1;
  return `第 ${order} 组${item.visibility === "hidden" ? "隐藏" : "样例"}用例`;
}

function CodeBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="lm-quiz-code">
      <span>{title}</span>
      <pre>
        <code>{content}</code>
      </pre>
    </div>
  );
}

function InlineNotice({
  tone,
  text,
  id,
}: {
  tone: "success" | "warning" | "error";
  text: string;
  /** 需要被 aria-describedby 关联时传入。 */
  id?: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      id={id}
      className={`lm-codelab-notice lm-codelab-notice--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export default function AssignmentView({ onNavigateToTab, initialAssignmentId = null }: Props) {
  const [items, setItems] = useState<AssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** 列表筛选：状态（全部/待完成/已提交）与课程，和「题库列表」一致的筛选条。 */
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "submitted">("all");
  const [subjectFilter, setSubjectFilter] = useState("全部");
  const [detail, setDetail] = useState<AssignmentDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answers, setAnswers] = useState<AnswerMap>({});
  /** 简答题作答：key 为 openQuestionId。 */
  const [openAnswers, setOpenAnswers] = useState<AnswerMap>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [flash, setFlash] = useState("");
  const startedAtRef = useRef<string>("");

  const loadList = useCallback(() => {
    setLoading(true);
    setError("");
    getMyAssignments()
      .then((records) => {
        setItems(records);
        window.dispatchEvent(new Event("learnmate:assignments-changed"));
      })
      .catch((reason) => setError(describeApiError(reason, "作业列表加载失败")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // 从「去完成作业」或 /student/assignments/:id 直达时，自动打开指定作业
  const autoOpenedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!initialAssignmentId || autoOpenedRef.current === initialAssignmentId) return;
    autoOpenedRef.current = initialAssignmentId;
    void openAssignment(initialAssignmentId);
    // openAssignment 每次渲染都会重建，这里只依赖 id 变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssignmentId]);

  const questions = detail?.questions ?? [];
  // 简答题（主观题）：只统计「学生答没答」，批改结果由教师端展示
  const openQuestions = detail?.openQuestions ?? [];
  const openTotal = openQuestions.length;
  const hasOpen = openTotal > 0;
  const answeredCount = useMemo(
    () => questions.filter((question) => isQuestionAnswered(question, answers)).length,
    [questions, answers],
  );
  const unansweredCount = questions.length - answeredCount;
  const openAnsweredCount = useMemo(
    () =>
      openQuestions.filter((question) => Boolean((openAnswers[question.openQuestionId] ?? "").trim())).length,
    [openQuestions, openAnswers],
  );
  const openUnansweredCount = openTotal - openAnsweredCount;
  /** 「答题进度」侧栏提示语：作业里没有简答题时，保持原文案完全不变。 */
  const progressHint = useMemo(() => {
    if (unansweredCount > 0) {
      return hasOpen
        ? `还剩 ${unansweredCount} 道客观题（含填空题）未作答`
        : `还剩 ${unansweredCount} 道未作答`;
    }
    if (openUnansweredCount > 0) {
      return `客观题已全部作答，简答题还剩 ${openUnansweredCount} 道未作答`;
    }
    return "所有题目已作答，可以提交。";
  }, [unansweredCount, openUnansweredCount, hasOpen]);
  const currentQuestion = questions[currentIndex];
  // 填空题输入框/提示的稳定 id，用于 label 的 htmlFor 与 aria-describedby
  const fillInputId = `assignment-fill-${currentQuestion?.question_id ?? "input"}`;
  const fillHintId = `assignment-fill-${currentQuestion?.question_id ?? "input"}-hint`;
  const resultByQuestionId = useMemo(() => {
    const map = new Map<string, AssignmentResultItem>();
    detail?.mySubmission?.results.forEach((item) => map.set(item.questionId, item));
    return map;
  }, [detail]);

  // 代码题：纯代码题作业的 questions 为空，这里的所有统计都以 codeExercises 为准
  const codeExercises = detail?.codeExercises ?? [];
  const codeTotal = detail?.assignment.codeExerciseCount ?? codeExercises.length;
  const codeSubmittedCount = codeExercises.filter((exercise) => Boolean(exercise.mySubmission)).length;
  const codeAcceptedCount = codeExercises.filter((exercise) => exercise.mySubmission?.accepted).length;
  const hasCode = codeExercises.length > 0;

  /** 代码题提交成功后静默刷新详情：保留学生已作答的单选题与当前题号。 */
  async function refreshDetailKeepingAnswers(assignmentId: number) {
    try {
      const payload = await getAssignmentDetail(assignmentId);
      setDetail(payload);
      window.dispatchEvent(new Event("learnmate:assignments-changed"));
    } catch (reason) {
      setSubmitError(
        describeApiError(reason, "判题结果已返回，但作业状态刷新失败，可返回列表后重新进入查看"),
      );
    }
  }

  async function openAssignment(assignmentId: number) {
    setDetailLoading(true);
    setSubmitError("");
    setFlash("");
    try {
      const payload = await apiRequest<AssignmentDetailPayload>(`/api/assignments/${assignmentId}`);
      setDetail(payload);
      setAnswers({});
      setOpenAnswers({});
      setCurrentIndex(0);
      setConfirmingSubmit(false);
      startedAtRef.current = new Date().toISOString();
    } catch (reason) {
      setError(describeApiError(reason, "作业内容加载失败"));
    } finally {
      setDetailLoading(false);
    }
  }

  function backToList() {
    setDetail(null);
    setAnswers({});
    setOpenAnswers({});
    setCurrentIndex(0);
    setConfirmingSubmit(false);
    setSubmitError("");
    loadList();
  }

  function handleSelectAnswer(questionId: string, answerKey: string) {
    setAnswers((current) => ({ ...current, [questionId]: answerKey }));
    setSubmitError("");
  }

  /** 填空题作答：自由文本，和单选题共用 answers（key 都是 question_id）。 */
  function handleFillAnswer(questionId: string, text: string) {
    setAnswers((current) => ({ ...current, [questionId]: text }));
    setSubmitError("");
  }

  /** 简答题作答：按 openQuestionId 单独存，提交时放进 openAnswers。 */
  function handleOpenAnswer(openQuestionId: string, text: string) {
    setOpenAnswers((current) => ({ ...current, [openQuestionId]: text }));
    setSubmitError("");
  }

  /**
   * 提交前校验：客观题（含填空题）与简答题都必须作答。
   * 后端对缺答会直接返回 400（还有 N 道简答题未作答），这里先拦下来给出同一套提示。
   */
  function findSubmitBlocker(): string {
    const missedQuestions = questions.filter((question) => !isQuestionAnswered(question, answers)).length;
    if (missedQuestions > 0) return `还有 ${missedQuestions} 道题未作答，请完成后提交。`;
    const missedOpen = openQuestions.filter(
      (question) => !(openAnswers[question.openQuestionId] ?? "").trim(),
    ).length;
    if (missedOpen > 0) return `还有 ${missedOpen} 道简答题未作答，请完成后提交。`;
    return "";
  }

  /** 点「提交」时统一走这里：有缺答就按原有方式提示，否则进入确认框。 */
  function handleRequestSubmit() {
    const blocker = findSubmitBlocker();
    if (blocker) {
      setSubmitError(blocker);
      return;
    }
    setConfirmingSubmit(true);
  }

  async function handleSubmit() {
    if (!detail) return;
    const blocker = findSubmitBlocker();
    if (blocker) {
      setSubmitError(blocker);
      setConfirmingSubmit(false);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const answersPayload: QuizSubmitAnswer[] = questions.map((question) => {
        const raw = answers[question.question_id] ?? "";
        return {
          questionId: question.question_id,
          // 填空题是自由文本（后端按文本比对），单选题仍是 A/B/C/D
          answer: isFillBlank(question) ? raw.trim() : raw,
          durationSeconds: 0,
        };
      });
      const openAnswersPayload = openQuestions.map((question) => ({
        openQuestionId: question.openQuestionId,
        answer: (openAnswers[question.openQuestionId] ?? "").trim(),
      }));
      const result = await apiRequest<QuizSubmissionResult>(
        `/api/assignments/${detail.assignment.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: answersPayload,
            openAnswers: openAnswersPayload,
            startedAt: startedAtRef.current || undefined,
            submittedAt: new Date().toISOString(),
          }),
        },
      );
      const fresh = await apiRequest<AssignmentDetailPayload>(`/api/assignments/${detail.assignment.id}`);
      setDetail(fresh);
      setConfirmingSubmit(false);
      setFlash(`已提交：得分 ${result.score}（正确 ${result.correctCount}/${result.totalCount}）`);
      window.dispatchEvent(new Event("learnmate:assignments-changed"));
    } catch (reason) {
      setSubmitError(describeApiError(reason, "作业提交失败"));
      setConfirmingSubmit(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <AsyncState kind="loading" title="正在读取作业" description="教师发布的作业与测试正在加载。" />;
  }

  if (error && !detail) {
    return (
      <AsyncState
        kind="error"
        title="作业暂时无法读取"
        description={error}
        action={{ label: "重试", onClick: loadList }}
      />
    );
  }

  if (detailLoading) {
    return <AsyncState kind="loading" title="正在打开作业" description="题目内容加载完成后即可作答。" />;
  }

  if (!detail) {
    const submittedCount = items.filter((item) => item.submitted).length;
    const pendingCount = items.length - submittedCount;
    const subjectOptions = [
      "全部",
      ...Array.from(new Set(items.map((item) => item.subject).filter(Boolean))),
    ];
    const visibleItems = items.filter((item) => {
      if (statusFilter === "pending" && item.submitted) return false;
      if (statusFilter === "submitted" && !item.submitted) return false;
      if (subjectFilter !== "全部" && item.subject !== subjectFilter) return false;
      return true;
    });
    // 待完成的排前面（与班级信息面板里的顺序一致），同组内按截止时间近的优先
    const orderedItems = [...visibleItems].sort((a, b) => {
      if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
      const at = a.dueAt ? new Date(a.dueAt).getTime() : new Date(a.createdAt).getTime();
      const bt = b.dueAt ? new Date(b.dueAt).getTime() : new Date(b.createdAt).getTime();
      return (Number.isNaN(at) ? Infinity : at) - (Number.isNaN(bt) ? Infinity : bt);
    });

    return (
      <section className="lm-quiz-active lm-assign-page" aria-labelledby="assignment-list-title">
        <section className="lm-assign-panel">
          <div className="lm-assign-toolbar">
            <div>
              <h3 id="assignment-list-title">
                <ClipboardList aria-hidden="true" />
                教师发布给我的作业与测试
              </h3>
              <p role="status" aria-live="polite">
                {loading
                  ? "正在读取作业。"
                  : items.length
                    ? `当前显示 ${orderedItems.length} / ${items.length} 份作业 · ${pendingCount} 份待完成、${submittedCount} 份已提交`
                    : "老师发布作业后，这里会按班级推送给你。"}
              </p>
            </div>

            <div className="lm-assign-filters" aria-label="作业筛选">
              <label className="lm-assign-filter">
                <span>状态</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                >
                  <option value="all">全部</option>
                  <option value="pending">待完成</option>
                  <option value="submitted">已提交</option>
                </select>
              </label>
              <label className="lm-assign-filter">
                <span>课程</span>
                <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                  {subjectOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="lm-button" onClick={loadList} disabled={loading}>
                <RefreshCw aria-hidden="true" /> 刷新
              </button>
            </div>
          </div>

          {error && (
            <p className="lm-quiz-error" role="alert">
              {error}
            </p>
          )}

          {!items.length ? (
            <AsyncState
              kind="empty"
              title="目前没有作业"
              description="作业只发给「你所在班级」的学生。如果你确实在班级里，可能是老师还没发布；如果你还没加入班级，请让老师把你加入班级（或在教师端提交入班申请）。"
              preserved="当前账号没有任何待完成或已提交的作业记录。"
              action={{ label: "去智能测验", onClick: () => onNavigateToTab("quiz") }}
            />
          ) : !orderedItems.length ? (
            <AsyncState
              kind="empty"
              title="没有符合筛选条件的作业"
              description="可以切换状态或课程筛选后再看。"
              preserved={`共 ${items.length} 份作业记录。`}
            />
          ) : (
            <div className="lm-assign-list" role="list">
              {orderedItems.map((item) => (
                <article
                  key={item.id}
                  className={item.submitted ? "lm-assign-item is-submitted" : "lm-assign-item is-pending"}
                  role="listitem"
                >
                  <div className="lm-assign-item__main">
                    <div className="lm-assign-item__meta">
                      <span className={item.submitted ? "is-done" : "is-todo"}>
                        {item.submitted ? "已交" : "待做"}
                      </span>
                      <span>{item.className || "未标注班级"}</span>
                      <span>{item.subject || "未标注课程"}</span>
                      <span>
                        {item.questionCount
                          ? `共 ${item.questionCount} 题`
                          : (item.codeExerciseCount ?? 0) > 0
                            ? `${item.codeExerciseCount} 道代码题`
                            : "题量待定"}
                      </span>
                      {item.dueAt ? <span>{formatShortDate(item.dueAt)}截止</span> : null}
                    </div>
                    <h4 id={`assignment-${item.id}`}>{item.title}</h4>
                    <p>
                      {item.submitted
                        ? `已提交${item.score != null ? `，得分 ${item.score}` : ""}${item.submittedAt ? ` · ${formatShortDate(item.submittedAt)}` : ""}`
                        : `发布教师 ${item.teacherName || "—"}${(item.codeExerciseCount ?? 0) > 0 ? ` · 代码题通过 ${item.codeAcceptedCount ?? 0}/${item.codeExerciseCount}` : ""}`}
                    </p>
                    {item.description ? (
                      <p className="lm-assign-item__desc">{summarizeDescription(item.description)}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="lm-button lm-button--primary"
                    onClick={() => void openAssignment(item.id)}
                  >
                    {item.submitted ? "查看批改结果" : "开始作答"}
                    <ChevronRight aria-hidden="true" />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  const submitted = detail.mySubmission;
  // 后端只在 assignment 上给出简答题数量，用于「题目没下发成功」的兜底提示
  const openQuestionTotal = openQuestionCountOf(detail.assignment);

  return (
    <section className="lm-quiz-active" aria-labelledby="assignment-title">
      <div className="lm-quiz-status-row" data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">
        <span>
          <button type="button" className="lm-button" onClick={backToList}>
            <ChevronLeft aria-hidden="true" /> 返回作业列表
          </button>
        </span>
        <strong id="assignment-title">{detail.assignment.title}</strong>
      </div>

      <div className="lm-quiz-status-row" role="status" aria-live="polite" data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">
        <span>
          {[
            detail.assignment.className,
            detail.assignment.subject,
            questions.length ? `共 ${questions.length} 题` : "",
            hasOpen ? `简答题 ${openTotal} 道` : "",
            hasCode
              ? `代码题 ${codeExercises.length} 道 · 已提交 ${codeSubmittedCount} · 已通过 ${codeAcceptedCount}`
              : "",
            `截止 ${formatTime(detail.assignment.dueAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {submitted ? (
          <strong>
            已提交：{submitted.score} 分（{submitted.correctCount}/{submitted.totalCount}）
          </strong>
        ) : questions.length ? (
          <strong>
            {answeredCount}/{questions.length} 已作答
            {hasOpen ? ` · 简答题 ${openAnsweredCount}/${openTotal} 已作答` : ""}
          </strong>
        ) : hasCode ? (
          <strong>
            代码题已通过 {codeAcceptedCount}/{codeExercises.length}
          </strong>
        ) : null}
      </div>

      {flash && (
        <p className="lm-quiz-status-row" role="status" data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">
          {flash}
        </p>
      )}

      {questions.length > 0 && submitted ? (
        <section className="lm-quiz-review" aria-labelledby="assignment-review-title">
          <div className="lm-quiz-review__heading">
            <div>
              <h3 id="assignment-review-title">批改结果与逐题解析</h3>
              <p>提交于 {formatTime(submitted.submittedAt)}。</p>
            </div>
            <button type="button" className="lm-button" onClick={backToList}>
              返回列表
            </button>
          </div>
          {questions.map((question, index) => {
            const result = resultByQuestionId.get(question.question_id);
            const selected = result?.selectedAnswer;
            return (
              <details
                key={question.question_id}
                className="lm-quiz-review-item"
                open={result?.isCorrect === false}
              >
                <summary>
                  <span>{index + 1}</span>
                  <strong>{question.knowledge_point || question.subject}</strong>
                  {result?.isCorrect ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                  <em>{result?.isCorrect ? "回答正确" : "需要复盘"}</em>
                </summary>
                <div className="lm-quiz-review-item__body">
                  <MarkdownRenderer content={question.stem} />
                  {question.code_context && (
                    <pre>
                      <code>{question.code_context}</code>
                    </pre>
                  )}
                  {isFillBlank(question) ? (
                    // 填空题的 options 全是空字符串，按文本展示「我的答案 / 正确答案」，不出现 A-D
                    <>
                      <div className="lm-quiz-explanation">
                        <ClipboardList aria-hidden="true" />
                        <div>
                          <strong>我的答案</strong>
                          <p>{selected && selected.trim() ? selected : "未作答"}</p>
                        </div>
                      </div>
                      <div className="lm-quiz-explanation">
                        <CheckCircle2 aria-hidden="true" />
                        <div>
                          <strong>正确答案</strong>
                          <p>{formatBlankCorrectAnswer(result?.correctAnswer)}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="lm-quiz-review-options">
                      {question.options.map((option) => {
                        const isSelected = selected === option.key;
                        const isCorrect = result?.correctAnswer === option.key;
                        return (
                          <div
                            key={option.key}
                            className={`${isSelected ? "is-selected" : ""} ${isCorrect ? "is-correct" : ""}`}
                          >
                            <span>{option.key}</span>
                            <MarkdownRenderer content={option.content} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="lm-quiz-explanation">
                    <BookOpen aria-hidden="true" />
                    <div>
                      <strong>解析</strong>
                      <MarkdownRenderer content={result?.analysis || "本题提交结果未包含解析。"} />
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      ) : questions.length > 0 && currentQuestion ? (
        <div className="lm-quiz-active-grid">
          <article className="lm-quiz-question-panel">
            <div className="lm-quiz-question-meta">
              <div>
                <span>
                  {currentQuestion.question_type === "single_choice"
                    ? "单选题"
                    : isFillBlank(currentQuestion)
                      ? "填空题"
                      : currentQuestion.question_type || "题目"}
                </span>
                <span>{currentQuestion.subject}</span>
                {currentQuestion.knowledge_point && <span>{currentQuestion.knowledge_point}</span>}
                {currentQuestion.difficulty && <span>{currentQuestion.difficulty}</span>}
              </div>
              <strong>
                第 {currentIndex + 1} 题 / 共 {questions.length} 题
              </strong>
            </div>

            <fieldset className="lm-quiz-question-fieldset">
              <legend>
                <MarkdownRenderer content={currentQuestion.stem} />
              </legend>

              {currentQuestion.code_context && (
                <div className="lm-quiz-code">
                  <span>代码片段</span>
                  <pre>
                    <code>{currentQuestion.code_context}</code>
                  </pre>
                </div>
              )}

              {isFillBlank(currentQuestion) ? (
                // 填空题：自由文本作答，不渲染后端下发的空 options
                <>
                  <div className="lm-form-field">
                    <label htmlFor={fillInputId}>填空题作答</label>
                    <input
                      id={fillInputId}
                      type="text"
                      value={answers[currentQuestion.question_id] ?? ""}
                      placeholder="直接填写答案文本，不用输入选项字母"
                      autoComplete="off"
                      aria-label={`第 ${currentIndex + 1} 题填空题作答`}
                      aria-describedby={currentQuestion.hint ? fillHintId : undefined}
                      onChange={(event) => handleFillAnswer(currentQuestion.question_id, event.target.value)}
                    />
                  </div>
                  {currentQuestion.hint && (
                    <InlineNotice id={fillHintId} tone="warning" text={`提示：${currentQuestion.hint}`} />
                  )}
                </>
              ) : (
                <div className="lm-quiz-options">
                  {currentQuestion.options.map((option) => {
                    const checked = answers[currentQuestion.question_id] === option.key;
                    const inputId = `assignment-${currentQuestion.question_id}-${option.key}`;
                    return (
                      <label
                        key={option.key}
                        className={`lm-quiz-option ${checked ? "is-selected" : ""}`}
                        htmlFor={inputId}
                      >
                        <input
                          id={inputId}
                          type="radio"
                          name={`assignment-${currentQuestion.question_id}`}
                          checked={checked}
                          onChange={() => handleSelectAnswer(currentQuestion.question_id, option.key)}
                        />
                        <span>{option.key}</span>
                        <MarkdownRenderer content={option.content} />
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            {submitError && (
              <p className="lm-quiz-error" role="alert">
                {submitError}
              </p>
            )}

            {confirmingSubmit && (
              <div className="lm-quiz-submit-confirm" role="group" aria-label="提交确认">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>确认提交这份作业？</strong>
                  <p>提交后会更新错题本、掌握度与学习画像。同一份作业只能提交一次。</p>
                </div>
                <button
                  type="button"
                  className="lm-button lm-button--primary"
                  disabled={submitting}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? "正在提交" : "确认提交"}
                </button>
                <button
                  type="button"
                  className="lm-button"
                  disabled={submitting}
                  onClick={() => setConfirmingSubmit(false)}
                >
                  继续检查
                </button>
              </div>
            )}

            <div className="lm-quiz-controls">
              <div>
                <button
                  type="button"
                  className="lm-icon-button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                  aria-label="上一题"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
              </div>
              <div>
                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    className="lm-button lm-button--primary"
                    onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
                  >
                    下一题
                    <ChevronRight aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="lm-button lm-button--primary"
                    disabled={submitting}
                    onClick={handleRequestSubmit}
                  >
                    提交作业
                  </button>
                )}
              </div>
            </div>
          </article>

          <aside className="lm-quiz-map" aria-labelledby="assignment-map-title">
            <h2 id="assignment-map-title">答题进度</h2>
            <p>{progressHint}</p>
            <div className="lm-quiz-map__grid">
              {questions.map((question, index) => {
                const isCurrent = index === currentIndex;
                const isAnswered = isQuestionAnswered(question, answers);
                return (
                  <button
                    key={question.question_id}
                    type="button"
                    aria-current={isCurrent ? "step" : undefined}
                    className={`${isCurrent ? "is-current" : ""} ${isAnswered ? "is-answered" : ""}`}
                    onClick={() => setCurrentIndex(index)}
                  >
                    {index + 1}
                    <span>{isAnswered ? "已答" : "未答"}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="lm-button lm-button--primary lm-quiz-map__submit"
              disabled={submitting}
              onClick={handleRequestSubmit}
            >
              检查并提交
            </button>
          </aside>
        </div>
      ) : questions.length === 0 && !hasCode && !hasOpen ? (
        <AsyncState
          kind="empty"
          title="这份作业没有题目"
          description="可能是教师发布时题目已被删除，请联系任课教师重新发布。"
          action={{ label: "返回作业列表", onClick: backToList }}
        />
      ) : null}

      {hasOpen && (
        <section className="lm-quiz-review" aria-labelledby="assignment-open-title">
          <div className="lm-quiz-review__heading">
            <div>
              <h3 id="assignment-open-title">简答题（{openTotal} 道）</h3>
              <p>
                {submitted
                  ? "简答题是主观题，由教师人工评阅，这里只回显你的作答。"
                  : "简答题是主观题，需要全部作答后才能提交；提交后由教师评阅，不会立即出分。"}
              </p>
            </div>
          </div>
          {openQuestions.map((question, index) => {
            const inputId = `assignment-open-${question.openQuestionId}`;
            const draft = openAnswers[question.openQuestionId] ?? "";
            // 已提交后优先用服务端回填的 myAnswer 回显，其次才用本地草稿
            const submittedText = (question.myAnswer ?? "").trim() || draft.trim();
            const answered = Boolean(draft.trim()) || Boolean((question.myAnswer ?? "").trim());
            return (
              <details key={question.openQuestionId} className="lm-quiz-review-item" open>
                <summary>
                  <span>{index + 1}</span>
                  <strong>{question.knowledgePoint || question.subject || `简答题 ${index + 1}`}</strong>
                  {submitted || answered ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <ClipboardList aria-hidden="true" />
                  )}
                  <em>{submitted ? "已提交 · 等待评阅" : answered ? "已作答" : "未作答"}</em>
                </summary>
                <div className="lm-quiz-review-item__body">
                  <div className="lm-codelab-meta" data-level="B" data-carrier="tab" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
                    {[question.subject, question.chapter, question.knowledgePoint, question.difficulty]
                      .filter((item): item is string => Boolean(item))
                      .filter((item, position, list) => list.indexOf(item) === position)
                      .map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                  </div>
                  <MarkdownRenderer content={question.prompt} />
                  {submitted ? (
                    <>
                      <div className="lm-quiz-explanation">
                        <ClipboardList aria-hidden="true" />
                        <div>
                          <strong>我的作答</strong>
                          <p>{submittedText || "（未作答）"}</p>
                        </div>
                      </div>
                      <InlineNotice tone="success" text="已提交，等待教师评阅。" />
                    </>
                  ) : (
                    <div className="lm-codelab-stdin">
                      <label htmlFor={inputId}>作答内容</label>
                      <textarea
                        id={inputId}
                        value={draft}
                        aria-label={`简答题 ${index + 1} 作答内容`}
                        placeholder="写出你的作答，提交后由教师评阅"
                        onChange={(event) => handleOpenAnswer(question.openQuestionId, event.target.value)}
                      />
                    </div>
                  )}
                </div>
              </details>
            );
          })}

          {/* 只有简答题的作业没有客观题面板，这里补一个提交入口，校验与错误提示沿用同一套 */}
          {!submitted && !questions.length && (
            <>
              {submitError && (
                <p className="lm-quiz-error" role="alert">
                  {submitError}
                </p>
              )}
              {confirmingSubmit && (
                <div className="lm-quiz-submit-confirm" role="group" aria-label="提交确认">
                  <ShieldCheck aria-hidden="true" />
                  <div>
                    <strong>确认提交这份作业？</strong>
                    <p>提交后会更新错题本、掌握度与学习画像。同一份作业只能提交一次。</p>
                  </div>
                  <button
                    type="button"
                    className="lm-button lm-button--primary"
                    disabled={submitting}
                    onClick={() => void handleSubmit()}
                  >
                    {submitting ? "正在提交" : "确认提交"}
                  </button>
                  <button
                    type="button"
                    className="lm-button"
                    disabled={submitting}
                    onClick={() => setConfirmingSubmit(false)}
                  >
                    继续检查
                  </button>
                </div>
              )}
              <div className="lm-quiz-controls">
                <div />
                <div>
                  <button
                    type="button"
                    className="lm-button lm-button--primary"
                    disabled={submitting}
                    onClick={handleRequestSubmit}
                  >
                    提交作业
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {hasCode && (
        <section className="lm-quiz-review" aria-labelledby="assignment-code-title">
          <div className="lm-quiz-review__heading">
            <div>
              <h3 id="assignment-code-title">代码题（{codeExercises.length} 道）</h3>
              <p>
                已提交 {codeSubmittedCount} 道 · 已通过 {codeAcceptedCount}{" "}
                道。每题提交后由后台自动判题，可以反复提交直到通过。
              </p>
            </div>
          </div>
          {codeExercises.map((exercise, index) => (
            <CodeExerciseCard
              key={exercise.exerciseId}
              assignmentId={detail.assignment.id}
              exercise={exercise}
              index={index}
              defaultOpen={index === 0 || exercise.mySubmission?.accepted === false}
              onSubmitted={() => refreshDetailKeepingAnswers(detail.assignment.id)}
            />
          ))}
        </section>
      )}

      {!hasCode && codeTotal > 0 && (
        <p className="lm-quiz-error" role="alert">
          这份作业包含 {codeTotal} 道代码题，但题目内容没有下发成功，请刷新后重试。
        </p>
      )}

      {!hasOpen && openQuestionTotal > 0 && (
        <p className="lm-quiz-error" role="alert">
          这份作业包含 {openQuestionTotal} 道简答题，但题目内容没有下发成功，请刷新后重试。
        </p>
      )}
    </section>
  );
}

/**
 * 作业内的一道代码题：题干 + 样例 + 编辑区 + 提交判题 + 判题结果。
 * 每道题独立维护编辑内容与判题结果，提交成功后由父组件静默刷新 mySubmission。
 */
function CodeExerciseCard({
  assignmentId,
  exercise,
  index,
  defaultOpen,
  onSubmitted,
}: {
  assignmentId: number;
  exercise: AssignmentCodeExercise;
  index: number;
  defaultOpen: boolean;
  onSubmitted: () => void | Promise<void>;
}) {
  const submission = exercise.mySubmission ?? null;
  const language = (exercise.language || "c").trim() || "c";
  const [sourceCode, setSourceCode] = useState(() => submission?.sourceCode || exercise.starterCode || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AssignmentCodeRunResult | null>(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);

  // 详情刷新后只在学生还没写任何内容时同步服务端代码，避免覆盖正在编辑的草稿
  useEffect(() => {
    setSourceCode((current) =>
      current.trim() ? current : submission?.sourceCode || exercise.starterCode || "",
    );
  }, [exercise.starterCode, submission?.sourceCode]);

  const isAccepted = accepted ?? Boolean(submission?.accepted);
  const hasSubmitted = Boolean(submission) || accepted !== null;
  const caseCount = Number(exercise.caseCount ?? 0);
  const hiddenCount = Number(exercise.hiddenCount ?? 0);
  const title = exercise.title || `代码题 ${index + 1}`;

  // textarea 里的 Tab 不跳焦点，插入两个空格并把光标放在缩进之后
  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    setSourceCode(`${sourceCode.slice(0, start)}  ${sourceCode.slice(end)}`);
    const caret = start + 2;
    window.requestAnimationFrame(() => {
      editor.selectionStart = caret;
      editor.selectionEnd = caret;
    });
  }

  function handleResetCode() {
    setSourceCode(exercise.starterCode || "");
    setError("");
    setResult(null);
    setAccepted(null);
  }

  async function handleSubmitCode() {
    if (submitting) return;
    if (!sourceCode.trim()) {
      setError("源码不能为空，请先补充代码后再提交判题。");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const payload = await submitAssignmentCode(assignmentId, exercise.exerciseId, {
        language,
        sourceCode,
      });
      setResult(payload.result ?? null);
      setAccepted(Boolean(payload.accepted));
      await onSubmitted();
    } catch (reason) {
      setError(describeApiError(reason, "代码题提交失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="lm-quiz-review-item" open={defaultOpen}>
      <summary>
        <span>{index + 1}</span>
        <strong>{title}</strong>
        {isAccepted ? <CheckCircle2 aria-hidden="true" /> : <Code2 aria-hidden="true" />}
        <em>{isAccepted ? "已通过" : hasSubmitted ? "已提交 · 未通过" : "未提交"}</em>
      </summary>

      <div className="lm-quiz-review-item__body">
        <div className="lm-codelab-meta" data-level="B" data-carrier="tab" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
          {[exercise.subject, exercise.knowledgePoint, exercise.difficulty, language.toUpperCase()]
            .filter((item): item is string => Boolean(item))
            .map((item) => (
              <span key={item}>{item}</span>
            ))}
        </div>

        {exercise.description && <MarkdownRenderer content={exercise.description} />}

        <CodeBlock title="样例输入" content={exercise.sampleInput || "无输入"} />
        <CodeBlock title="样例输出" content={exercise.sampleOutput || "无输出"} />

        <p>
          {caseCount > 0
            ? `共 ${caseCount} 组用例${
                hiddenCount > 0 ? `（含 ${hiddenCount} 组隐藏用例，提交后自动判题）` : "，提交后自动判题"
              }`
            : "提交后由后台自动判题"}
        </p>

        <textarea
          className="lm-codelab-source"
          value={sourceCode}
          spellCheck={false}
          aria-label={`${title} 源代码`}
          aria-busy={submitting}
          onChange={(event) => {
            setSourceCode(event.target.value);
            setError("");
          }}
          onKeyDown={handleEditorKeyDown}
        />

        <div className="lm-quiz-controls">
          <div>
            <button type="button" className="lm-button" disabled={submitting} onClick={handleResetCode}>
              <RotateCcw aria-hidden="true" /> 恢复初始代码
            </button>
          </div>
          <div>
            <button
              type="button"
              className="lm-button lm-button--primary"
              disabled={submitting || !sourceCode.trim()}
              aria-busy={submitting}
              onClick={() => void handleSubmitCode()}
            >
              {submitting ? <Loader2 aria-hidden="true" /> : <Play aria-hidden="true" />}
              {submitting ? "判题中…" : "提交判题"}
            </button>
          </div>
        </div>

        {error && (
          <p className="lm-quiz-error" role="alert">
            {error}
          </p>
        )}

        {result ? (
          <CodeJudgeResultPanel result={result} accepted={isAccepted} />
        ) : submission ? (
          <PreviousSubmissionNotice submission={submission} />
        ) : null}
      </div>
    </details>
  );
}

/** 本次提交的判题结果：状态、通过用例数、逐用例简述、编译/运行错误信息。 */
function CodeJudgeResultPanel({ result, accepted }: { result: AssignmentCodeRunResult; accepted: boolean }) {
  const unavailable = isRunnerUnavailable(result.status);
  const passedCount = Number(result.passedCount ?? 0);
  const totalCount = Number(result.totalCount ?? 0);

  return (
    <section
      className={`lm-codelab-result ${accepted ? "is-success" : unavailable ? "" : "is-error"}`}
      aria-live="polite"
    >
      <strong>判题结果：{codeStatusLabel(result.status)}</strong>
      <p>
        通过用例：{passedCount} / {totalCount}
        {result.executionMode ? ` · 判题环境 ${result.executionMode}` : ""}
      </p>

      {unavailable && (
        <InlineNotice
          tone="warning"
          text="判题器暂不可用，这次提交没有被判定（不是你的代码错误）。代码已保留，请稍后再提交一次。"
        />
      )}
      {!unavailable && result.message && <p>{result.message}</p>}

      {!!result.tests?.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>用例</th>
                <th>结果</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {result.tests.map((item, index) => (
                <tr key={String(item.id ?? index)}>
                  <td>{codeCaseLabel(item, index)}</td>
                  <td>{codeStatusLabel(item.status)}</td>
                  <td>{item.message || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.compileOutput && <CodeBlock title="编译信息" content={result.compileOutput} />}
      {result.stderr && <CodeBlock title="运行错误信息" content={result.stderr} />}
      {result.stdout && <CodeBlock title="标准输出" content={result.stdout} />}
    </section>
  );
}

/** 打开作业时回显本人最近一次提交的状态（没有新的判题结果时）。 */
function PreviousSubmissionNotice({ submission }: { submission: AssignmentCodeSubmission }) {
  const unavailable = isRunnerUnavailable(submission.status);
  return (
    <InlineNotice
      tone={submission.accepted ? "success" : unavailable ? "warning" : "error"}
      text={
        unavailable
          ? "上次提交时判题器暂不可用，这次提交没有被判定，请稍后重新提交。"
          : `上次提交：${codeStatusLabel(submission.status)} · 通过用例 ${
              submission.passedCount ?? 0
            }/${submission.totalCount ?? 0}（${formatTime(submission.submittedAt)}）`
      }
    />
  );
}
