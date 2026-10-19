/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileQuestion,
  HelpCircle,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";
import {
  generatePersonalizedQuiz,
  getAILearningStatus,
  type PersonalizedQuizResult,
  describeApiError,
  getQuizQuestions,
  requestQuizHint,
  submitQuizAttempt,
  type QuizDifficulty,
  type QuizPublicQuestion,
  type QuizSubmissionResult,
} from "../api";
import type { QuizSettings } from "../types";
import MarkdownRenderer from "./MarkdownRenderer";

interface QuizViewProps {
  onNavigateToTab: (tab: string, prefillData?: unknown) => void;
  prefill?: {
    subject?: string;
    knowledgePoint?: string;
  } | null;
}

interface WorkQuestion {
  id: string;
  subject: string;
  chapter?: string | null;
  knowledgePoint?: string | null;
  type: string;
  difficulty?: string | null;
  stem: string;
  code: string;
  options: Array<{ key: string; content: string }>;
  hint: string;
}

interface HintState {
  visible: boolean;
  loading: boolean;
  text: string;
  error: string;
}

interface QuizDraft {
  settings: QuizSettings;
  questions: WorkQuestion[];
  currentIndex: number;
  answers: Record<string, string>;
  marked: Record<string, boolean>;
  questionDurations: Record<string, number>;
  startedAt: string;
  attemptKey: string;
  savedAt: string;
}

type LoadStatus = "idle" | "loading" | "ready" | "empty" | "error";

const DRAFT_KEY = "learnmate.student.quizDraft.v1";

const SUBJECT_OPTIONS = ["数据结构", "操作系统", "C 语言程序设计", "计算机网络", "计算机组成原理"];

// 题目数量：改为学生自行输入，不再使用固定档位标签
// 后端边界：AI 组卷 personalizedQuizService 取 3–20；本地题库 listQuestions 最多 50
const QUESTION_COUNT_MIN = 3;
const QUESTION_COUNT_MAX = 20;
const QUESTION_COUNT_MAX_LOCAL = 50;
const QUESTION_COUNT_DEFAULT = 5;

function resolveQuestionCount(raw: string, max: number) {
  const trimmed = String(raw || "").trim();
  const value = trimmed ? Number(trimmed) : Number.NaN;
  const safe = Number.isFinite(value) ? Math.floor(value) : QUESTION_COUNT_DEFAULT;
  return Math.min(max, Math.max(QUESTION_COUNT_MIN, safe));
}

function maxQuestionCount(mode: string) {
  return mode === "manual" ? QUESTION_COUNT_MAX_LOCAL : QUESTION_COUNT_MAX;
}

const DIFFICULTIES: Array<{ value: QuizDifficulty; label: string; note: string }> = [
  { value: "basic", label: "基础", note: "定义与基本操作" },
  { value: "advanced", label: "提高", note: "过程推演与边界" },
  { value: "challenge", label: "综合", note: "多条件综合判断" },
];

export default function QuizView({ onNavigateToTab, prefill }: QuizViewProps) {
  const [settings, setSettings] = useState<QuizSettings>({
    domain: prefill?.subject || "数据结构",
    numQuestions: 5,
    difficulty: "advanced",
  });
  const [mode, setMode] = useState("manual");
  const [questionCountInput, setQuestionCountInput] = useState(String(settings.numQuestions));
  const [generation, setGeneration] = useState<PersonalizedQuizResult | null>(null);
  const [searchAvailable, setSearchAvailable] = useState(false);
  useEffect(() => {
    getAILearningStatus()
      .then((status) => setSearchAvailable(Boolean(status.capabilities?.personalizedWebQuiz)))
      .catch(() => setSearchAvailable(false));
  }, []);
  const [questions, setQuestions] = useState<WorkQuestion[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [loadMessage, setLoadMessage] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [questionDurations, setQuestionDurations] = useState<Record<string, number>>({});
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [attemptKey, setAttemptKey] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hints, setHints] = useState<Record<string, HintState>>({});
  const [submitError, setSubmitError] = useState("");
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<QuizSubmissionResult | null>(null);

  const questionEnteredAtRef = useRef<number | null>(null);
  const draftRestoredRef = useRef(false);

  const currentQuestion = questions[currentIndex] || null;
  const answeredCount = useMemo(
    () => questions.filter((question) => Boolean(answers[question.id])).length,
    [answers, questions],
  );
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const resultByQuestionId = useMemo(() => {
    return new Map((submission?.questionResults || []).map((item) => [item.questionId, item]));
  }, [submission]);

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    draftRestoredRef.current = true;
    setSettings(draft.settings);
    setQuestionCountInput(String(draft.settings.numQuestions));
    setQuestions(draft.questions);
    setCurrentIndex(Math.min(draft.currentIndex, Math.max(0, draft.questions.length - 1)));
    setAnswers(draft.answers);
    setMarked(draft.marked);
    setQuestionDurations(draft.questionDurations);
    setStartedAt(draft.startedAt);
    setAttemptKey(draft.attemptKey);
    setLoadStatus("ready");
    setLoadMessage("已恢复浏览器本地暂存的测验。提交前答案不会写入服务器。");
    questionEnteredAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!prefill?.subject || draftRestoredRef.current || questions.length > 0) return;
    setSettings((current) => ({ ...current, domain: prefill.subject || current.domain }));
  }, [prefill?.subject, questions.length]);

  useEffect(() => {
    if (loadStatus !== "ready" || questions.length === 0 || submission || !startedAt || !attemptKey) return;
    const draft: QuizDraft = {
      settings,
      questions,
      currentIndex,
      answers,
      marked,
      questionDurations,
      startedAt,
      attemptKey,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [
    answers,
    attemptKey,
    currentIndex,
    loadStatus,
    marked,
    questionDurations,
    questions,
    settings,
    startedAt,
    submission,
  ]);

  useEffect(() => {
    if (loadStatus !== "ready" || questions.length === 0 || submission || !startedAt) return;

    const updateElapsed = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      setElapsedSeconds(elapsed);
    };

    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [loadStatus, questions.length, startedAt, submission]);

  function currentQuestionCount() {
    return resolveQuestionCount(questionCountInput, maxQuestionCount(mode));
  }

  function commitQuestionCount() {
    const next = currentQuestionCount();
    setQuestionCountInput(String(next));
    setSettings((current) => (current.numQuestions === next ? current : { ...current, numQuestions: next }));
  }

  function handleModeChange(nextMode: string) {
    const next = resolveQuestionCount(questionCountInput, maxQuestionCount(nextMode));
    setMode(nextMode);
    setQuestionCountInput(String(next));
    setSettings((current) => (current.numQuestions === next ? current : { ...current, numQuestions: next }));
  }

  async function handleStartQuiz() {
    setLoadStatus("loading");
    setLoadMessage("");
    setSubmitError("");
    setSubmission(null);
    setConfirmingSubmit(false);
    setCurrentIndex(0);
    setAnswers({});
    setMarked({});
    setHints({});
    setQuestionDurations({});
    window.localStorage.removeItem(DRAFT_KEY);
    const questionCount = currentQuestionCount();

    if (mode === "web" && !searchAvailable) {
      setLoadStatus("error");
      setLoadMessage(
        "联网搜题组卷当前不可用：请先把组卷方式改为「本地知识库组卷」，或等联网搜索服务配置好后再试。",
      );
      return;
    }

    try {
      const generated: PersonalizedQuizResult | null =
        mode === "manual"
          ? null
          : await generatePersonalizedQuiz({
              subject: settings.domain === "C 语言程序设计" ? "C语言" : settings.domain,
              knowledgePoint: prefill?.knowledgePoint,
              questionCount,
              difficulty: DIFFICULTIES.find((d) => d.value === settings.difficulty)?.label,
              allowCourseOnly: mode === "course",
            });
      setGeneration(generated);
      const rawQuestions = generated
        ? generated.questions
        : await getQuizQuestions({
            subject: settings.domain,
            difficulty: settings.difficulty as QuizDifficulty,
            limit: questionCount,
            knowledgePoint: prefill?.knowledgePoint,
          });
      const normalized = rawQuestions
        .map(normalizeQuestion)
        .filter((item): item is WorkQuestion => Boolean(item));

      if (normalized.length === 0) {
        setQuestions([]);
        setStartedAt(null);
        setAttemptKey("");
        setElapsedSeconds(0);
        setLoadStatus("empty");
        setLoadMessage(
          rawQuestions.length === 0
            ? "当前条件下题库没有返回可作答题目。"
            : "题库返回的题目暂不满足前端可作答条件。",
        );
        return;
      }

      const now = new Date().toISOString();
      setQuestions(normalized);
      setStartedAt(now);
      setAttemptKey(createAttemptKey());
      setElapsedSeconds(0);
      setLoadStatus("ready");
      setLoadMessage(
        generated
          ? `已生成 ${normalized.length} / ${questionCount} 道；${generated.sourceNotice || "模型改编题，请核对答案。"}`
          : rawQuestions.length > normalized.length
            ? `题库返回 ${rawQuestions.length} 道题，其中 ${normalized.length} 道为当前支持的选择题。`
            : "答案将在提交时一次性保存并判定。",
      );
      questionEnteredAtRef.current = Date.now();
    } catch (caught) {
      setQuestions([]);
      setStartedAt(null);
      setAttemptKey("");
      setLoadStatus("error");
      setLoadMessage(describeApiError(caught, "题库加载失败"));
    }
  }

  function handleResetDraft() {
    window.localStorage.removeItem(DRAFT_KEY);
    setQuestions([]);
    setAnswers({});
    setMarked({});
    setHints({});
    setQuestionDurations({});
    setStartedAt(null);
    setAttemptKey("");
    setElapsedSeconds(0);
    setSubmission(null);
    setSubmitError("");
    setConfirmingSubmit(false);
    setLoadStatus("idle");
    setLoadMessage("");
  }

  function goToQuestion(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= questions.length || nextIndex === currentIndex) return;
    commitCurrentQuestionDuration();
    setCurrentIndex(nextIndex);
    setConfirmingSubmit(false);
    setSubmitError("");
    questionEnteredAtRef.current = Date.now();
  }

  function handleSelectAnswer(question: WorkQuestion, answerKey: string) {
    setAnswers((current) => ({ ...current, [question.id]: answerKey }));
    setSubmitError("");
  }

  function handleToggleMarked(question: WorkQuestion) {
    setMarked((current) => ({ ...current, [question.id]: !current[question.id] }));
  }

  async function handleRequestHint(question: WorkQuestion) {
    const existing = hints[question.id];
    setHints((current) => ({
      ...current,
      [question.id]: {
        visible: true,
        loading: !existing?.text,
        text: existing?.text || "",
        error: "",
      },
    }));

    if (existing?.text) return;

    try {
      const result = await requestQuizHint({
        question: question.stem,
        code: question.code,
        options: question.options.map((option) => option.content),
      });
      const text = String(result.hint || question.hint || "").trim();
      setHints((current) => ({
        ...current,
        [question.id]: {
          visible: true,
          loading: false,
          text,
          error: text ? "" : "本题暂时没有更多提示。",
        },
      }));
    } catch (caught) {
      const fallback = question.hint.trim();
      setHints((current) => ({
        ...current,
        [question.id]: {
          visible: true,
          loading: false,
          text: fallback,
          error: fallback ? "" : describeApiError(caught, "提示暂时不可用"),
        },
      }));
    }
  }

  function handleSubmitRequest() {
    if (questions.length === 0) return;
    if (unansweredCount > 0) {
      const firstUnanswered = questions.findIndex((question) => !answers[question.id]);
      if (firstUnanswered >= 0) goToQuestion(firstUnanswered);
      setSubmitError(`还有 ${unansweredCount} 道题未作答。请完成后再提交。`);
      setConfirmingSubmit(false);
      return;
    }
    setSubmitError("");
    setConfirmingSubmit(true);
  }

  async function handleConfirmSubmit() {
    if (submitting || !startedAt || !attemptKey || questions.length === 0) return;
    if (unansweredCount > 0) {
      handleSubmitRequest();
      return;
    }

    const durations = mergedDurations();
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await submitQuizAttempt({
        idempotencyKey: attemptKey,
        subject: settings.domain,
        startedAt,
        submittedAt: new Date().toISOString(),
        answers: questions.map((question) => ({
          questionId: question.id,
          answer: answers[question.id],
          durationSeconds: Math.max(
            0,
            Math.round(durations[question.id] || elapsedSeconds / questions.length || 0),
          ),
        })),
      });
      setSubmission(result);
      setConfirmingSubmit(false);
      window.localStorage.removeItem(DRAFT_KEY);
    } catch (caught) {
      setSubmitError(describeApiError(caught, "测验提交失败"));
    } finally {
      setSubmitting(false);
    }
  }

  function commitCurrentQuestionDuration() {
    if (!currentQuestion || questionEnteredAtRef.current === null) return;
    const delta = Math.max(0, Math.floor((Date.now() - questionEnteredAtRef.current) / 1000));
    if (delta <= 0) return;
    setQuestionDurations((current) => ({
      ...current,
      [currentQuestion.id]: (current[currentQuestion.id] || 0) + delta,
    }));
    questionEnteredAtRef.current = Date.now();
  }

  function mergedDurations() {
    const next = { ...questionDurations };
    if (currentQuestion && questionEnteredAtRef.current !== null) {
      const delta = Math.max(0, Math.floor((Date.now() - questionEnteredAtRef.current) / 1000));
      next[currentQuestion.id] = (next[currentQuestion.id] || 0) + delta;
    }
    return next;
  }

  return (
    <div className="lm-quiz">
      {generation && questions.length > 0 && (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 mb-4">
          <h2>本次组卷依据</h2>
          <p>{generation.sourceNotice}</p>
          <p>
            路径版本 {generation.generationBasis.pathVersion} · 参考错题{" "}
            {generation.generationBasis.wrongQuestionCount} 道 · 提问记录{" "}
            {generation.generationBasis.chatContextCount} 条
          </p>
          <details>
            <summary>查看联网资料来源（搜索摘要，不等同原版真题）</summary>
            {generation.sources.map((source) => (
              <p key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </p>
            ))}
          </details>
        </section>
      )}
      <header className="lm-quiz-header">
        <div>
          <p>智能测验</p>
          <h1>围绕自己的薄弱点，完成一次有效练习</h1>
          <span>选择已有题库，或让 AI 结合路径、错题与课程资料生成个性化测验。</span>
        </div>
        {questions.length > 0 && !submission && (
          <div className="lm-quiz-elapsed" aria-label={`本地已用时 ${formatDuration(elapsedSeconds)}`}>
            <Clock3 aria-hidden="true" />
            <span>{formatDuration(elapsedSeconds)}</span>
            <small>本地用时</small>
          </div>
        )}
      </header>

      <section className="lm-quiz-layout">
        <aside className="lm-quiz-setup" aria-labelledby="quiz-setup-title">
          <div className="lm-quiz-setup__heading">
            <Target aria-hidden="true" />
            <div>
              <h2 id="quiz-setup-title">组卷条件</h2>
              <p>结合学习记录选择课程题库题目，也可按课程与难度手动组卷。</p>
            </div>
          </div>

          {prefill?.knowledgePoint && (
            <div className="lm-quiz-prefill">
              <strong>定向练习</strong>
              <span>
                {prefill.subject ? `${prefill.subject} · ` : ""}
                {prefill.knowledgePoint}
              </span>
            </div>
          )}

          <label className="lm-quiz-field">
            <span>组卷方式</span>
            <select
              value={mode}
              disabled={loadStatus === "loading" || (questions.length > 0 && !submission)}
              onChange={(event) => handleModeChange(event.target.value)}
            >
              <optgroup label="本地知识库组卷">
                <option value="course">AI 个性化生成（错题与课程资料驱动）</option>
                <option value="manual">直接读取题库原题（按课程与难度）</option>
              </optgroup>
              <optgroup label="联网搜题组卷">
                <option value="web" disabled={!searchAvailable}>
                  联网检索 + AI 安全选题{searchAvailable ? "" : "（模型或联网搜索未就绪）"}
                </option>
              </optgroup>
            </select>
          </label>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            {searchAvailable
              ? "系统结合联网资料、薄弱点与学习路径选题。搜索或 AI 暂时不可用时，会用课程题库补足，并在结果中说明实际来源。"
              : "联网 AI 组卷尚未就绪：请确认本地模型正在运行且联网搜索已启用；当前仍可直接使用本地题库组卷。"}
          </p>
          <label className="lm-quiz-field">
            <span>课程</span>
            <select
              value={settings.domain}
              onChange={(event) => setSettings((current) => ({ ...current, domain: event.target.value }))}
              disabled={loadStatus === "loading" || (questions.length > 0 && !submission)}
            >
              {SUBJECT_OPTIONS.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </label>

          <label className="lm-quiz-field">
            <span>题目数量</span>
            <input
              type="number"
              inputMode="numeric"
              min={QUESTION_COUNT_MIN}
              max={maxQuestionCount(mode)}
              step={1}
              value={questionCountInput}
              disabled={loadStatus === "loading" || (questions.length > 0 && !submission)}
              onChange={(event) => setQuestionCountInput(event.target.value)}
              onBlur={commitQuestionCount}
            />
            <small className="text-xs leading-relaxed text-slate-500">
              可自行输入 {QUESTION_COUNT_MIN}–{maxQuestionCount(mode)} 题；留空或填写非法值会回到默认{" "}
              {QUESTION_COUNT_DEFAULT} 题。
            </small>
          </label>

          <fieldset className="lm-quiz-segment">
            <legend>难度</legend>
            <div>
              {DIFFICULTIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={settings.difficulty === item.value ? "is-active" : ""}
                  aria-pressed={settings.difficulty === item.value}
                  disabled={loadStatus === "loading" || (questions.length > 0 && !submission)}
                  onClick={() => setSettings((current) => ({ ...current, difficulty: item.value }))}
                >
                  <span>{item.label}</span>
                  <small>{item.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            className="lm-button lm-button--primary lm-quiz-start-button"
            onClick={() => void handleStartQuiz()}
            disabled={loadStatus === "loading" || (questions.length > 0 && !submission)}
          >
            {loadStatus === "loading" ? <Loader2 aria-hidden="true" /> : <FileQuestion aria-hidden="true" />}
            {loadStatus === "loading"
              ? mode === "manual"
                ? "正在读取题库"
                : mode === "web"
                  ? "正在联网检索题源并组卷…"
                  : "AI 正在生成，请稍候…"
              : "组卷并开始"}
          </button>

          {(questions.length > 0 || submission) && (
            <button type="button" className="lm-quiz-text-button" onClick={handleResetDraft}>
              <RotateCcw aria-hidden="true" />
              重新选择条件
            </button>
          )}

          <dl className="lm-quiz-contract">
            <div>
              <dt>保存方式</dt>
              <dd>一次性提交到后端；切题不会丢失本地答案。</dd>
            </div>
            <div>
              <dt>计时依据</dt>
              <dd>后端没有开始/暂停接口，页面只记录本地用时。</dd>
            </div>
            <div>
              <dt>结果来源</dt>
              <dd>正确答案、得分、错题和建议均来自提交返回。</dd>
            </div>
          </dl>
        </aside>

        <main className="lm-quiz-main">
          {loadStatus === "idle" && (
            <EmptyPanel
              icon={<BookOpen />}
              title="先生成一份可作答测验"
              description="开始前不会显示题号、计时、提示或交卷。选择课程、题数和难度后即可开始。"
              actions={
                <button
                  type="button"
                  className="lm-button lm-button--primary"
                  onClick={() => void handleStartQuiz()}
                >
                  读取题库
                </button>
              }
            />
          )}

          {loadStatus === "loading" && (
            <EmptyPanel
              icon={<Loader2 className="is-spinning" />}
              title="正在读取真实题库"
              description="如果题库为空，页面会停在空状态，不会创建测验尝试或写入空答案。"
            />
          )}

          {loadStatus === "empty" && (
            <EmptyPanel
              icon={<AlertCircle />}
              title="当前没有可作答的题目"
              description={loadMessage || "当前条件下没有可提交的题目。"}
              actions={
                <>
                  <button
                    type="button"
                    className="lm-button lm-button--primary"
                    onClick={() => void handleStartQuiz()}
                  >
                    <RefreshCw aria-hidden="true" />
                    重试加载
                  </button>
                  <button type="button" className="lm-button" onClick={() => onNavigateToTab("path")}>
                    返回学习路径
                  </button>
                  <button type="button" className="lm-button" onClick={() => onNavigateToTab("resource")}>
                    前往资源中心
                  </button>
                </>
              }
            />
          )}

          {loadStatus === "error" && (
            <EmptyPanel
              icon={<AlertCircle />}
              title="测验题库暂时无法读取"
              description={loadMessage}
              tone="error"
              actions={
                <button
                  type="button"
                  className="lm-button lm-button--primary"
                  onClick={() => void handleStartQuiz()}
                >
                  重试读取
                </button>
              }
            />
          )}

          {loadStatus === "ready" && currentQuestion && !submission && (
            <section className="lm-quiz-active" aria-labelledby="quiz-current-question">
              <div className="lm-quiz-status-row" role="status" aria-live="polite">
                <span>{loadMessage}</span>
                <strong>
                  {answeredCount}/{questions.length} 已作答
                </strong>
              </div>

              <div className="lm-quiz-active-grid">
                <article className="lm-quiz-question-panel">
                  <div className="lm-quiz-question-meta">
                    <div>
                      <span>{questionTypeLabel(currentQuestion.type)}</span>
                      <span>{currentQuestion.subject}</span>
                      {currentQuestion.knowledgePoint && <span>{currentQuestion.knowledgePoint}</span>}
                      {currentQuestion.difficulty && (
                        <span>{difficultyLabel(currentQuestion.difficulty)}</span>
                      )}
                    </div>
                    <strong id="quiz-current-question">
                      第 {currentIndex + 1} 题 / 共 {questions.length} 题
                    </strong>
                  </div>

                  <fieldset className="lm-quiz-question-fieldset">
                    <legend>
                      <MarkdownRenderer content={currentQuestion.stem} />
                    </legend>

                    {currentQuestion.code && (
                      <div className="lm-quiz-code">
                        <span>代码片段</span>
                        <pre>
                          <code>{currentQuestion.code}</code>
                        </pre>
                      </div>
                    )}

                    <div className="lm-quiz-options">
                      {currentQuestion.options.map((option) => {
                        const checked = answers[currentQuestion.id] === option.key;
                        const inputId = `quiz-${currentQuestion.id}-${option.key}`;
                        return (
                          <label
                            key={option.key}
                            className={`lm-quiz-option ${checked ? "is-selected" : ""}`}
                            htmlFor={inputId}
                          >
                            <input
                              id={inputId}
                              type="radio"
                              name={`quiz-${currentQuestion.id}`}
                              checked={checked}
                              onChange={() => handleSelectAnswer(currentQuestion, option.key)}
                            />
                            <span>{option.key}</span>
                            <MarkdownRenderer content={option.content} />
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {hints[currentQuestion.id]?.visible && (
                    <div
                      className="lm-quiz-hint"
                      role={hints[currentQuestion.id]?.error ? "alert" : "status"}
                    >
                      <HelpCircle aria-hidden="true" />
                      <div>
                        <strong>提示</strong>
                        {hints[currentQuestion.id]?.loading ? (
                          <p>正在读取本题提示...</p>
                        ) : hints[currentQuestion.id]?.text ? (
                          <MarkdownRenderer content={hints[currentQuestion.id].text} />
                        ) : (
                          <p>{hints[currentQuestion.id]?.error || "本题暂时没有更多提示。"}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {submitError && (
                    <p className="lm-quiz-error" role="alert">
                      {submitError}
                    </p>
                  )}

                  {confirmingSubmit && (
                    <div className="lm-quiz-submit-confirm" role="group" aria-label="提交确认">
                      <ShieldCheck aria-hidden="true" />
                      <div>
                        <strong>确认提交本次测验？</strong>
                        <p>提交后会更新画像、错题和建议。答案会保留到提交成功为止。</p>
                      </div>
                      <button
                        type="button"
                        className="lm-button lm-button--primary"
                        disabled={submitting}
                        onClick={() => void handleConfirmSubmit()}
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
                        onClick={() => goToQuestion(currentIndex - 1)}
                        aria-label="上一题"
                      >
                        <ChevronLeft aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`lm-quiz-mark ${marked[currentQuestion.id] ? "is-marked" : ""}`}
                        onClick={() => handleToggleMarked(currentQuestion)}
                      >
                        {marked[currentQuestion.id] ? "取消标记" : "标记复查"}
                      </button>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="lm-button"
                        disabled={hints[currentQuestion.id]?.loading}
                        onClick={() => void handleRequestHint(currentQuestion)}
                      >
                        <HelpCircle aria-hidden="true" />
                        查看提示
                      </button>
                      {currentIndex < questions.length - 1 ? (
                        <button
                          type="button"
                          className="lm-button lm-button--primary"
                          onClick={() => goToQuestion(currentIndex + 1)}
                        >
                          下一题
                          <ChevronRight aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="lm-button lm-button--primary"
                          disabled={submitting}
                          onClick={handleSubmitRequest}
                        >
                          交卷
                        </button>
                      )}
                    </div>
                  </div>
                </article>

                <aside className="lm-quiz-map" aria-labelledby="quiz-map-title">
                  <h2 id="quiz-map-title">答题进度</h2>
                  <p>
                    {unansweredCount
                      ? `还剩 ${unansweredCount} 道未作答`
                      : "所有题目已作答，可以检查后提交。"}
                  </p>
                  <div className="lm-quiz-map__grid">
                    {questions.map((question, index) => {
                      const isCurrent = index === currentIndex;
                      const isAnswered = Boolean(answers[question.id]);
                      const isMarked = Boolean(marked[question.id]);
                      return (
                        <button
                          key={question.id}
                          type="button"
                          aria-current={isCurrent ? "step" : undefined}
                          className={`${isCurrent ? "is-current" : ""} ${isAnswered ? "is-answered" : ""} ${isMarked ? "is-marked" : ""}`}
                          onClick={() => goToQuestion(index)}
                        >
                          {index + 1}
                          <span>{isAnswered ? "已答" : isMarked ? "标记" : "未答"}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="lm-button lm-button--primary lm-quiz-map__submit"
                    disabled={submitting}
                    onClick={handleSubmitRequest}
                  >
                    检查并交卷
                  </button>
                </aside>
              </div>
            </section>
          )}

          {submission && (
            <QuizResult
              questions={questions}
              answers={answers}
              submission={submission}
              resultByQuestionId={resultByQuestionId}
              elapsedSeconds={elapsedSeconds}
              onNavigateToTab={onNavigateToTab}
              onRestart={handleResetDraft}
            />
          )}
        </main>
      </section>
    </div>
  );
}

function QuizResult({
  questions,
  answers,
  submission,
  resultByQuestionId,
  elapsedSeconds,
  onNavigateToTab,
  onRestart,
}: {
  questions: WorkQuestion[];
  answers: Record<string, string>;
  submission: QuizSubmissionResult;
  resultByQuestionId: Map<string, QuizSubmissionResult["questionResults"][number]>;
  elapsedSeconds: number;
  onNavigateToTab: (tab: string, prefillData?: unknown) => void;
  onRestart: () => void;
}) {
  const wrongQuestions = questions.filter(
    (question) => resultByQuestionId.get(question.id)?.isCorrect === false,
  );
  const firstRecommendation = submission.recommendations[0] || null;
  const mappedResource = firstRecommendation ? mapRecommendation(firstRecommendation) : null;

  return (
    <section className="lm-quiz-result" aria-labelledby="quiz-result-title">
      <div className="lm-quiz-result-summary">
        <div>
          <p>提交成功</p>
          <h2 id="quiz-result-title">先看复习重点，再决定下一步</h2>
          <span>错题会进入错题本，画像也会随之更新。</span>
        </div>
        <dl>
          <div>
            <dt>答对</dt>
            <dd>
              {submission.correctCount}/{submission.totalCount}
            </dd>
          </div>
          <div>
            <dt>后端分数</dt>
            <dd>{submission.score}%</dd>
          </div>
          <div>
            <dt>本地用时</dt>
            <dd>{formatDuration(elapsedSeconds)}</dd>
          </div>
        </dl>
      </div>

      <div className="lm-quiz-next-action">
        <div>
          <strong>
            {wrongQuestions.length ? `本次记录到 ${wrongQuestions.length} 道错题` : "本次没有记录到错题"}
          </strong>
          <p>
            {wrongQuestions.length
              ? "建议先进入错题本查看原因、解析和推荐操作，再做同类练习。"
              : "可以继续当前学习路径，或换一个知识点再做一轮真实测验。"}
          </p>
        </div>
        <div>
          {wrongQuestions.length > 0 && (
            <button
              type="button"
              className="lm-button lm-button--primary"
              onClick={() => onNavigateToTab("errors")}
            >
              查看错题解释
            </button>
          )}
          {mappedResource && mappedResource.target === "resource" && (
            <button
              type="button"
              className="lm-button"
              onClick={() => onNavigateToTab("resource", mappedResource.prefill)}
            >
              去资源中心
            </button>
          )}
          {mappedResource && mappedResource.target === "codelab" && (
            <button type="button" className="lm-button" onClick={() => onNavigateToTab("codelab")}>
              进入 CodeLab
            </button>
          )}
          <button type="button" className="lm-button" onClick={() => onNavigateToTab("path")}>
            回到学习路径
          </button>
        </div>
      </div>

      {submission.errorAttributions.length > 0 && (
        <section className="lm-quiz-feedback-section" aria-labelledby="quiz-error-attribution-title">
          <h3 id="quiz-error-attribution-title">错误原因</h3>
          <div className="lm-quiz-feedback-list">
            {submission.errorAttributions.map((item) => (
              <article key={`${item.knowledgePointId}-${item.errorType}`}>
                <strong>
                  {item.knowledgePointName}：{item.label}
                </strong>
                <p>{item.evidence}</p>
                <small>
                  建议：{item.suggestion} · 置信度 {Math.round(item.confidence * 100)}%
                </small>
              </article>
            ))}
          </div>
        </section>
      )}

      {submission.masteryChanges.length > 0 && (
        <section className="lm-quiz-feedback-section" aria-labelledby="quiz-mastery-title">
          <h3 id="quiz-mastery-title">画像更新证据</h3>
          <dl className="lm-quiz-mastery-list">
            {submission.masteryChanges.map((item) => (
              <div key={item.knowledgePointId}>
                <dt>{item.knowledgePointName}</dt>
                <dd>
                  {item.before}% 到 {item.after}%（{item.delta > 0 ? "+" : ""}
                  {item.delta}）
                </dd>
                <dd>{item.reason}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {submission.recommendations.length > 0 && (
        <section className="lm-quiz-feedback-section" aria-labelledby="quiz-recommendations-title">
          <h3 id="quiz-recommendations-title">后端推荐的下一步</h3>
          <div className="lm-quiz-recommendations">
            {submission.recommendations.map((item) => {
              const mapped = mapRecommendation(item);
              return (
                <article key={`${item.priority}-${item.resourceType}-${item.knowledgePointId}`}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>
                      {item.reason} · 预计 {item.estimatedMinutes} 分钟
                    </p>
                    <small>
                      后端推荐类型：{resourceTypeLabel(item.resourceType)}
                      {mapped.note ? `；前端入口：${mapped.note}` : ""}
                    </small>
                  </div>
                  {mapped.target === "resource" ? (
                    <button
                      type="button"
                      className="lm-button"
                      onClick={() => onNavigateToTab("resource", mapped.prefill)}
                    >
                      打开入口
                      <ArrowRight aria-hidden="true" />
                    </button>
                  ) : (
                    <button type="button" className="lm-button" onClick={() => onNavigateToTab("codelab")}>
                      打开入口
                      <ArrowRight aria-hidden="true" />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="lm-quiz-review" aria-labelledby="quiz-review-title">
        <div className="lm-quiz-review__heading">
          <div>
            <h3 id="quiz-review-title">逐题解析</h3>
            <p>正确答案和解析在提交后展示。</p>
          </div>
          <button type="button" className="lm-button" onClick={onRestart}>
            再做一轮
          </button>
        </div>
        {questions.map((question, index) => {
          const result = resultByQuestionId.get(question.id);
          const selected = answers[question.id];
          return (
            <details key={question.id} className="lm-quiz-review-item" open={result?.isCorrect === false}>
              <summary>
                <span>{index + 1}</span>
                <strong>{question.knowledgePoint || question.subject}</strong>
                {result?.isCorrect ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                <em>{result?.isCorrect ? "回答正确" : "需要复盘"}</em>
              </summary>
              <div className="lm-quiz-review-item__body">
                <MarkdownRenderer content={question.stem} />
                {question.code && (
                  <pre>
                    <code>{question.code}</code>
                  </pre>
                )}
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
    </section>
  );
}

function EmptyPanel({
  icon,
  title,
  description,
  actions,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <section className={`lm-quiz-empty lm-quiz-empty--${tone}`}>
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actions && <div>{actions}</div>}
    </section>
  );
}

function normalizeQuestion(item: QuizPublicQuestion): WorkQuestion | null {
  const id = String(item.question_id || "").trim();
  const stem = String(item.stem || "").trim();
  const options = Array.isArray(item.options)
    ? item.options
        .map((option, index) => ({
          key: String(option.key || String.fromCharCode(65 + index))
            .trim()
            .toUpperCase(),
          content: String(option.content || "").trim(),
        }))
        .filter((option) => option.key && option.content)
    : [];

  if (!id || !stem || options.length < 2) return null;

  return {
    id,
    subject: String(item.subject || "未分类课程").trim(),
    chapter: item.chapter || null,
    knowledgePoint: item.knowledge_point || null,
    type: item.question_type || "single_choice",
    difficulty: item.difficulty || null,
    stem,
    code: String(item.code_context || "").trim(),
    options,
    hint: String(item.hint || "").trim(),
  };
}

function readDraft(): QuizDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuizDraft;
    const savedAt = new Date(parsed.savedAt).getTime();
    const fresh = Number.isFinite(savedAt) && Date.now() - savedAt < 24 * 60 * 60 * 1000;
    if (
      !fresh ||
      !Array.isArray(parsed.questions) ||
      parsed.questions.length === 0 ||
      !parsed.startedAt ||
      !parsed.attemptKey
    ) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

function createAttemptKey() {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

function questionTypeLabel(type: string) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("single")) return "单选题";
  if (normalized.includes("choice")) return "选择题";
  return "题目";
}

function difficultyLabel(value: string) {
  if (value === "基础" || value === "basic") return "基础";
  if (value === "提高" || value === "advanced") return "提高";
  if (value === "综合" || value === "challenge") return "综合";
  if (value === "冲刺") return "冲刺";
  return value;
}

function resourceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    diagram_note: "分步图解",
    code_lab: "代码练习",
    lecture_notes: "讲义",
    cheat_sheet: "重点总结",
    study_note: "学习讲义",
    mind_map: "思维导图",
    quiz_pack: "练习包",
    code_case: "代码案例",
  };
  return labels[value] || value;
}

function mapRecommendation(item: QuizSubmissionResult["recommendations"][number]) {
  if (item.resourceType === "code_lab") {
    return {
      target: "codelab" as const,
      note: "映射到 CodeLab",
      prefill: null,
    };
  }

  const resourceType =
    item.resourceType === "diagram_note"
      ? "mind_map"
      : item.resourceType === "lecture_notes" || item.resourceType === "cheat_sheet"
        ? "study_note"
        : item.resourceType;

  return {
    target: "resource" as const,
    note: resourceType === item.resourceType ? "" : `映射到 ${resourceTypeLabel(resourceType)}`,
    prefill: {
      resourceType,
      title: item.title,
      reason: item.reason,
      knowledgePointId: item.knowledgePointId,
    },
  };
}
