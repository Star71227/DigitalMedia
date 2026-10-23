/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Plus, Users } from "lucide-react";
import { teacherApi } from "../api/teacher";
import { PageTitle, State } from "../components/Ui";
import { navigate } from "../router";
import type { ClassItem } from "../types";

export function ClassesPage() {
  const [data, setData] = useState<ClassItem[] | undefined>();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ className: "", subject: "", description: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setData((await teacherApi.classes()).data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "班级读取失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setFormError("");
    if (Array.from(form.className.trim()).length < 2) {
      setFormError("班级名称至少需要 2 个字符。");
      return;
    }
    if (Array.from(form.subject.trim()).length < 2) {
      setFormError("学科至少需要 2 个字符。");
      return;
    }
    setSubmitting(true);
    try {
      await teacherApi.createClass({
        className: form.className.trim(),
        subject: form.subject.trim(),
        description: form.description.trim(),
      });
      setForm({ className: "", subject: "", description: "" });
      setCreating(false);
      await load();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "创建班级失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageTitle
        title="班级学情"
        description="创建班级并把学生加入后，工作台、测验分析和学习报告都会自动统计这些学生"
        action={
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus size={16} aria-hidden="true" />
            {creating ? "收起" : "创建班级"}
          </button>
        }
      />

      {creating && (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="font-semibold text-slate-900">新建班级</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              班级名称
              <input
                value={form.className}
                onChange={(event) => setForm({ ...form, className: event.target.value })}
                maxLength={60}
                placeholder="例如 数据结构 2026 春 1 班"
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
              />
            </label>
            <label className="text-sm text-slate-600">
              学科
              <input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                maxLength={40}
                placeholder="例如 数据结构"
                className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm text-slate-600">
            班级说明（可选）
            <input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              maxLength={500}
              className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
            />
          </label>
          {formError && (
            <p className="mt-3 text-sm text-rose-700" role="alert">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="mt-4 h-11 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? "正在创建…" : "确认创建"}
          </button>
        </section>
      )}

      <State
        loading={!data && !error}
        error={error}
        empty={Boolean(data && data.length === 0)}
        onRetry={() => void load()}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {(data || []).map((item, index) => (
            <article
              key={item.id}
              style={{ "--i": index } as React.CSSProperties}
              className="teacher-row-in rounded-2xl border bg-white p-6"
            >
              <h2 className="font-semibold">{item.className}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {item.subject} · {item.studentCount} 人
              </p>
              {item.description && <p className="mt-2 text-xs text-slate-400">{item.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/classes/${item.id}/students`)}
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-brand-300 bg-brand-50 px-4 text-sm font-medium text-brand-700 hover:bg-brand-100"
                >
                  <Users size={16} aria-hidden="true" />
                  成员管理
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/classes/${item.id}/analytics`)}
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <BarChart3 size={16} aria-hidden="true" />
                  班级学情
                </button>
              </div>
            </article>
          ))}
        </div>
      </State>
    </>
  );
}
