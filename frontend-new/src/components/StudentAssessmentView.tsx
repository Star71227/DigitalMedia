/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileQuestion,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import {
  describeApiError,
  getStudentAssessment,
  type AssessmentConclusion,
  type LearningResourceType,
  type StudentAssessment,
} from "../api";

const resourceLabels: Record<LearningResourceType, string> = {
  study_note: "学习讲义",
  mind_map: "思维导图",
  pptx: "PPT 课件",
  quiz_pack: "练习包",
  code_case: "代码案例",
};

/** 资源证据里对学生展示的类型：按需求删除 PPT 课件与练习包（知识包）。 */
const VISIBLE_RESOURCE_TYPES: LearningResourceType[] = ["study_note", "mind_map", "code_case"];

export default function StudentAssessmentView({
  onNavigateToTab,
}: {
  onNavigateToTab: (tab: string, data?: unknown) => void;
}) {
  const [data, setData] = useState<StudentAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getStudentAssessment()
      .then(setData)
      .catch((reason) => setError(describeApiError(reason, "评估报告加载失败")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const priority = useMemo(() => (data ? priorityInsight(data) : null), [data]);
  const primaryAction = useMemo(
    () => (data ? primaryAssessmentAction(data, onNavigateToTab) : null),
    [data, onNavigateToTab],
  );

  if (loading) {
    return (
      <section className="lm-assessment-state" role="status">
        <Loader2 aria-hidden="true" className="is-spinning" />
        <h1>正在读取学习评估</h1>
        <p>报告会根据真实测验、错题、资源和 CodeLab 记录生成；缺失数据不会被补造。</p>
      </section>
    );
  }

  if (error || !data || !priority) {
    return (
      <section className="lm-assessment-state lm-assessment-state--error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h1>评估报告暂时无法打开</h1>
        <p>{error || "后端没有返回可展示的评估数据。"}</p>
        <button type="button" className="lm-button lm-button--primary" onClick={load}>
          <RefreshCw aria-hidden="true" />
          重试
        </button>
      </section>
    );
  }

  return (
    <div className="lm-assessment">
      <header className="lm-assessment-header">
        <div>
          <p>学习评估报告</p>
          <h1>{priority.title}</h1>
          <span>{priority.description}</span>
        </div>
        <div className="lm-assessment-actions">
          {primaryAction}
          <button type="button" className="lm-button" onClick={() => onNavigateToTab("path")}>
            查看学习路径
          </button>
        </div>
      </header>

      {!data.evidenceSufficient && (
        <section className="lm-assessment-notice" role="status">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>当前学习证据不足</strong>
            <p>完成一次真实测验、CodeLab 或学习资源后，评估会有更可靠的结论。</p>
          </div>
          <button
            type="button"
            className="lm-button lm-button--primary"
            onClick={() => onNavigateToTab("quiz")}
          >
            参加测验
          </button>
          <button type="button" className="lm-button" onClick={() => onNavigateToTab("codelab")}>
            进入 CodeLab
          </button>
        </section>
      )}

      <section className="lm-assessment-summary" aria-labelledby="assessment-summary-title">
        <div>
          <h2 id="assessment-summary-title">本次报告依据</h2>
        </div>
        <dl>
          <Fact
            label="总体掌握度"
            value={metric(data.metrics.overallMastery, "%")}
            detail={`${data.mastery.length} 个知识点有记录`}
          />
          <Fact
            label="测验表现"
            value={metric(data.metrics.quiz.averageAccuracy, "%")}
            detail={`${data.metrics.quiz.attemptCount} 次测验`}
          />
          <Fact label="路径进度" value={metric(data.metrics.pathProgress, "%")} detail="来自当前学习路径" />
          <Fact
            label="资源完成"
            value={`${data.metrics.completedResources}/${data.metrics.resourceCount}`}
            detail="来自资源进度记录"
          />
          <Fact
            label="CodeLab"
            value={metric(data.metrics.codeLab.successRate, "%")}
            detail={`${data.metrics.codeLab.successCount}/${data.metrics.codeLab.submissionCount} 次成功`}
          />
        </dl>
        {data.latestPersistedReport && (
          <p className="lm-assessment-persisted">
            已有教师审核报告 V{data.latestPersistedReport.version}，生成于{" "}
            {formatTime(data.latestPersistedReport.generatedAt)}。
          </p>
        )}
      </section>

      <div className="lm-assessment-two-column">
        <ConclusionSection
          icon={<Target />}
          title="优先薄弱点"
          items={data.weaknesses}
          empty="当前证据未识别出低于 60% 的知识点。"
          action={(item) => (
            <button
              type="button"
              className="lm-button"
              onClick={() =>
                onNavigateToTab("quiz", { subject: item.subject, knowledgePoint: item.knowledgePoint })
              }
            >
              练习同类题
            </button>
          )}
        />
        <ConclusionSection
          icon={<Sparkles />}
          title="下一步建议"
          items={data.recommendations}
          empty="继续按当前学习路径推进。"
        />
      </div>

      <div className="lm-assessment-two-column">
        <ConclusionSection
          icon={<CheckCircle2 />}
          title="稳定优势"
          items={data.strengths}
          empty="当前证据尚不足以确认稳定优势。"
        />
        <ConclusionSection
          icon={<ShieldAlert />}
          title="学习风险"
          items={data.risks}
          empty="当前证据未发现明确学习风险。"
        />
      </div>

      <ConclusionSection
        icon={<AlertTriangle />}
        title="错误模式"
        items={data.errorPatterns}
        empty="当前没有可用的错误模式记录。"
        action={(item) => (
          <button
            type="button"
            className="lm-button"
            onClick={() =>
              onNavigateToTab("errors", { subject: item.subject, knowledgePoint: item.knowledgePoint })
            }
          >
            查看错题
          </button>
        )}
      />

      <details className="lm-assessment-disclosure" open>
        <summary>
          <span>
            <BarChart3 aria-hidden="true" />
            知识点掌握证据
          </span>
          <small>{data.mastery.length ? `${data.mastery.length} 条记录` : "暂无记录"}</small>
        </summary>
        {data.mastery.length === 0 ? (
          <Empty text="尚未形成知识点掌握数据。完成测验后这里会显示真实掌握记录。" />
        ) : (
          <div className="lm-assessment-mastery-list">
            {data.mastery.map((item) => (
              <article key={`${item.subject}-${item.knowledgePoint}`}>
                <div>
                  <strong>{item.knowledgePoint}</strong>
                  <span>{item.subject}</span>
                </div>
                <p>
                  {metric(item.mastery, "%")} · 练习 {item.practiceCount} 次 · 错误 {item.wrongCount} 次
                </p>
                {item.mastery !== null && (
                  <div role="img" aria-label={`${item.knowledgePoint}掌握度${item.mastery}%`}>
                    <span style={{ inlineSize: `${Math.max(0, Math.min(100, item.mastery))}%` }} />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </details>

      <details className="lm-assessment-disclosure">
        <summary>
          <span>
            <BookOpen aria-hidden="true" />
            资源证据
          </span>
        </summary>
        <div className="lm-assessment-resource-list">
          {VISIBLE_RESOURCE_TYPES.map((type) => {
            const counts = data.metrics.resourcesByType[type];
            return (
              <div key={type}>
                <strong>{resourceLabels[type]}</strong>
                <span>
                  完成 {counts.completedCount} / 已生成 {counts.generatedCount}
                  {counts.inProgressCount ? ` · 进行中 ${counts.inProgressCount}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </details>

      <footer className="lm-assessment-sources">
        <ClipboardCheck aria-hidden="true" />
        <div>
          <strong>数据来源</strong>
          <p>{data.dataSources.join("、")}</p>
        </div>
      </footer>
    </div>
  );
}

function Fact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      <dd>{detail}</dd>
    </div>
  );
}

function ConclusionSection({
  icon,
  title,
  items,
  empty,
  action,
}: {
  icon: ReactNode;
  title: string;
  items: AssessmentConclusion[];
  empty: string;
  action?: (item: AssessmentConclusion) => ReactNode;
}) {
  return (
    <section className="lm-assessment-section">
      <h2>
        <span>{icon}</span>
        {title}
      </h2>
      {items.length === 0 ? (
        <Empty text={empty} />
      ) : (
        <div className="lm-assessment-conclusion-list">
          {items.map((item, index) => (
            <article key={`${item.text}-${index}`}>
              <div>
                <strong>{item.text}</strong>
                {item.evidence.length > 0 && <p>依据：{item.evidence.join("；")}</p>}
              </div>
              {action?.(item)}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="lm-assessment-empty">{text}</p>;
}

function priorityInsight(data: StudentAssessment) {
  if (!data.evidenceSufficient) {
    return {
      title: "先补一条真实学习证据",
      description: "当前报告只能说明证据不足，不能给出可靠能力结论。",
    };
  }

  if (data.weaknesses[0]) {
    return {
      title: data.weaknesses[0].text,
      description: `这是当前最需要优先处理的薄弱点。${data.weaknesses[0].evidence.join("；")}`,
    };
  }

  if (data.recommendations[0]) {
    return {
      title: data.recommendations[0].text,
      description: data.recommendations[0].evidence.join("；") || "系统根据当前学习记录给出下一步。",
    };
  }

  return {
    title: "保持当前学习节奏",
    description: "当前没有识别出明确风险，建议按学习路径继续推进。",
  };
}

function primaryAssessmentAction(data: StudentAssessment, navigate: (tab: string, data?: unknown) => void) {
  if (!data.evidenceSufficient || data.metrics.quiz.attemptCount === 0) {
    return (
      <button type="button" className="lm-button lm-button--primary" onClick={() => navigate("quiz")}>
        <FileQuestion aria-hidden="true" />
        完成一次测验
      </button>
    );
  }

  if (data.weaknesses[0]) {
    const item = data.weaknesses[0];
    return (
      <button
        type="button"
        className="lm-button lm-button--primary"
        onClick={() => navigate("quiz", { subject: item.subject, knowledgePoint: item.knowledgePoint })}
      >
        <Target aria-hidden="true" />
        练习薄弱点
      </button>
    );
  }

  return (
    <button type="button" className="lm-button lm-button--primary" onClick={() => navigate("resource")}>
      <BookOpen aria-hidden="true" />
      继续学习资源
    </button>
  );
}

function metric(value: number | null, suffix = "") {
  return value === null ? "证据不足" : `${value}${suffix}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未记录" : date.toLocaleString("zh-CN");
}
