/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ClipboardList,
  Code2,
  Lightbulb,
  ListChecks,
  Timer,
} from "lucide-react";
import {
  describeApiError,
  getMyClasses,
  getQuizPaper,
  requestQuizHint,
  submitQuizAttempt,
  type QuizPaperQuestion,
  type QuizSubmissionResult,
} from "../api";
import CodeLabView from "../components/CodeLabView";
import { formatCodeText, splitQuestionStem } from "../lib/questionStem";
import { BlueprintHeader, BlueprintMotif } from "./BlueprintDecorations";

/** 知识检测只开放学科目录里的五门课（与题库/知识库科目一致） */
const QUIZ_SUBJECTS = ["数据结构", "操作系统", "计算机组成原理", "计算机网络", "C语言"];
const SUBJECT_HINTS: Record<string, string> = {
  "数据结构": "线性表 · 树与图 · 排序查找",
  "操作系统": "进程线程 · 内存管理 · 文件与 I/O",
  "计算机组成原理": "数据表示 · 存储层次 · CPU 与指令",
  "计算机网络": "体系结构 · 传输层 · 网络层",
  "C语言": "指针 · 数组与字符串 · 结构体",
};
const DEFAULT_CHOICE_COUNT = 6;
const DEFAULT_BLANK_COUNT = 4;
const OPTION_KEYS = ["A", "B", "C", "D"];

function normalizeAnswerText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()]/g, "");
}

/** 与后端 matchesFillBlankAnswer 对齐：填空题支持「答案1|答案2」多种写法 */
function isAnswerCorrect(question: QuizPaperQuestion, raw: string) {
  const mine = normalizeAnswerText(raw);
  if (!mine) return false;
  const correct = String(question.answer || "");
  if (!correct) return false;
  if (question.question_type === "fill_blank") {
    return correct
      .split("|")
      .map((item) => normalizeAnswerText(item))
      .filter(Boolean)
      .some((item) => item === mine || (item.length > 1 && mine.includes(item)));
  }
  return mine.toUpperCase() === correct.trim().toUpperCase();
}

interface Props {
  initialMode: "quiz" | "code";
  routePath: string;
  onNavigateToTab: (tab: string, data?: unknown) => void;
  onNavigateToExercise: (exerciseId?: string) => void;
  onNavigateToCodeList: () => void;
  prefill: { subject?: string; knowledgePoint?: string } | null;
}

export default function BlueprintQuizView({
  initialMode,
  routePath,
  onNavigateToTab,
  onNavigateToExercise,
  onNavigateToCodeList,
  prefill,
}: Props) {
  const [mode, setMode] = useState<"quiz" | "code">(initialMode);
  const [subject, setSubject] = useState(prefill?.subject || "");
  const [choiceCount, setChoiceCount] = useState(DEFAULT_CHOICE_COUNT);
  const [blankCount, setBlankCount] = useState(DEFAULT_BLANK_COUNT);
  const [contextReady, setContextReady] = useState(Boolean(prefill?.subject));
  const [questions, setQuestions] = useState<QuizPaperQuestion[]>([]);
  const [paperNotice, setPaperNotice] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<QuizSubmissionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(new Date().toISOString());

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!questions.length || result) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [questions.length, result]);

  const current = questions[index];
  const formattedTime = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const isFillBlank = (question?: QuizPaperQuestion) => question?.question_type === "fill_blank";
  /* 题干常常是「一句提问 + 一段代码」，拆开才能让代码按原样换行缩进显示 */
  const stemParts = current ? splitQuestionStem(current.stem) : null;
  const currentCode = current
    ? current.code_context
      ? formatCodeText(current.code_context)
      : stemParts?.code || ""
    : "";

  /** 从题库直接组卷（选择题 + 填空题），判分交给 /api/quiz/submit */
  const generate = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setPaperNotice("");
    try {
      const paper = await getQuizPaper({ subject, choice: choiceCount, blank: blankCount, reveal: true });
      setQuestions(paper.questions);
      setIndex(0);
      setAnswers({});
      setHint("");
      setMarked(new Set());
      setElapsed(0);
      startedAt.current = new Date().toISOString();
      const blankReal = paper.questions.filter((item) => item.question_type === "fill_blank").length;
      setPaperNotice(
        `本次共 ${paper.questions.length} 题：选择题 ${paper.questions.length - blankReal} 道 · 填空题 ${blankReal} 道` +
          (paper.available && paper.available.fill_blank === 0 ? "（该科目题库暂无填空题）" : ""),
      );
    } catch (reason) {
      setQuestions([]);
      setError(describeApiError(reason, "组卷失败，请换一门课程再试"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 解析默认课程：优先用跳转带过来的参数，其次学生所在班级的科目，最后兜底「数据结构」。
   * 课程只能是五门课之一（与题库/知识库科目一致），所以这里还要把别名归一化。
   */
  useEffect(() => {
    if (prefill?.subject) {
      setContextReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      let nextSubject = "";
      try {
        const classes = await getMyClasses();
        nextSubject = classes.data?.find((item) => item.subject)?.subject || "";
      } catch {
        /* 班级接口拿不到就退回默认科目 */
      }
      if (cancelled) return;
      const matched = QUIZ_SUBJECTS.find((item) => item === nextSubject);
      setSubject(matched || "数据结构");
      setContextReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [prefill?.subject]);

  const resetPaper = () => {
    setQuestions([]);
    setResult(null);
    setAnswers({});
    setMarked(new Set());
    setHint("");
    setElapsed(0);
    setPaperNotice("");
    setError("");
  };

  const submit = async () => {
    if (!questions.length) return;
    const unanswered = questions.filter((question) => !String(answers[question.question_id] || "").trim());
    if (unanswered.length && !window.confirm(`还有 ${unanswered.length} 道题没作答，确定提交吗？`)) return;
    setLoading(true);
    setError("");
    try {
      const value = await submitQuizAttempt({
        idempotencyKey: crypto.randomUUID(),
        subject,
        startedAt: startedAt.current,
        submittedAt: new Date().toISOString(),
        answers: questions.map((question) => ({
          questionId: question.question_id,
          // 填空题留空会直接被后端拒绝，这里用占位符代替“未作答”
          answer:
            String(answers[question.question_id] || "").trim() || (isFillBlank(question) ? "（未作答）" : ""),
          durationSeconds: Math.max(1, Math.round(elapsed / questions.length)),
        })),
      });
      setResult(value);
    } catch (reason) {
      setError(describeApiError(reason, "测验提交失败"));
    } finally {
      setLoading(false);
    }
  };

  const loadHint = async () => {
    if (!current) return;
    try {
      const value = await requestQuizHint({
        question: current.stem,
        code: current.code_context || undefined,
        options: current.options.map((option) => option.content),
      });
      setHint(value.hint);
    } catch (reason) {
      setError(describeApiError(reason, "提示生成失败"));
    }
  };

  const answered = Object.keys(answers).length;
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  const selected = current ? answers[current.question_id] : "";
  /* 练习模式（reveal=1）下每题都能即时批改，右侧答题卡 / 当前得分 / 错题据此实时更新 */
  const mine = current ? String(answers[current.question_id] || "").trim() : "";
  const answerKey = current
    ? String(current.answer || "")
        .trim()
        .toUpperCase()
    : "";
  const answeredCorrect = Boolean(current && mine && isAnswerCorrect(current, mine));
  const answeredCount = questions.filter((question) =>
    String(answers[question.question_id] || "").trim(),
  ).length;
  const correctCount = questions.filter((question) =>
    isAnswerCorrect(question, String(answers[question.question_id] || "")),
  ).length;
  const wrongCount = answeredCount - correctCount;
  const scorePercent = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;

  return (
    <section className="bp-page bp-quiz-page">
      <BlueprintMotif variant="branch" />
      <BlueprintHeader title="能力检测" english="ASSESSMENT STUDIO" />

      <div className="bp-assessment-switch" role="tablist" aria-label="检测类型">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "quiz"}
          className={mode === "quiz" ? "is-active" : ""}
          onClick={() => onNavigateToTab("quiz", { subject })}
        >
          <ListChecks />
          知识检测<span>选择题 + 填空题，提交即判分</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "code"}
          className={mode === "code" ? "is-active" : ""}
          onClick={() => onNavigateToTab("codelab")}
        >
          <Code2 />
          编程实战<span>运行代码并提交评测</span>
        </button>
      </div>

      {mode === "quiz" && (
        <>
          <div className="bp-assessment-caption">
            <span>KNOWLEDGE CHECK</span>
            <strong>{subject || "选择题库科目"}</strong>
          </div>

          {!questions.length && !result && (
            <div className="bp-quiz-setup bp-quiz-setup--wide">
              <div className="bp-quiz-setup__main">
                <span className="bp-quiz-setup__kicker">KNOWLEDGE CHECK · 题库直出</span>
                <h2>选择课程，开始检测</h2>
                <p className="bp-quiz-setup__lead">
                  题目来自课程题库里已审核的公共题，选择题与填空题混排；答题过程中即时批改，随时可以在右侧答题卡跳题、看当前得分与本次错题。
                </p>

                <div className="bp-quiz-course-grid" role="radiogroup" aria-label="选择课程">
                  {QUIZ_SUBJECTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="radio"
                      aria-checked={subject === item}
                      className={subject === item ? "is-active" : ""}
                      onClick={() => {
                        setSubject(item);
                        setError("");
                      }}
                    >
                      <strong>{item}</strong>
                      <span>{SUBJECT_HINTS[item] || "章节练习与综合题"}</span>
                    </button>
                  ))}
                </div>

                <div className="bp-quiz-count-row">
                  <label>
                    选择题
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={choiceCount}
                      onChange={(event) =>
                        setChoiceCount(Math.max(0, Math.min(20, Number(event.target.value) || 0)))
                      }
                    />
                    <em>道</em>
                  </label>
                  <label>
                    填空题
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={blankCount}
                      onChange={(event) =>
                        setBlankCount(Math.max(0, Math.min(10, Number(event.target.value) || 0)))
                      }
                    />
                    <em>道</em>
                  </label>
                  <span className="bp-quiz-count-row__total">共 {choiceCount + blankCount} 道</span>
                </div>

                <button
                  className="bp-primary-action bp-quiz-setup__start"
                  onClick={generate}
                  disabled={loading}
                >
                  {loading ? "正在组卷…" : "开始检测"}
                  <span className="bp-arrow-chip" aria-hidden="true">
                    <ArrowRight />
                  </span>
                </button>
                {paperNotice && <p className="bp-quiz-setup__tip">{paperNotice}</p>}
              </div>

              <aside className="bp-quiz-setup__side" aria-label="检测说明">
                <section>
                  <h3>本次检测怎么算</h3>
                  <ul>
                    <li>
                      <b>即时批改</b>：选完/填完立刻判对错，并给出解析。
                    </li>
                    <li>
                      <b>当前得分</b>按「答对 ÷ 总题数」实时折算成百分制。
                    </li>
                    <li>
                      <b>本次错题</b>会汇总在右侧，交卷后写入错题本与复习队列。
                    </li>
                  </ul>
                </section>
                <section>
                  <h3>题库覆盖</h3>
                  <ul className="bp-quiz-setup__subjects">
                    {QUIZ_SUBJECTS.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>
          )}

          {!questions.length && !loading && error && (
            <p className="bp-quiz-setup-error" role="alert">
              {error}
              <span>可以换一门课程，或调整题量后重试。</span>
            </p>
          )}

          {paperNotice && <p className="bp-quiz-paper-notice">{paperNotice} · 答题即时批改，可随时交卷</p>}

          {current && !result && (
            <div className="bp-quiz-shell">
              <div className="bp-quiz-main">
                <article className="bp-question-sheet">
                  <header className="bp-question-sheet__bar">
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <div>
                      <span>
                        {subject} · {current.knowledge_point || current.chapter || "综合"}
                      </span>
                      <em>
                        {isFillBlank(current) ? "填空题" : "单选题"}
                        {current.difficulty ? ` · ${current.difficulty}` : ""}
                      </em>
                    </div>
                    <p className="bp-question-sheet__timer">
                      <Timer aria-hidden="true" />
                      已用 {formattedTime}
                    </p>
                  </header>

                  <h2>{stemParts?.prose || current.stem}</h2>
                  {currentCode && <pre className="bp-question-sheet__code">{currentCode}</pre>}
                  {stemParts?.tail && <p className="bp-question-sheet__tail">{stemParts.tail}</p>}

                  {isFillBlank(current) ? (
                    <label className="bp-answer-blank">
                      <span>你的答案（多个可接受写法用空格分隔，如：递增 升序）</span>
                      <input
                        value={answers[current.question_id] || ""}
                        onChange={(event) =>
                          setAnswers((value) => ({ ...value, [current.question_id]: event.target.value }))
                        }
                        placeholder="在这里填写答案"
                        autoComplete="off"
                      />
                    </label>
                  ) : (
                    <div className="bp-answer-grid">
                      {current.options.map((option, optionIndex) => {
                        const isSelected = selected === option.key;
                        const answered = Boolean(mine);
                        const isRight = answered && answerKey === option.key;
                        const isWrongPick = answered && isSelected && !isRight;
                        const className = [
                          isRight ? "is-right" : "",
                          isWrongPick ? "is-wrong" : "",
                          isSelected ? "is-selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <button
                            key={option.key}
                            type="button"
                            className={className}
                            onClick={() =>
                              setAnswers((value) => ({ ...value, [current.question_id]: option.key }))
                            }
                          >
                            <b>{option.key || OPTION_KEYS[optionIndex]}</b>
                            <span>{option.content}</span>
                            {isRight && <Check aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>

                {mine && (
                  <aside
                    className={`bp-quiz-feedback ${answeredCorrect ? "is-correct" : "is-wrong"}`}
                    role="status"
                  >
                    <header>
                      {answeredCorrect ? <Check aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                      <strong>{answeredCorrect ? "答对了" : "答错了"}</strong>
                      <span>正确答案：{current.answer}</span>
                    </header>
                    {current.analysis && <p>{current.analysis}</p>}
                  </aside>
                )}

                {hint && (
                  <aside className="bp-quiz-hint">
                    <Lightbulb />
                    {hint}
                  </aside>
                )}
                {error && <div className="bp-inline-error">{error}</div>}

                <footer className="bp-quiz-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      setIndex((value) => value - 1);
                      setHint("");
                    }}
                  >
                    <ArrowLeft />
                    上一题
                  </button>
                  <button
                    type="button"
                    className={marked.has(current.question_id) ? "is-marked" : ""}
                    onClick={() =>
                      setMarked((value) => {
                        const next = new Set(value);
                        next.has(current.question_id)
                          ? next.delete(current.question_id)
                          : next.add(current.question_id);
                        return next;
                      })
                    }
                  >
                    <Bookmark />
                    标记疑问
                  </button>
                  <button type="button" onClick={loadHint}>
                    <Lightbulb />
                    查看提示
                  </button>
                  <span className="bp-quiz-actions__progress">
                    第 {index + 1} / {questions.length} 题
                  </span>
                  {index < questions.length - 1 ? (
                    <button
                      type="button"
                      className="bp-next"
                      onClick={() => {
                        setIndex((value) => value + 1);
                        setHint("");
                      }}
                    >
                      下一题
                      <span className="bp-arrow-chip" aria-hidden="true">
                        <ArrowRight />
                      </span>
                    </button>
                  ) : (
                    <button type="button" className="bp-next" disabled={loading} onClick={submit}>
                      提交检测
                      <span className="bp-arrow-chip" aria-hidden="true">
                        <ArrowRight />
                      </span>
                    </button>
                  )}
                </footer>
              </div>

              <aside className="bp-quiz-rail" aria-label="答题卡与得分">
                <section className="bp-quiz-card">
                  <header>
                    <h3>答题卡</h3>
                    <span>{questions.length} 题</span>
                  </header>
                  <div className="bp-quiz-sheet-grid">
                    {questions.map((question, questionIndex) => {
                      const answer = String(answers[question.question_id] || "").trim();
                      const state = answer
                        ? isAnswerCorrect(question, answer)
                          ? "is-right"
                          : "is-wrong"
                        : "is-empty";
                      return (
                        <button
                          key={question.question_id}
                          type="button"
                          className={`${state}${questionIndex === index ? " is-current" : ""}${marked.has(question.question_id) ? " is-marked" : ""}`}
                          onClick={() => {
                            setIndex(questionIndex);
                            setHint("");
                          }}
                          title={
                            answer
                              ? `第 ${questionIndex + 1} 题：${state === "is-right" ? "答对" : "答错"}`
                              : `第 ${questionIndex + 1} 题：未作答`
                          }
                        >
                          {questionIndex + 1}
                        </button>
                      );
                    })}
                  </div>
                  <div className="bp-quiz-sheet-legend">
                    <span>
                      <i className="is-right" />
                      答对 {correctCount}
                    </span>
                    <span>
                      <i className="is-wrong" />
                      答错 {wrongCount}
                    </span>
                    <span>
                      <i className="is-empty" />
                      未答 {questions.length - answeredCount}
                    </span>
                  </div>
                </section>

                <section className="bp-quiz-card bp-quiz-card--score">
                  <header>
                    <h3>当前得分</h3>
                    <span>实时</span>
                  </header>
                  <div className="bp-quiz-score">
                    <div
                      className="bp-quiz-score__ring"
                      style={{ "--bp-score": `${scorePercent}%` } as React.CSSProperties}
                    >
                      <strong>{scorePercent}</strong>
                      <small>分</small>
                    </div>
                    <dl>
                      <div>
                        <dt>已答</dt>
                        <dd>
                          {answeredCount} / {questions.length}
                        </dd>
                      </div>
                      <div>
                        <dt>正确率</dt>
                        <dd>
                          {answeredCount ? `${Math.round((correctCount / answeredCount) * 100)}%` : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>用时</dt>
                        <dd>{formattedTime}</dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section className="bp-quiz-card bp-quiz-card--wrong">
                  <header>
                    <h3>本次错题</h3>
                    <span>{wrongCount} 道</span>
                  </header>
                  {wrongCount === 0 && <p className="bp-quiz-card__empty">还没有错题，继续加油。</p>}
                  <ul>
                    {questions.map((question, questionIndex) => {
                      const answer = String(answers[question.question_id] || "").trim();
                      if (!answer || isAnswerCorrect(question, answer)) return null;
                      return (
                        <li key={question.question_id}>
                          <button
                            type="button"
                            onClick={() => {
                              setIndex(questionIndex);
                              setHint("");
                            }}
                          >
                            <b>Q{String(questionIndex + 1).padStart(2, "0")}</b>
                            <span>{splitQuestionStem(question.stem).prose || question.stem}</span>
                            <em>{isFillBlank(question) ? "填空" : "选择"}</em>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </aside>
            </div>
          )}

          {loading && (
            <div className="bp-loading-line">
              <i />
              正在准备检测内容…
            </div>
          )}

          {result && (
            <section className="bp-quiz-result">
              <span>ASSESSMENT COMPLETE</span>
              <h2>
                {Math.round(result.score)}
                <small>分</small>
              </h2>
              <p>
                答对 {result.correctCount} / {result.totalCount} 题，已自动判分。下面可以逐题核对答案与解析。
              </p>
              <div>
                {result.masteryChanges.slice(0, 4).map((item) => (
                  <span key={item.knowledgePointId}>
                    <b>{item.knowledgePointName}</b>
                    {Math.round(item.before)} → {Math.round(item.after)}
                  </span>
                ))}
              </div>
              <button className="bp-primary-action" onClick={() => onNavigateToTab("report")}>
                查看学习报告
                <ClipboardList />
                <span className="bp-arrow-chip" aria-hidden="true">
                  <ArrowRight />
                </span>
              </button>
              <button className="bp-line-button" onClick={resetPaper}>
                再测一组
              </button>

              <div className="bp-quiz-review">
                {questions.map((question, questionIndex) => {
                  const item = result.questionResults?.find(
                    (entry) => entry.questionId === question.question_id,
                  );
                  const mine = String(answers[question.question_id] || "").trim();
                  const parts = splitQuestionStem(question.stem);
                  const reviewCode = question.code_context
                    ? formatCodeText(question.code_context)
                    : parts.code;
                  return (
                    <article
                      key={question.question_id}
                      className={item?.isCorrect ? "is-correct" : "is-wrong"}
                    >
                      <header>
                        <b>Q{String(questionIndex + 1).padStart(2, "0")}</b>
                        <span>{isFillBlank(question) ? "填空题" : "选择题"}</span>
                        <em>{item?.isCorrect ? "答对" : "答错"}</em>
                      </header>
                      <h4>{parts.prose || question.stem}</h4>
                      {reviewCode && <pre className="bp-quiz-review__code">{reviewCode}</pre>}
                      {parts.tail && <p className="bp-quiz-review__tail">{parts.tail}</p>}
                      {!isFillBlank(question) && (
                        <ul className="bp-quiz-review__options">
                          {question.options.map((option) => (
                            <li
                              key={option.key}
                              className={
                                option.key === item?.correctAnswer
                                  ? "is-right"
                                  : option.key === mine
                                    ? "is-mine"
                                    : ""
                              }
                            >
                              <b>{option.key}</b>
                              {option.content}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="bp-quiz-review__answer">
                        你的答案：<b>{mine || "未作答"}</b>
                        <i>·</i>
                        正确答案：<b>{item?.correctAnswer || "—"}</b>
                      </p>
                      {item?.analysis && <p className="bp-quiz-review__analysis">{item.analysis}</p>}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {mode === "code" && (
        <section className="bp-code-assessment bp-code-assessment--embedded">
          <header>
            <div>
              <span>CODE PRACTICE</span>
              <h2>编程实战</h2>
              <p>选题、编写、运行和提交都在当前能力检测中完成。</p>
            </div>
          </header>
          <CodeLabView
            embedded
            routePath={routePath}
            onNavigateToTab={onNavigateToTab}
            onNavigateToExercise={(exerciseId) => onNavigateToExercise(exerciseId)}
            onNavigateToList={onNavigateToCodeList}
          />
        </section>
      )}
    </section>
  );
}
