/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState } from "react";
import { Database, MessageSquare, Trash2, Upload } from "lucide-react";
import {
  deletePersonalKnowledge,
  fetchKnowledgeOverview,
  listPersonalKnowledge,
  uploadPersonalKnowledge,
  type KnowledgeOverviewResponse,
  type PersonalKnowledgeDocument,
} from "../api";

export default function KnowledgeBaseOverview({
  onAskWithCourse,
}: {
  onAskWithCourse?: (subject: string) => void;
}) {
  const [data, setData] = useState<KnowledgeOverviewResponse | null>(null);
  const [documents, setDocuments] = useState<PersonalKnowledgeDocument[]>([]);
  const [subject, setSubject] = useState("数据结构");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchKnowledgeOverview()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    listPersonalKnowledge()
      .then((items) => {
        if (!cancelled) setDocuments(items);
      })
      .catch(() => {
        if (!cancelled) setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setMessage("");
    if (file.size > 2 * 1024 * 1024) {
      setMessage("单份文字资料不能超过 2MB。");
      return;
    }
    setBusy(true);
    try {
      const contentText = await file.text();
      const result = await uploadPersonalKnowledge({
        title: file.name.replace(/\.[^.]+$/, ""),
        fileName: file.name,
        mimeType: file.type || "text/plain",
        subject,
        contentText,
      });
      setDocuments((current) =>
        result.duplicate
          ? current
          : [result.document, ...current.filter((item) => item.id !== result.document.id)],
      );
      setMessage(
        result.duplicate
          ? "这份资料已存在，没有重复导入。"
          : `已导入并切分为 ${result.document.chunkCount || 0} 个私有知识块。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "资料导入失败。");
    } finally {
      setBusy(false);
    }
  };

  const removeDocument = async (documentId: number) => {
    setBusy(true);
    setMessage("");
    try {
      await deletePersonalKnowledge(documentId);
      setDocuments((current) => current.filter((item) => item.id !== documentId));
      setMessage("个人资料已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除资料失败。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4" aria-label="本地知识库概览">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <h2 className="lm-kb-port-title">本地知识库</h2>
        </div>
        {data && (
          <dl className="flex gap-5 text-center">
            <div>
              <dt className="text-[11px] text-slate-400">课程</dt>
              <dd className="text-lg font-bold text-slate-800">{data.total.subjects}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">讲义</dt>
              <dd className="text-lg font-bold text-slate-800">{data.total.sources}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">知识块</dt>
              <dd className="text-lg font-bold text-slate-800">{data.total.chunks}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">知识点</dt>
              <dd className="text-lg font-bold text-slate-800">{data.total.points}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="lm-kb-port-title">导入资料</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={busy}
              aria-label="资料所属课程"
            >
              {["数据结构", "操作系统", "计算机组成原理", "计算机网络", "C语言"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <label className="lm-button lm-button--primary cursor-pointer">
              <Upload aria-hidden="true" />
              {busy ? "处理中…" : "导入资料"}
              <input
                className="hidden"
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  void handleFile(file);
                }}
              />
            </label>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="lm-kb-port-title">对照课程资料提问</h3>
          <div className="mt-3">
            <button
              type="button"
              className="lm-button lm-button--primary"
              onClick={() => onAskWithCourse?.(subject)}
            >
              <MessageSquare aria-hidden="true" />
              去助手提问
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        {message && (
          <p className="mt-2 text-sm text-slate-600" role="status">
            {message}
          </p>
        )}
        {documents.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-slate-700">{document.title}</strong>
                  <span className="text-xs text-slate-500">
                    {document.subject} · {document.chunkCount || 0} 个知识块
                  </span>
                </div>
                <button
                  type="button"
                  className="lm-chat-icon-button"
                  aria-label={`删除${document.title}`}
                  disabled={busy}
                  onClick={() => void removeDocument(document.id)}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">尚未导入个人资料。</p>
        )}
      </div>
    </section>
  );
}
