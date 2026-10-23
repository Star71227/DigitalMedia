/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { questionBankApi, type BankQuestion, type BankSubject } from "../api/questionBank";
import { PageTitle, State, fmt } from "../components/Ui";
import { CountUp } from "../components/effects/CountUp";
import { ElasticMount } from "../components/effects/ElasticMount";
import { MagneticButton } from "../components/effects/MagneticButton";
import { RevealOnScroll } from "../components/effects/RevealOnScroll";

const EMPTY_FORM = {
  subject: "",
  knowledgePoint: "",
  difficulty: "",
  stem: "",
  options: ["", "", "", ""],
  answer: "A",
  analysis: "",
};

const OPTION_KEYS = ["A", "B", "C", "D"];

// 难度三档。后端 DIFFICULTIES 还含「冲刺」，当前题库没有该档数据，不作为筛选项。
const DIFFICULTY_FILTERS = ["基础", "综合", "提高"] as const;

// 题库里同时存在四种题型：单选题可以进入学生答题链路，填空题 / 应用题 / 代码题
// 供教师端组卷与讲解参考（学生自测只会抽到单选题）。
const QUESTION_TYPE_FILTERS = [
  ["全部", "全部题型"],
  ["single_choice", "单选题"],
  ["fill_blank", "填空题"],
  ["application", "应用题"],
  ["code", "代码题"],
] as const;

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: "单选题",
  fill_blank: "填空题",
  application: "应用题",
  code: "代码题",
};

function questionTypeLabel(type: string) {
  return QUESTION_TYPE_LABELS[type] || type || "单选题";
}

export function QuestionBankPage() {
  const [questions, setQuestions] = useState<BankQuestion[]>();
  const [subjects, setSubjects] = useState<BankSubject[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [filterSubject, setFilterSubject] = useState("全部");
  const [filterDifficulty, setFilterDifficulty] = useState("全部");
  const [filterType, setFilterType] = useState("全部");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [keyword, setKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [list, meta] = await Promise.all([
        questionBankApi.questions({
          subject: filterSubject === "全部" ? "" : filterSubject,
          difficulty: filterDifficulty === "全部" ? "" : filterDifficulty,
          questionType: filterType === "全部" ? "" : filterType,
          scope,
          keyword,
        }),
        questionBankApi.subjects(),
      ]);
      setQuestions(list.data || []);
      setSubjects(meta.subjects || []);
      setDifficulties(meta.difficulties || []);
      setForm((current) => ({
        ...current,
        subject: current.subject || meta.subjects?.[0]?.subject || "",
        difficulty: current.difficulty || meta.difficulties?.[0] || "",
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "题库加载失败");
    }
  }, [filterSubject, filterDifficulty, filterType, scope, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const subject = form.subject.trim();
    const stem = form.stem.trim();
    if (!subject) {
      setFormError("请填写科目。");
      return;
    }
    if (!stem) {
      setFormError("请填写题干。");
      return;
    }
    if (form.options.some((option) => !option.trim())) {
      setFormError("A、B、C、D 四个选项都要填写。");
      return;
    }

    setBusy(true);
    setFormError("");
    try {
      await questionBankApi.create({
        subject,
        stem,
        options: form.options.map((option) => option.trim()),
        answer: form.answer,
        knowledgePoint: form.knowledgePoint.trim() || undefined,
        difficulty: form.difficulty.trim() || undefined,
        analysis: form.analysis.trim() || undefined,
      });
      setForm({ ...EMPTY_FORM, subject, difficulty: form.difficulty, options: ["", "", "", ""] });
      setCreating(false);
      await load();
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "新增题目失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (question: BankQuestion) => {
    setDeletingId(question.questionId);
    setActionError("");
    try {
      await questionBankApi.remove(question.questionId);
      setQuestions((current) => (current || []).filter((item) => item.questionId !== question.questionId));
      await load();
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "删除失败");
    } finally {
      setDeletingId("");
    }
  };

  const myCount = subjects.reduce((sum, item) => sum + item.ownCount, 0);

  return (
    <>
      <PageTitle
        title="题库管理"
        description="把你自己出的题加进题库，发布作业时可以直接使用；系统题库的题同样可以混用。"
        action={
          <MagneticButton
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500"
            ripple
            onClick={() => {
              setCreating((value) => !value);
              setFormError("");
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {creating ? "收起新增表单" : "新增题目"}
          </MagneticButton>
        }
      />

      {creating && (
        <ElasticMount className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <form onSubmit={submit}>
            <h2 className="text-base font-semibold">新增单选题</h2>
            <p className="mt-1 text-sm text-slate-500">
              当前只支持单选题（A/B/C/D），题目会标记为「我的题」，只有你能删除。
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="block text-sm">
                <span className="text-slate-600">科目</span>
                <input
                  className="control mt-1 w-full"
                  list="question-bank-subjects"
                  value={form.subject}
                  maxLength={100}
                  placeholder="例如：数据结构"
                  onChange={(event) => setForm({ ...form, subject: event.target.value })}
                />
                <datalist id="question-bank-subjects">
                  {subjects.map((item) => (
                    <option key={item.subject} value={item.subject} />
                  ))}
                </datalist>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">知识点（可选）</span>
                <input
                  className="control mt-1 w-full"
                  value={form.knowledgePoint}
                  maxLength={100}
                  placeholder="例如：顺序表"
                  onChange={(event) => setForm({ ...form, knowledgePoint: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">难度（可选）</span>
                <select
                  className="control mt-1 w-full"
                  value={form.difficulty}
                  onChange={(event) => setForm({ ...form, difficulty: event.target.value })}
                >
                  <option value="">不指定</option>
                  {difficulties.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="text-slate-600">题干</span>
              <textarea
                className="control mt-1 w-full"
                rows={3}
                value={form.stem}
                maxLength={1000}
                placeholder="支持 Markdown"
                onChange={(event) => setForm({ ...form, stem: event.target.value })}
              />
            </label>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {OPTION_KEYS.map((key, index) => (
                <label key={key} className="block text-sm">
                  <span className="text-slate-600">选项 {key}</span>
                  <input
                    className="control mt-1 w-full"
                    value={form.options[index]}
                    maxLength={500}
                    onChange={(event) => {
                      const next = [...form.options];
                      next[index] = event.target.value;
                      setForm({ ...form, options: next });
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600">正确答案</span>
                <select
                  className="control mt-1 w-full"
                  value={form.answer}
                  onChange={(event) => setForm({ ...form, answer: event.target.value })}
                >
                  {OPTION_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">解析（可选）</span>
                <input
                  className="control mt-1 w-full"
                  value={form.analysis}
                  maxLength={2000}
                  onChange={(event) => setForm({ ...form, analysis: event.target.value })}
                />
              </label>
            </div>
            {formError && (
              <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                {formError}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {busy ? "正在保存…" : "加入题库"}
              </button>
              <button
                type="button"
                disabled={busy}
                className="h-11 rounded-full border border-slate-300 px-4 text-sm"
                onClick={() => {
                  setCreating(false);
                  setFormError("");
                }}
              >
                取消
              </button>
            </div>
          </form>
        </ElasticMount>
      )}

      <RevealOnScroll>
        <form
          className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4"
          data-reveal
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label className="text-sm">
            <span className="block text-xs text-slate-500">科目</span>
            <select
              className="control mt-1"
              value={filterSubject}
              onChange={(event) => setFilterSubject(event.target.value)}
            >
              <option value="全部">全部科目</option>
              {subjects.map((item) => (
                <option key={item.subject} value={item.subject}>
                  {item.subject}（{item.questionCount}）
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500">范围</span>
            <select
              className="control mt-1"
              value={scope}
              onChange={(event) => setScope(event.target.value as "all" | "mine")}
            >
              <option value="all">全部题目</option>
              <option value="mine">只看我的题</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500">难度</span>
            <select
              className="control mt-1"
              value={filterDifficulty}
              onChange={(event) => setFilterDifficulty(event.target.value)}
            >
              <option value="全部">全部难度</option>
              {DIFFICULTY_FILTERS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500">题型</span>
            <select
              className="control mt-1"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
            >
              {QUESTION_TYPE_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-xs text-slate-500">关键词</span>
            <input
              className="control mt-1"
              value={keyword}
              maxLength={100}
              placeholder="题干 / 知识点"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm"
          >
            <Search size={16} aria-hidden="true" />
            筛选
          </button>
          <span className="ml-auto text-xs text-slate-500">
            我贡献的题目共 <CountUp to={myCount} mode="scramble" /> 道（全部科目合计）
          </span>
        </form>
      </RevealOnScroll>

      {actionError && (
        <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {actionError}
        </p>
      )}

      <State
        loading={!questions && !error}
        error={error}
        empty={Boolean(questions && questions.length === 0)}
        onRetry={() => void load()}
      >
        {questions && questions.length > 0 && (
          <RevealOnScroll stagger={0.06}>
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" data-reveal>
              <h2 className="text-base font-semibold">题目列表</h2>
              <p className="mt-1 text-sm text-slate-500">
                当前筛选下显示 {questions.length} 道（单次最多 200
                道，含系统题库；可按科目与题型筛选）。标记「我的」的题只有你能删除。
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">来源</th>
                      <th className="px-3 py-2">科目</th>
                      <th className="px-3 py-2">知识点</th>
                      <th className="px-3 py-2">难度</th>
                      <th className="px-3 py-2">题型</th>
                      <th className="px-3 py-2">题干</th>
                      <th className="px-3 py-2">答案</th>
                      <th className="px-3 py-2">加入时间</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {questions.map((question) => (
                      <tr key={question.questionId}>
                        <td className="px-3 py-2">
                          {question.mine ? (
                            <span className="rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-700">
                              我的
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">系统题库</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{question.subject}</td>
                        <td className="px-3 py-2 text-slate-500">{question.knowledgePoint || "—"}</td>
                        <td className="px-3 py-2 text-slate-500">{question.difficulty || "—"}</td>
                        <td className="px-3 py-2">
                          {question.stem.length > 42 ? `${question.stem.slice(0, 42)}…` : question.stem}
                        </td>
                        <td className="px-3 py-2 font-semibold">{question.answer}</td>
                        <td className="px-3 py-2 text-slate-500">{fmt(question.createdAt)}</td>
                        <td className="px-3 py-2">
                          {question.mine ? (
                            <button
                              type="button"
                              disabled={deletingId === question.questionId}
                              className="inline-flex h-9 items-center gap-1 rounded-full border border-rose-200 px-3 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                              onClick={() => void remove(question)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              {deletingId === question.questionId ? "删除中…" : "删除"}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </RevealOnScroll>
        )}
      </State>
    </>
  );
}
