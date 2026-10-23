/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  CodeExercise,
  CodeRunResult,
  CodeSolution,
  describeApiError,
  explainCodeRun,
  getCodeExerciseDetail,
  getCodeSolution,
  getCodeSubmissions,
  getStoredUser,
  getCodeRunnerHealth,
  runCode,
  submitCode,
} from "../api";

interface CodeLabWorkspaceProps {
  exerciseId: string;
  onBackToList: () => void;
}

export default function CodeLabWorkspace({ exerciseId, onBackToList }: CodeLabWorkspaceProps) {
  const [exercise, setExercise] = useState<CodeExercise | null>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [stdin, setStdin] = useState("");
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [explanation, setExplanation] = useState("");
  const [solution, setSolution] = useState<CodeSolution | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [runError, setRunError] = useState("");
  const [explainError, setExplainError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [runnerReady, setRunnerReady] = useState<boolean | null>(null);
  const submitLockRef = useRef(false);
  useEffect(() => {
    let active = true;
    getCodeRunnerHealth()
      .then((health) => {
        if (active) setRunnerReady(health.available);
      })
      .catch(() => {
        if (active) setRunnerReady(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const draftKey = useMemo(() => {
    const studentId = getStoredUser()?.studentId || getStoredUser()?.id || "student";
    const language = exercise?.language || "c";
    return `learnmate:codelab:draft:${studentId}:${exerciseId}:${language}`;
  }, [exercise?.language, exerciseId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDetailError("");
    setRunError("");
    setExplainError("");
    setSavedNotice("");
    setRunResult(null);
    setExplanation("");
    setSolution(null);
    setDraftReady(false);

    getCodeExerciseDetail(exerciseId)
      .then(async (detail) => {
        if (cancelled) return;
        setExercise(detail);
        const language = detail?.language || "c";
        const studentId = getStoredUser()?.studentId || getStoredUser()?.id || "student";
        const key = `learnmate:codelab:draft:${studentId}:${exerciseId}:${language}`;
        const savedDraft = typeof window === "undefined" ? null : window.localStorage.getItem(key);
        setSourceCode(savedDraft !== null ? savedDraft : (detail?.starter_code ?? ""));
        setStdin(detail?.sample_input ?? "");
        setDraftReady(true);

        if (!detail?.exercise_id) return;
        try {
          const submissions = await getCodeSubmissions({
            exerciseId: detail.exercise_id,
            mode: "submit",
            limit: 1,
          });
          if (cancelled || !submissions.length) return;
          const latest = submissions[0];
          setRunResult(latest.result);
          void loadSolution();
          setSavedNotice(
            latest.status === "accepted"
              ? "已恢复最近一次正式提交结果：全部测试点均已通过。"
              : "已恢复最近一次正式提交结果，可继续修改并再次挑战。",
          );
        } catch {
          // Submission history is helpful for continuity but should not block opening the exercise.
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setExercise(null);
          setDetailError(describeApiError(reason, "题目详情暂时无法读取"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseId, reloadKey]);

  useEffect(() => {
    if (!draftReady || typeof window === "undefined") return;
    window.localStorage.setItem(draftKey, sourceCode);
  }, [draftKey, draftReady, sourceCode]);

  const tags = useMemo(() => parseTags(exercise?.tags), [exercise?.tags]);
  const canRun = Boolean(exercise?.public_run_available && sourceCode.trim() && !isSubmitting);
  const canSubmit = Boolean(exercise?.submission_available && sourceCode.trim() && !isSubmitting);

  const handleResetCode = () => {
    if (!exercise) return;
    setSourceCode(exercise.starter_code ?? "");
    setRunResult(null);
    setExplanation("");
    setRunError("");
    setExplainError("");
    setSavedNotice("已恢复为题目初始代码，草稿会继续自动保存。");
  };

  const handleRunPublicTests = async (runMode: "custom" | "public" = "public") => {
    if (!exercise || submitLockRef.current) return;
    if (runMode === "public" && !exercise.public_run_available) {
      setRunError("这道练习的测试内容尚未准备完成，请先选择其他编程练习。");
      return;
    }
    if (!sourceCode.trim()) {
      setRunError("源码不能为空，请先补充代码后再运行。");
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setRunError("");
    setRunResult(null);
    setExplanation("");
    setExplainError("");
    setSavedNotice("");

    try {
      const result = await runCode({
        exerciseId: exercise.exercise_id,
        language: exercise.language || "c",
        sourceCode,
        stdin,
        runMode,
      });
      setRunResult(result);
      setSavedNotice(
        runMode === "custom"
          ? "已按你的标准输入运行；自测不计入题目通过记录。"
          : "样例运行完成，可继续提交评测。",
      );
    } catch (reason) {
      setRunError(describeApiError(reason, "样例运行失败"));
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleFormalSubmit = async () => {
    if (!exercise || submitLockRef.current) return;
    if (!exercise.public_run_available) {
      setRunError("这道练习的测试内容尚未准备完成，请先选择其他编程练习。");
      return;
    }
    if (!exercise.submission_available) {
      setRunError("这道练习目前仅支持样例自测，请选择可正式评测的练习后再提交。");
      return;
    }
    if (!sourceCode.trim()) {
      setRunError("源码不能为空，请先补充代码后再正式提交。");
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setRunError("");
    setRunResult(null);
    setExplanation("");
    setExplainError("");
    setSavedNotice("");

    try {
      const result = await submitCode({
        exerciseId: exercise.exercise_id,
        language: exercise.language || "c",
        sourceCode,
        idempotencyKey: buildIdempotencyKey(exercise.exercise_id),
      });
      setRunResult(result.result);
      void loadSolution();
      setSavedNotice(
        result.result.status === "accepted"
          ? "正式提交已通过全部测试，本次完成状态已经保存。"
          : "正式评测已经完成，可根据结果继续修改。",
      );
    } catch (reason) {
      setRunError(describeApiError(reason, "CodeLab 正式提交失败"));
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  // 提交前不展示讲解；已提交过的学生打开题目时直接解锁，避免重复提交。
  async function loadSolution() {
    try {
      const data = await getCodeSolution(exerciseId);
      setSolution(data);
    } catch {
      setSolution(null);
    }
  }

  const handleExplainRun = async () => {
    if (!exercise) return;

    if (!runResult) {
      setExplainError("请先提交并运行一次，再请求 AI 解释。");
      return;
    }

    setIsExplaining(true);
    setExplainError("");
    setExplanation("");

    try {
      const result = await explainCodeRun({
        exerciseId: exercise.exercise_id,
        sourceCode,
        stdout: runResult.stdout || "",
        stderr: runResult.stderr || "",
        compileOutput: runResult.compileOutput || "",
      });

      setExplanation(result.explanation || "AI 已完成分析，但暂未返回详细文本。");
    } catch (reason) {
      setExplainError(describeApiError(reason, "AI 解释暂时不可用"));
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <div className="lm-codelab-workspace">
      <section className="lm-codelab-workspace__header">
        <button type="button" className="lm-button" onClick={onBackToList}>
          <ArrowLeft aria-hidden="true" />
          返回题库
        </button>
        <div>
          <span className="lm-label-chip">
            <Code2 aria-hidden="true" />
            {(exercise?.language || "c").toUpperCase()} 练习
          </span>
          <h2>{exercise?.title || "代码练习工作区"}</h2>
          {exercise && (
            <p>
              {exercise.subject} · {exercise.knowledge_point} · {exercise.difficulty || "基础"}
            </p>
          )}
        </div>
      </section>

      {isLoading && (
        <div className="lm-codelab-loading" role="status">
          <Loader2 aria-hidden="true" />
          正在打开代码练习
        </div>
      )}

      {!isLoading && detailError && (
        <div className="lm-codelab-state lm-codelab-state--error">
          <AlertCircle aria-hidden="true" />
          <div>
            <strong>题目详情暂时无法读取</strong>
            <p>{detailError}</p>
            <button type="button" className="lm-button" onClick={() => setReloadKey((value) => value + 1)}>
              重新读取
            </button>
          </div>
        </div>
      )}

      {!isLoading && exercise && (
        <div className="lm-codelab-workspace__grid">
          <aside className="lm-codelab-detail" aria-label="题目说明">
            <MetaRow
              items={[
                exercise.knowledge_point,
                exercise.difficulty,
                (exercise.language || "c").toUpperCase(),
                ...tags,
              ]}
            />
            <DetailBlock title="题目描述" content={exercise.description} />
            <CodeBlock title="样例输入" content={exercise.sample_input || "无输入"} />
            <CodeBlock title="样例输出" content={exercise.sample_output || "暂无样例输出"} />
            <DetailBlock
              title="练习目标"
              content={
                exercise.knowledge_point
                  ? `完成「${exercise.knowledge_point}」的核心实现；讲解与参考答案会在正式提交后解锁。`
                  : "完成本题核心代码结构；讲解与参考答案会在正式提交后解锁。"
              }
            />
          </aside>

          <section className="lm-codelab-editor" aria-label="代码编辑与提交">
            <div className="lm-codelab-editor__toolbar">
              <div>
                <strong>源代码</strong>
                <span>C11 · 自动保存草稿 · 输入代码后可自测或提交评测</span>
              </div>
              <div>
                <button type="button" className="lm-button" onClick={handleResetCode} disabled={isSubmitting}>
                  <RotateCcw aria-hidden="true" />
                  重置
                </button>
                <button
                  type="button"
                  className="lm-button"
                  disabled={!sourceCode.trim() || isSubmitting}
                  onClick={() => void handleRunPublicTests("custom")}
                >
                  <Play aria-hidden="true" />
                  自定义运行
                </button>
                <button
                  type="button"
                  className="lm-button"
                  disabled={!canRun}
                  aria-busy={isSubmitting}
                  onClick={() => void handleRunPublicTests()}
                >
                  {isSubmitting ? <Loader2 aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {isSubmitting ? "编译 / 运行中…" : "运行样例"}
                </button>
                <button
                  type="button"
                  className="lm-button lm-button--primary"
                  disabled={!canSubmit}
                  aria-busy={isSubmitting}
                  onClick={() => void handleFormalSubmit()}
                >
                  {isSubmitting ? <Loader2 aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {isSubmitting ? "评测中…" : "提交评测"}
                </button>
              </div>
            </div>

            {runnerReady === false && (
              <InlineNotice tone="warning" text="在线运行暂时不可用，你的代码草稿会自动保留，请稍后再试。" />
            )}

            {exercise.public_run_available === false && (
              <InlineNotice tone="warning" text="这道练习的测试内容尚未准备完成，请先选择其他编程练习。" />
            )}
            {exercise.public_run_available && exercise.hidden_judge_available === false && (
              <InlineNotice tone="warning" text="这道练习目前仅支持样例自测，暂不计入正式完成状态。" />
            )}

            <textarea
              value={sourceCode}
              onChange={(event) => setSourceCode(event.target.value)}
              spellCheck={false}
              className="lm-codelab-source"
              aria-label="源代码"
            />

            <label className="lm-codelab-stdin">
              <span>标准输入</span>
              <textarea
                value={stdin}
                onChange={(event) => setStdin(event.target.value)}
                spellCheck={false}
                aria-label="标准输入"
                placeholder="样例输入"
              />
            </label>

            {runError && <InlineNotice tone="error" text={runError} />}
            {explainError && <InlineNotice tone="warning" text={explainError} />}
            {savedNotice && <InlineNotice tone="success" text={savedNotice} />}

            <RunResultPanel result={runResult} />

            {solution ? (
              <section className="lm-codelab-detail-block" aria-label="参考答案">
                <h3>参考答案与讲解</h3>
                <p>{solution.explanation || "本题暂未配置文字讲解。"}</p>
                {solution.referenceSolution ? (
                  <CodeBlock title="参考代码" content={solution.referenceSolution} />
                ) : null}
              </section>
            ) : (
              <InlineNotice tone="warning" text="讲解与参考答案会在完成一次正式提交后解锁。" />
            )}

            <div className="lm-codelab-explain">
              <button
                type="button"
                className="lm-button"
                disabled={!runResult || isExplaining}
                aria-busy={isExplaining}
                onClick={() => void handleExplainRun()}
              >
                {isExplaining ? <Loader2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                {isExplaining ? "正在解释" : "解释运行结果"}
              </button>
              {explanation && <p>{explanation}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function DetailBlock({ title, content }: { title: string; content?: string }) {
  return (
    <section className="lm-codelab-detail-block">
      <h3>{title}</h3>
      <p>{content || "暂无内容"}</p>
    </section>
  );
}

function CodeBlock({ title, content }: { title: string; content?: string }) {
  return (
    <section className="lm-codelab-detail-block">
      <h3>{title}</h3>
      <pre>{content || ""}</pre>
    </section>
  );
}

function MetaRow({ items }: { items: string[] }) {
  return (
    <div className="lm-codelab-meta" data-level="B" data-carrier="tab" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
      {items.filter(Boolean).map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function RunResultPanel({ result }: { result: CodeRunResult | null }) {
  if (!result) {
    return (
      <section className="lm-codelab-result" aria-live="polite">
        <strong>运行结果</strong>
        <p>自定义运行使用下方标准输入；运行样例可快速检查结果；提交评测会完成整套测试。</p>
      </section>
    );
  }

  const success = result.status === "success" || result.status === "accepted";
  const passedCount = Number(result.passedCount ?? 0);
  const totalCount = Number(result.totalCount ?? 0);
  const custom = result.judgedBy === "custom_input";
  const hasJudgeCount = totalCount > 0 && !custom;
  const statusLabels: Record<string, string> = {
    success: "运行完成",
    accepted: "AC · 通过",
    wrong_answer: "WA · 答案错误",
    compile_error: "CE · 编译错误",
    runtime_error: "RE · 运行错误",
    timeout: "TLE · 超出时间限制",
    output_limit: "OLE · 输出超过限制",
    internal_error: "评测服务异常",
  };
  return (
    <section className={`lm-codelab-result ${success ? "is-success" : "is-error"}`} aria-live="polite">
      <strong>{statusLabels[result.status] || result.status}</strong>
      <p>
        编译及运行耗时：{result.time || "0"} ms{custom ? " · 自定义输入，不判定题目通过" : ""}
      </p>
      {hasJudgeCount && (
        <p>
          通过用例：{passedCount} / {totalCount}
        </p>
      )}
      {result.judgedBy === "public_only" ? <p>本次为样例自测结果，暂不计入正式完成状态。</p> : null}
      {!!result.cases?.length && !custom && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>测试点</th>
                <th>结果</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              {result.cases.map((item, index) => (
                <tr key={item.id}>
                  <td>
                    #{index + 1} {item.visibility === "hidden" ? "综合测试" : "样例测试"}
                  </td>
                  <td>{statusLabels[item.status] || item.status}</td>
                  <td>{item.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.cases.length < totalCount && (
            <p>其余 {totalCount - result.cases.length} 个测试点未执行（遇到失败后停止）。</p>
          )}
        </div>
      )}
      <CodeBlock title="stdout" content={result.stdout || "无输出"} />
      {(result.stderr || result.compileOutput) && (
        <>
          <CodeBlock title="stderr" content={result.stderr || "无错误信息"} />
          <CodeBlock title="编译信息" content={result.compileOutput || "无编译信息"} />
        </>
      )}
    </section>
  );
}

function buildIdempotencyKey(exerciseId: string) {
  const safeExerciseId = exerciseId.replace(/[^A-Za-z0-9._:-]/g, "_");
  return `codelab-submit-${safeExerciseId}-${Date.now()}`;
}

function InlineNotice({ tone, text }: { tone: "success" | "warning" | "error"; text: string }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={`lm-codelab-notice lm-codelab-notice--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function parseTags(tags?: string[] | string) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean);

  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return tags
      .split(/[,\s，、]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}
