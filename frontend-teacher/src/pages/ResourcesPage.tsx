/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { StudentDetail } from "../types";
import { useEffect, useMemo, useState } from "react";
import { teacherApi } from "../api/teacher";
import type { StudentCard } from "../types";
import { PageTitle, State } from "../components/Ui";
export function ResourcesPage() {
  const [students, setStudents] = useState<StudentCard[]>([]),
    [studentId, setStudentId] = useState(0),
    [detail, setDetail] = useState<StudentDetail>(),
    [pathVersion, setPathVersion] = useState(0),
    [stageKey, setStageKey] = useState(""),
    [resourceType, setResourceType] = useState("mind_map"),
    [teacherNote, setTeacherNote] = useState(""),
    [regenerate, setRegenerate] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [generating, setGenerating] = useState(false);
  useEffect(() => {
    teacherApi
      .students({ pageSize: 100 })
      .then((r) => {
        setStudents(r.data);
        const requested = Number(new URLSearchParams(window.location.search).get("studentId"));
        if (r.data[0])
          setStudentId(r.data.some((x) => x.studentId === requested) ? requested : r.data[0].studentId);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setDetail(undefined);
    setDetailLoading(true);
    setPathVersion(0);
    setStageKey("");
    setError("");
    setMessage("");
    teacherApi
      .studentDetail(studentId)
      .then((value) => {
        if (cancelled) return;
        setDetail(value);
        const version = value.path.versions?.[0]?.version || value.path.currentVersion || 0;
        setPathVersion(version);
        const selected = value.path.versions?.find((x) => x.version === version);
        setStageKey(selected?.snapshot?.stages?.[0]?.key || "");
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);
  const versions = detail?.path.versions || [];
  const stages = useMemo(
    () => versions.find((x) => x.version === pathVersion)?.snapshot?.stages || [],
    [versions, pathVersion],
  );
  useEffect(() => {
    if (!stages.some((x) => x.key === stageKey)) setStageKey(stages[0]?.key || "");
  }, [stages, stageKey]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generating || detailLoading || !stageKey) return;
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const result = await teacherApi.generateResource(studentId, {
        resourceType,
        pathVersion,
        stageKey,
        regenerate,
        teacherNote,
      });
      setMessage(
        `资源已生成：${result.resource.title}（V${result.resource.version}）${result.resource.sourceMode === "deterministic_fallback" ? " · 当前使用基础模板" : ""}${result.resource.review?.modelReviewExecuted ? "" : " · 请检查内容后使用"}`,
      );
      setDetail(await teacherApi.studentDetail(studentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };
  return (
    <>
      <PageTitle title="个性化资源" description="围绕学习阶段准备思维导图与课件" />
      <State loading={loading} error={error && !students.length ? error : ""} empty={!students.length}>
        <div className="grid gap-6 lg:grid-cols-5">
          <form onSubmit={submit} className="rounded-2xl border bg-white p-6 lg:col-span-2">
            <Field label="学生" htmlFor="resource-student">
              <select
                id="resource-student"
                value={studentId}
                disabled={generating}
                onChange={(e) => setStudentId(Number(e.target.value))}
                className="control"
              >
                {students.map((x) => (
                  <option key={x.studentId} value={x.studentId}>
                    {x.displayName} · {x.className}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="学习路径版本" htmlFor="resource-path-version">
              <select
                id="resource-path-version"
                value={pathVersion}
                disabled={generating || detailLoading || !versions.length}
                onChange={(e) => setPathVersion(Number(e.target.value))}
                className="control"
              >
                {!versions.length && (
                  <option value={0}>{detailLoading ? "正在加载…" : "暂无学习路径"}</option>
                )}
                {versions.map((x) => (
                  <option key={x.version} value={x.version}>
                    V{x.version} · {x.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="学习阶段" htmlFor="resource-stage">
              <select
                id="resource-stage"
                value={stageKey}
                onChange={(e) => setStageKey(e.target.value)}
                className="control"
                disabled={generating || detailLoading || !stages.length}
              >
                {!stages.length && <option value="">{detailLoading ? "正在加载…" : "暂无学习阶段"}</option>}
                {stages.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.title || x.key}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="资源类型" htmlFor="resource-type">
              <select
                id="resource-type"
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                className="control"
              >
                <option value="mind_map">思维导图</option>
                <option value="pptx">PPTX 课件</option>
              </select>
            </Field>
            <Field label="跟进备注（仅作记录）" htmlFor="resource-note">
              <textarea
                id="resource-note"
                value={teacherNote}
                onChange={(e) => setTeacherNote(e.target.value)}
                maxLength={500}
                className="control min-h-24"
              />
            </Field>
            <label className="flex gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} />
              学习内容变化后重新生成
            </label>
            {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
            {message && (
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>
            )}
            <button
              disabled={generating || detailLoading || !stageKey}
              className="mt-5 w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {generating ? "正在准备资源…" : "生成学习资源"}
            </button>
            {!detailLoading && detail && !stages.length && (
              <p className="mt-3 text-xs text-slate-500" role="status">
                该学生尚无可用学习阶段。
              </p>
            )}
          </form>
          <section className="rounded-2xl border bg-white p-6 lg:col-span-3">
            <h2 className="font-semibold">该学生已有资源</h2>
            <div className="mt-4 divide-y">
              {detailLoading ? (
                <p className="py-10 text-center text-sm text-slate-500" role="status">
                  正在加载资源…
                </p>
              ) : detail?.resources?.length ? (
                detail.resources.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-4">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.resource_type} · 路径 V{item.path_version} · {item.stage_key}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                      {item.status} / {item.progress_status || "未开始"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">暂无资源</p>
              )}
            </div>
          </section>
        </div>
      </State>
    </>
  );
}
function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-2 block text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
