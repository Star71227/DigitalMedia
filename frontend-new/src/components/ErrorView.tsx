/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import ReviewQueuePanel from "./ReviewQueuePanel";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  FileQuestion,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { describeApiError, fetchApiData, updateWrongQuestionStatus, type WrongQuestionRecord } from "../api";

interface Props {
  onNavigateToTab: (tab: string, data?: unknown) => void;
}

export default function ErrorView({ onNavigateToTab }: Props) {
  const [items, setItems] = useState<WrongQuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("全部");
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [updating, setUpdating] = useState<string | number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchApiData<WrongQuestionRecord>("/api/wrong-questions")
      .then((records) => {
        setItems(records);
        setExpanded(records[0]?.id ?? null);
      })
      .catch((reason) => setError(describeApiError(reason, "错题本加载失败")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const subjects = useMemo(
    () => ["全部", ...new Set(items.map((item) => item.subject).filter(Boolean))],
    [items],
  );
  const visible = subject === "全部" ? items : items.filter((item) => item.subject === subject);
  const pending = items.filter((item) => item.status !== "已掌握").length;

  async function setMastered(item: WrongQuestionRecord) {
    setUpdating(item.id);
    setError("");
    try {
      await updateWrongQuestionStatus(item.id, "已掌握");
      setItems((current) =>
        current.map((record) =>
          record.id === item.id
            ? { ...record, status: "已掌握", updated_at: new Date().toISOString() }
            : record,
        ),
      );
    } catch (reason) {
      setError(describeApiError(reason, "错题状态更新失败"));
    } finally {
      setUpdating(null);
    }
  }

  if (loading) {
    return (
      <section className="lm-errors-state" role="status" data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">
        <Loader2 aria-hidden="true" className="is-spinning" />
        <h1>正在读取错题记录</h1>
        <p>错题来自真实测验提交后的后端记录。</p>
      </section>
    );
  }

  if (error && items.length === 0) {
    return (
      <section className="lm-errors-state lm-errors-state--error" role="alert" data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">
        <AlertTriangle aria-hidden="true" />
        <h1>错题本暂时无法打开</h1>
        <p>{error}</p>
        <button type="button" className="lm-button lm-button--primary" onClick={load}>
          <RefreshCw aria-hidden="true" />
          重试
        </button>
      </section>
    );
  }

  return (
    <div className="lm-errors">
      <ReviewQueuePanel onNavigate={onNavigateToTab} />
      <header className="lm-errors-header">
        <div>
          <p>错题入口</p>
          <h1>{items.length ? "先理解错误原因，再做同类练习" : "本次没有记录到错题"}</h1>
          <span>
            {items.length
              ? `共 ${items.length} 道真实错题，${pending} 道待复习。`
              : "完成测验后，答错题目、解析和建议会自动进入这里。"}
          </span>
        </div>
        <button
          type="button"
          className="lm-button lm-button--primary"
          onClick={() => onNavigateToTab("quiz")}
        >
          <FileQuestion aria-hidden="true" />
          去做测验
        </button>
      </header>

      {error && (
        <div className="lm-errors-inline-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>{error}</p>
          <button type="button" onClick={load}>
            重新读取
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <section className="lm-errors-empty">
          <CheckCircle2 aria-hidden="true" />
          <h2>本次没有记录到错题</h2>
          <p>如果刚完成测验且没有答错，说明本次不会新增错题。想继续验证，可以换一个知识点重新测验。</p>
          <div>
            <button
              type="button"
              className="lm-button lm-button--primary"
              onClick={() => onNavigateToTab("quiz")}
            >
              开始新测验
            </button>
            <button type="button" className="lm-button" onClick={() => onNavigateToTab("path")}>
              返回学习路径
            </button>
          </div>
        </section>
      ) : (
        <section className="lm-errors-layout">
          <aside className="lm-errors-filter" aria-labelledby="wrong-filter-title">
            <h2 id="wrong-filter-title">
              <Search aria-hidden="true" />
              按课程筛选
            </h2>
            <div>
              {subjects.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={subject === name ? "is-active" : ""}
                  aria-pressed={subject === name}
                  onClick={() => setSubject(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </aside>

          <main className="lm-errors-list" aria-live="polite">
            {visible.length === 0 ? (
              <p className="lm-errors-empty-inline">该课程下没有错题记录。</p>
            ) : (
              visible.map((item) => {
                const open = expanded === item.id;
                return (
                  <article key={item.id} className="lm-error-item">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : item.id)}
                      aria-expanded={open}
                    >
                      <div>
                        <span>{item.subject || "未分类课程"}</span>
                        <span>{item.knowledge_point || "未关联知识点"}</span>
                        <span>{item.status || "待复习"}</span>
                      </div>
                      <h2>{item.question_text || "题目内容未记录"}</h2>
                      <strong>{open ? "收起反馈" : "查看反馈"}</strong>
                    </button>

                    {open && (
                      <div className="lm-error-item__body">
                        <dl className="lm-error-answer-pair">
                          <div>
                            <dt>你的答案</dt>
                            <dd>{item.selected_answer || "未记录"}</dd>
                          </div>
                          <div>
                            <dt>正确答案</dt>
                            <dd>{item.correct_answer || "未记录"}</dd>
                          </div>
                        </dl>

                        <Detail label="题目解析" value={item.analysis} />
                        <Detail label="错误原因" value={item.error_reason} />
                        <Detail label="反馈建议" value={item.feedback_suggestion} />
                        <Detail label="推荐操作" value={item.recommended_action} />

                        <p className="lm-error-item__meta">
                          关联知识点：{item.knowledge_point || "未记录"} · 更新时间：
                          {formatTime(item.updated_at)}
                        </p>

                        <div className="lm-error-actions">
                          {item.status !== "已掌握" && (
                            <button
                              type="button"
                              disabled={updating === item.id}
                              className="lm-button lm-button--primary"
                              onClick={() => void setMastered(item)}
                            >
                              {updating === item.id ? "正在保存" : "标记已掌握"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="lm-button"
                            onClick={() =>
                              onNavigateToTab("quiz", {
                                subject: item.subject,
                                knowledgePoint: item.knowledge_point,
                              })
                            }
                          >
                            <Brain aria-hidden="true" />
                            练习同类题
                            <ArrowRight aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="lm-button"
                            onClick={() =>
                              onNavigateToTab(
                                "mentor",
                                `请结合这道错题帮我理解${item.knowledge_point || item.subject}：${item.question_text}`,
                              )
                            }
                          >
                            <MessageSquare aria-hidden="true" />向 AI 问答
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </main>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <section className="lm-error-detail">
      <h3>
        <BookOpen aria-hidden="true" />
        {label}
      </h3>
      <p>{value || "本次记录未包含该项信息。"}</p>
    </section>
  );
}

function formatTime(value?: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未记录" : date.toLocaleString("zh-CN");
}
