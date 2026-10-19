/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Code2, Loader2, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { CodeExercise, describeApiError, getCodeExercises } from "../api";
import CodeLabWorkspace from "./CodeLabWorkspace";

interface CodeLabViewProps {
  embedded?: boolean;
  routePath: string;
  onNavigateToTab: (tab: string, prefillData?: any) => void;
  onNavigateToExercise: (exerciseId: string) => void;
  onNavigateToList: () => void;
}

const SUBJECT_OPTIONS = ["数据结构", "操作系统", "计算机组成原理", "计算机网络", "C语言"];

export default function CodeLabView({
  embedded = false,
  routePath,
  onNavigateToTab,
  onNavigateToExercise,
  onNavigateToList,
}: CodeLabViewProps) {
  const routeExerciseId = useMemo(() => getExerciseIdFromRoute(routePath), [routePath]);
  const [subject, setSubject] = useState("数据结构");
  const [knowledgePoint, setKnowledgePoint] = useState("全部");
  const [difficulty, setDifficulty] = useState("全部");
  const [exercises, setExercises] = useState<CodeExercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (routeExerciseId) return;

    let cancelled = false;
    setIsLoading(true);
    setError("");

    getCodeExercises({ subject })
      .then((items) => {
        if (!cancelled) {
          setExercises(items);
          setKnowledgePoint((value) =>
            value === "全部" || items.some((item) => item.knowledge_point === value) ? value : "全部",
          );
          setDifficulty((value) =>
            value === "全部" || items.some((item) => item.difficulty === value) ? value : "全部",
          );
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setExercises([]);
          setError(describeApiError(reason, "CodeLab 题库暂时无法读取"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, routeExerciseId, subject]);

  const knowledgeOptions = useMemo(
    () => ["全部", ...unique(exercises.map((item) => item.knowledge_point).filter(Boolean))],
    [exercises],
  );
  const difficultyOptions = useMemo(
    () => ["全部", ...unique(exercises.map((item) => item.difficulty).filter(Boolean))],
    [exercises],
  );
  const filteredExercises = useMemo(
    () =>
      exercises.filter((item) => {
        const matchesKnowledge = knowledgePoint === "全部" || item.knowledge_point === knowledgePoint;
        const matchesDifficulty = difficulty === "全部" || item.difficulty === difficulty;
        return matchesKnowledge && matchesDifficulty;
      }),
    [difficulty, exercises, knowledgePoint],
  );

  if (routeExerciseId) {
    return (
      <div className={embedded ? "lm-codelab is-embedded" : "lm-codelab"}>
        <CodeLabWorkspace exerciseId={routeExerciseId} onBackToList={onNavigateToList} />
      </div>
    );
  }

  return (
    <div className={embedded ? "lm-codelab is-embedded" : "lm-codelab"}>
      {!embedded && (
        <section className="lm-codelab-hero" aria-labelledby="codelab-title">
          <div>
            <span className="lm-label-chip">
              <Code2 aria-hidden="true" />
              真实 CodeLab 题库
            </span>
            <h2 id="codelab-title">选择一道代码练习</h2>
            <p>选一道题，写完代码可以直接运行样例，也可以提交评测。</p>
          </div>
          <div className="lm-codelab-hero__actions">
            <button type="button" className="lm-button" onClick={() => onNavigateToTab("quiz")}>
              返回测验
            </button>
            <button
              type="button"
              className="lm-button"
              onClick={() => onNavigateToTab("resource", { subject, topic: "数据结构代码练习" })}
            >
              <BookOpen aria-hidden="true" />
              学习资源
            </button>
          </div>
        </section>
      )}

      <section className="lm-codelab-panel" aria-labelledby="codelab-list-title">
        <div className="lm-codelab-toolbar">
          <div>
            <h3 id="codelab-list-title">
              <Search aria-hidden="true" />
              题库列表
            </h3>
            <p>
              {isLoading
                ? "正在读取题库。"
                : `当前显示 ${filteredExercises.length} / ${exercises.length} 道练习。`}
            </p>
          </div>

          <div className="lm-codelab-filters" aria-label="CodeLab 题库筛选">
            <FilterSelect label="课程" value={subject} options={SUBJECT_OPTIONS} onChange={setSubject} />
            <FilterSelect
              label="知识点"
              value={knowledgePoint}
              options={knowledgeOptions}
              onChange={setKnowledgePoint}
            />
            <FilterSelect
              label="难度"
              value={difficulty}
              options={difficultyOptions}
              onChange={setDifficulty}
            />
          </div>
        </div>

        {error && (
          <CodeLabState
            tone="error"
            title="题库暂时无法读取"
            description={error}
            actionLabel="重新读取"
            onAction={() => setReloadKey((value) => value + 1)}
          />
        )}

        {isLoading && (
          <div className="lm-codelab-loading" role="status">
            <Loader2 aria-hidden="true" />
            正在加载代码练习
          </div>
        )}

        {!isLoading && !error && filteredExercises.length === 0 && (
          <CodeLabState
            tone="empty"
            icon={<SlidersHorizontal aria-hidden="true" />}
            title={exercises.length ? "没有符合筛选条件的练习" : "当前题库暂无可用练习"}
            description={
              exercises.length
                ? "可以调整知识点或难度筛选后再试。"
                : "当前课程暂时没有可用练习，可以先完成知识检测或学习资源。"
            }
          />
        )}

        {!isLoading && !error && filteredExercises.length > 0 && (
          <div className="lm-codelab-list">
            {filteredExercises.map((exercise) => (
              <article key={exercise.exercise_id} className="lm-codelab-item">
                <div className="lm-codelab-item__main">
                  <div className="lm-codelab-item__meta">
                    <span>{exercise.knowledge_point || "未分类知识点"}</span>
                    <span>{exercise.difficulty || "基础"}</span>
                    <span>{(exercise.language || "c").toUpperCase()}</span>
                  </div>
                  <h4>{exercise.title || "未命名练习"}</h4>
                  <p>{summarizeDescription(exercise.description)}</p>
                </div>
                <button
                  type="button"
                  className="lm-button lm-button--primary"
                  onClick={() => onNavigateToExercise(exercise.exercise_id)}
                >
                  开始练习
                  <ArrowRight aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="lm-codelab-filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CodeLabState({
  tone,
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  tone: "error" | "empty";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`lm-codelab-state lm-codelab-state--${tone}`}>
      {icon || <RefreshCw aria-hidden="true" />}
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        {actionLabel && onAction && (
          <button type="button" className="lm-button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function summarizeDescription(description?: string) {
  const text = String(description || "").trim();
  if (!text) return "这道题暂未提供题目描述。";
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getExerciseIdFromRoute(routePath: string) {
  const pathname = routePath.split("?")[0].replace(/\/$/, "");
  const prefix = "/student/codelab/";

  if (!pathname.toLowerCase().startsWith(prefix)) {
    return "";
  }

  return decodeURIComponent(pathname.slice(prefix.length));
}
