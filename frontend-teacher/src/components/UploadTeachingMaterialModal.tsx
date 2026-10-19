/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { BookOpen, CheckCircle2, FileText, FileUp, Trash2, UploadCloud, X } from "lucide-react";
import { ElasticMount } from "./effects/ElasticMount";

export interface PendingMaterial {
  id: string;
  fileName: string;
  fileSize: number;
  course: string;
  knowledgePoint: string;
  resourceType: string;
  title: string;
  description: string;
  audience: string;
  createdAt: string;
}

const STORAGE_KEY = "learnmate.teacher.pending-materials";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".ppt", ".pptx", ".doc", ".docx"];

const courses = ["C语言程序设计", "数据结构", "计算机组成原理", "操作系统", "计算机网络"];

const knowledgePoints: Record<string, string[]> = {
  C语言程序设计: ["程序设计基础", "指针与内存", "函数与递归", "结构体与文件"],
  数据结构: ["线性表", "树与图", "排序与查找", "复杂度分析"],
  计算机组成原理: ["指令系统", "CPU组织", "存储层次", "输入输出系统"],
  操作系统: ["进程与线程", "内存管理", "文件系统", "死锁与调度"],
  计算机网络: ["TCP/IP协议", "路由与交换", "网络安全", "应用层服务"],
};

const resourceTypes = ["课程课件", "教学讲义", "实验材料", "复习资料", "参考文档"];
const audiences = ["当前班级", "全部学生", "指定学习阶段"];

function readPendingMaterials(): PendingMaterial[] {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatSize(bytes: number) {
  if (!bytes) return "大小未知";
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;
}

function extensionOf(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : "";
}

export function usePendingMaterials() {
  const [pendingMaterials, setPendingMaterials] = useState<PendingMaterial[]>(readPendingMaterials);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pendingMaterials));
    } catch {
      // Session storage is an enhancement for the demo; the current page state remains usable.
    }
  }, [pendingMaterials]);

  return { pendingMaterials, setPendingMaterials };
}

interface UploadTeachingMaterialModalProps {
  open: boolean;
  pendingMaterials: PendingMaterial[];
  onClose: () => void;
  onAdd: (material: PendingMaterial) => void;
  onRemove: (id: string) => void;
}

export function UploadTeachingMaterialModal({
  open,
  pendingMaterials,
  onClose,
  onAdd,
  onRemove,
}: UploadTeachingMaterialModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState(courses[0]);
  const [knowledgePoint, setKnowledgePoint] = useState("");
  const [resourceType, setResourceType] = useState(resourceTypes[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState(audiences[0]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const courseKnowledgePoints = useMemo(() => knowledgePoints[course] || [], [course]);

  useEffect(() => {
    if (!courseKnowledgePoints.includes(knowledgePoint)) setKnowledgePoint("");
  }, [courseKnowledgePoints, knowledgePoint]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  if (!open) return null;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setError("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_EXTENSIONS.includes(extensionOf(selected.name))) {
      setFile(null);
      setError("请选择 PDF、PPT、PPTX、DOC 或 DOCX 文件。");
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("单个文件不能超过 25 MB，请选择较小的文件。");
      event.target.value = "";
      return;
    }
    setFile(selected);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !course || !knowledgePoint || !resourceType || !title.trim() || !audience) {
      setError("请完成文件、课程、知识点、资料类型、资料标题和学生范围。");
      return;
    }
    const material: PendingMaterial = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      fileSize: file.size,
      course,
      knowledgePoint,
      resourceType,
      title: title.trim(),
      description: description.trim(),
      audience,
      createdAt: new Date().toISOString(),
    };
    onAdd(material);
    setNotice("资料已加入待同步列表，接入教学资源库后将正式发布。");
    setFile(null);
    setTitle("");
    setDescription("");
    setKnowledgePoint("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <ElasticMount className="flex max-h-[min(92vh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-material-title"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <div className="flex items-center gap-2 text-brand-700">
                <UploadCloud size={18} aria-hidden="true" />
                <h2 id="upload-material-title" className="text-lg font-semibold text-slate-900">
                  上传教学资料
                </h2>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
                上传课程讲义、课件、实验材料或复习资料，为后续学生学习资源生成提供内容基础。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭上传教学资料弹窗"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X size={19} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <form id="upload-material-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="material-file" className="mb-1.5 block text-sm font-medium text-slate-700">
                  选择文件 <span className="text-rose-600">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  id="material-file"
                  type="file"
                  accept=".pdf,.ppt,.pptx,.doc,.docx"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-16 w-full items-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 text-left transition hover:border-brand-400 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-100 text-brand-700">
                    <FileUp size={19} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {file ? file.name : "选择本地文件"}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      支持 PDF、PPT、PPTX、DOC、DOCX，单个文件不超过 25 MB
                      {file ? ` · ${formatSize(file.size)}` : ""}
                    </span>
                  </span>
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="课程" required htmlFor="material-course">
                  <select
                    id="material-course"
                    value={course}
                    onChange={(event) => setCourse(event.target.value)}
                    className="control"
                  >
                    <option value="">请选择课程</option>
                    {courses.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="知识点" required htmlFor="material-knowledge">
                  <select
                    id="material-knowledge"
                    value={knowledgePoint}
                    onChange={(event) => setKnowledgePoint(event.target.value)}
                    className="control"
                  >
                    <option value="">请选择知识点</option>
                    {courseKnowledgePoints.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="资料类型" required htmlFor="material-type">
                  <select
                    id="material-type"
                    value={resourceType}
                    onChange={(event) => setResourceType(event.target.value)}
                    className="control"
                  >
                    {resourceTypes.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="面向学生范围" required htmlFor="material-audience">
                  <select
                    id="material-audience"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                    className="control"
                  >
                    {audiences.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="资料标题" required htmlFor="material-title">
                <input
                  id="material-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  className="control"
                  placeholder="例如：指针与动态内存管理"
                />
              </Field>
              <Field label="简要说明" htmlFor="material-description">
                <textarea
                  id="material-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={240}
                  className="control min-h-24 resize-y"
                  placeholder="补充资料适用场景或学习建议（选填）"
                />
              </Field>
              <p className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">
                <BookOpen size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                文件仅用于本地预览，不会上传服务器、读取正文或解析内容。
              </p>
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
                >
                  {error}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-5 text-emerald-700"
                >
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {notice}
                </p>
              )}
            </form>

            {pendingMaterials.length > 0 && (
              <section
                className="mt-6 border-t border-slate-200 pt-5"
                aria-labelledby="pending-materials-heading"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 id="pending-materials-heading" className="text-sm font-semibold text-slate-900">
                      本次待同步资料
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">仅保存在当前浏览器会话中</p>
                  </div>
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                    待同步 {pendingMaterials.length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {pendingMaterials.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50/70 p-3"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-brand-600">
                        <FileText size={17} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-medium text-slate-900">{item.title}</span>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            待同步
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.fileName} · {item.course} · {item.resourceType} · {formatSize(item.fileSize)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={`删除${item.title}`}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              取消
            </button>
            <button
              type="submit"
              form="upload-material-form"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              添加到待同步列表 <UploadCloud size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </ElasticMount>
    </div>
  );
}

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-600">*</span>}
      </span>
      {children}
    </label>
  );
}
