/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import { askKnowledgeBase, getStudentOverview, type GroundedAnswerResponse } from "../../api";
import GroundedAnswer from "./GroundedAnswer";

export default function CourseQuestionPanel() {
  const [subject, setSubject] = useState("数据结构");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<GroundedAnswerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = useRef(false);
  const requestId = useRef(0);
  useEffect(() => {
    let active = true;
    getStudentOverview()
      .then((result) => {
        if (active && !changed.current && result.profile.currentCourse)
          setSubject(result.profile.currentCourse);
      })
      .catch(() => {});
    return () => {
      active = false;
      requestId.current++;
    };
  }, []);
  const courses = [...new Set([subject, "数据结构", "操作系统", "计算机网络", "计算机组成原理", "C语言"])];
  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4" aria-label="课程证据问答">
      <h3 className="font-semibold text-slate-900">对照课程资料提问</h3>
      <p className="mt-1 text-sm text-slate-600">
        默认采用画像中的当前课程。回答只使用该课程可检索的资料；没有足够证据时会明确提示，请先补充资料。
      </p>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (query.trim().length < 2 || busy) return;
          const id = ++requestId.current;
          setBusy(true);
          setError("");
          setAnswer(null);
          try {
            const result = await askKnowledgeBase(query.trim(), undefined, subject);
            if (id === requestId.current) setAnswer(result);
          } catch (reason) {
            if (id === requestId.current)
              setError(reason instanceof Error ? reason.message : "问答失败，请重试");
          } finally {
            if (id === requestId.current) setBusy(false);
          }
        }}
      >
        <label className="flex items-center gap-3 text-sm">
          检索课程
          <select
            aria-label="问答课程"
            value={subject}
            disabled={busy}
            className="rounded-md border p-2"
            onChange={(e) => {
              changed.current = true;
              setSubject(e.target.value);
              setAnswer(null);
              setError("");
            }}
          >
            {courses.map((course) => (
              <option key={course}>{course}</option>
            ))}
          </select>
        </label>
        <textarea
          aria-label="课程问题"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={1000}
          minLength={2}
          required
          disabled={busy}
          placeholder="输入你想核对的概念、错题或教材疑问"
          className="min-h-24 w-full rounded-md border p-3 text-sm"
        />
        <button
          disabled={busy || query.trim().length < 2}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "正在检索课程证据…" : "依据课程资料回答"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {answer && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-slate-600">
            {answer.sourceMode === "rag_model"
              ? "AI 基于课程证据生成 · 已校验引用"
              : answer.status === "insufficient"
                ? "当前资料未覆盖该问题"
                : "本地课程资料整理 · 未采用模型生成内容"}
          </p>
          <GroundedAnswer data={answer} />
        </div>
      )}
    </section>
  );
}
