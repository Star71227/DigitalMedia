/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import type { ResourceGenerationEvent, ResourceGenerationStage } from "../../api";

const ORDER: ResourceGenerationStage[] = [
  "profile_analysis",
  "learning_context_analysis",
  "knowledge_retrieval",
  "content_generation",
  "deterministic_review",
  "ai_review",
  "rendering",
  "persistence",
  "path_linking",
  "completed",
];

const LABELS: Record<string, string> = {
  profile_analysis: "建立学习上下文",
  learning_context_analysis: "分析当前薄弱点",
  knowledge_retrieval: "读取课程证据",
  content_generation: "生成个性化内容",
  deterministic_review: "规则审核",
  ai_review: "模型审核",
  rendering: "渲染资源文件",
  persistence: "保存资源版本",
  path_linking: "关联学习路径",
  completed: "生成完成",
  failed: "生成失败",
};

export default function GenerationTimeline({
  events,
  currentStage,
}: {
  events: ResourceGenerationEvent[];
  currentStage: ResourceGenerationStage;
}) {
  const latest = new Map<string, ResourceGenerationEvent>();
  events.filter((item) => item.eventType === "stage").forEach((item) => latest.set(item.stage, item));

  return (
    <ol className="space-y-2">
      {ORDER.map((stage, index) => {
        const event = latest.get(stage);
        const skipped =
          event?.status === "skipped" ||
          (stage === "ai_review" && event?.metadata?.modelReviewExecuted === false);
        const failed = event?.status === "failed";
        const done = event?.status === "completed" && !skipped;
        const active = currentStage === stage && !done && !skipped && !failed;
        return (
          <li
            key={stage}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            <span
              className={`mt-1 h-2.5 w-2.5 rounded-full ${done ? "bg-emerald-500" : active ? "bg-blue-500" : "bg-slate-300"}`}
            />
            <div className="min-w-0">
              <strong className="text-sm text-slate-900">{LABELS[stage]}</strong>
              <p className="mt-1 break-words text-xs leading-5 text-slate-600">
                {event?.message || "等待后端处理到这一阶段。"}
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {failed
                ? "失败"
                : skipped
                  ? "已跳过"
                  : done
                    ? "完成"
                    : active
                      ? "进行中"
                      : currentStage === "completed"
                        ? "无执行记录"
                        : "等待"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
