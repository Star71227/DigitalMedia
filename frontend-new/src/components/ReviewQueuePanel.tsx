/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useState } from "react";
import { getReviewQueue, submitReviewResult, describeApiError, type ReviewQueueItem } from "../api";

export default function ReviewQueuePanel({
  onNavigate,
}: {
  onNavigate: (tab: string, data?: unknown) => void;
}) {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [future, setFuture] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await getReviewQueue(future));
    } catch (reason) {
      setError(describeApiError(reason, "复习队列读取失败"));
    } finally {
      setLoading(false);
    }
  }, [future]);
  useEffect(() => {
    void load();
  }, [load]);
  async function rate(id: number, quality: number) {
    setSaving(id);
    setError("");
    setNotice("");
    try {
      const result = await submitReviewResult(id, quality);
      setNotice(`已保存复习效果，下次复习安排在 ${new Date(result.dueAt).toLocaleDateString("zh-CN")}。`);
      await load();
    } catch (reason) {
      setError(describeApiError(reason, "复习结果保存失败"));
    } finally {
      setSaving(null);
    }
  }
  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5" aria-label="滚动复习">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-slate-800">滚动复习</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={future}
            disabled={saving !== null}
            onChange={(e) => setFuture(e.target.checked)}
          />
          显示后续计划
        </label>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        先回顾知识点或完成练习，再反馈掌握情况。系统据此计算下次复习时间。
      </p>
      {error && (
        <div role="alert" className="mt-3 text-sm text-rose-700">
          {error}{" "}
          <button className="lm-button" onClick={() => void load()}>
            重试
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status" className="mt-3 text-sm text-slate-500">
          正在读取复习计划…
        </p>
      ) : !items.length ? (
        <p className="mt-3 text-sm text-slate-500">
          {future ? "暂无复习计划，分析错题后会自动安排。" : "当前没有到期任务，可查看后续计划。"}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <strong className="text-sm text-slate-800">{item.knowledgePoint}</strong>
              <p className="mt-1 text-xs text-slate-500">
                {item.subject} · {new Date(item.dueAt).toLocaleString("zh-CN")} · 已复习{" "}
                {item.repetitionCount} 次
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="lm-button"
                  onClick={() =>
                    onNavigate(
                      "mentor",
                      `请结合课程资料帮我复习${item.subject}的${item.knowledgePoint}，并给出一道自测题。`,
                    )
                  }
                >
                  助手讲解
                </button>
                <button
                  className="lm-button"
                  onClick={() =>
                    onNavigate("quiz", { subject: item.subject, knowledgePoint: item.knowledgePoint })
                  }
                >
                  同类练习
                </button>
                {[
                  [1, "还不会"],
                  [3, "需要提示"],
                  [5, "已掌握"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className="lm-button"
                    disabled={saving !== null || new Date(item.dueAt).getTime() > Date.now()}
                    onClick={() => void rate(item.id, Number(value))}
                  >
                    {saving === item.id ? "保存中…" : label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
