/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import type { LearningResource, LearningResourceType } from "../../api";
import CodeCasePreview from "./CodeCasePreview";
import MindMapViewer, { type MindMapContent } from "./MindMapViewer";
import PptxPreview from "./PptxPreview";
import QuizPackPreview from "./QuizPackPreview";
import ResourceReviewPanel from "./ResourceReviewPanel";
import StudyNotePreview from "./StudyNotePreview";

const TYPE_LABELS: Record<LearningResourceType, string> = {
  study_note: "个性化学习讲义",
  mind_map: "个性化思维导图",
  pptx: "个性化课件",
  quiz_pack: "自适应练习包",
  code_case: "代码实操案例",
};

export default function ResourcePreview({
  resource,
  onOpenCodeLab,
}: {
  resource: LearningResource;
  onOpenCodeLab?: () => void;
}) {
  const readingWidth =
    resource.resourceType === "study_note" ||
    resource.resourceType === "quiz_pack" ||
    resource.resourceType === "code_case"
      ? "mx-auto max-w-[840px]"
      : "max-w-full";

  return (
    <article className="lm-resource-preview space-y-5">
      <header className={`${readingWidth} rounded-lg border border-slate-200 bg-white p-4`}>
        <p className="text-xs font-semibold uppercase text-blue-700">{TYPE_LABELS[resource.resourceType]}</p>
        <h2 className="mt-2 break-words text-2xl font-bold text-slate-950">{resource.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {resource.subject} · {resource.knowledgePoint} · 预计 {resource.estimatedMinutes} 分钟
        </p>
        <p
          className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold"
          role="status"
        >
          {resource.sourceMode === "deterministic_fallback"
            ? "规则模板生成（本次未采用模型内容）"
            : [
                  "model",
                  "model_generated",
                  "model_enhanced",
                  "model_grounded",
                  "llm",
                  "rag_model",
                  "model_only",
                  // 练习包是"模型从真实题库里挑选并组卷"，来源标记是 question_bank_model，
                  // 以前没列进来，页面会显示 "生成来源：question_bank_model" 这种英文原文。
                  "question_bank_model",
                ].includes(resource.sourceMode || "")
              ? "AI 增强生成"
              : `生成来源：${resource.sourceMode || "后端未报告"}`}
        </p>
        {resource.knowledgeNotice && (
          <p className="mt-2 text-xs text-amber-800">{resource.knowledgeNotice}</p>
        )}
        {resource.targetLearnerSummary && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            {resource.targetLearnerSummary}
          </p>
        )}
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span>{progressLabel(resource)}</span>
            <span>{resource.progress?.progressPercent ?? 0}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${resource.progress?.progressPercent ?? 0}%` }}
            />
          </div>
        </div>
      </header>

      {resource.learningObjectives.length > 0 && (
        <section className={`${readingWidth} rounded-lg border border-slate-200 bg-white p-4`}>
          <h3 className="text-sm font-bold text-slate-950">读完后应能做到</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
            {resource.learningObjectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </section>
      )}

      <div className={readingWidth}>
        <ResourceReviewPanel review={resource.review} />
      </div>

      <div className={readingWidth}>
        {resource.resourceType === "study_note" && <StudyNotePreview content={resource.content as never} />}
        {resource.resourceType === "mind_map" && (
          <MindMapViewer
            content={resource.content as unknown as MindMapContent}
            title={resource.title}
            citations={resource.citations || []}
          />
        )}
        {resource.resourceType === "pptx" && (
          <PptxPreview
            content={
              resource.content as {
                slides?: Array<Record<string, unknown>>;
                references?: Array<Record<string, string>>;
              }
            }
            citations={resource.citations || []}
          />
        )}
        {resource.resourceType === "quiz_pack" && (
          <QuizPackPreview resource={resource} content={resource.content as never} />
        )}
        {resource.resourceType === "code_case" && (
          <CodeCasePreview content={resource.content as never} onOpenCodeLab={onOpenCodeLab} />
        )}
      </div>

      <details
        className={`${readingWidth} rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600`}
      >
        <summary className="cursor-pointer font-bold text-slate-950">查看生成依据和版本信息</summary>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">个性化生成依据</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-6">
              {resource.generationRationale.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">
            资源版本 V{resource.version} · 路径版本 V{resource.pathVersion}
          </p>
        </div>
      </details>
    </article>
  );
}

function progressLabel(resource: LearningResource) {
  const status = resource.progress?.status;
  if (status === "completed") return "已完成";
  if (status === "completed_unverified") return "已学习，等待验证";
  if (status === "opened" || status === "in_progress") return "学习中";
  return "尚未开始";
}
