/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { LearningProfileDraft, ProfileFieldKey, ProfileFieldMeta } from "../../api";

export const PROFILE_FIELDS: ProfileFieldKey[] = [
  "majorAndGrade",
  "currentCourse",
  "priorKnowledge",
  "learningGoals",
  "explanationPreference",
  "resourcePreferences",
  "paceAndTimeBudget",
];

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  majorAndGrade: "专业与年级",
  currentCourse: "当前课程",
  priorKnowledge: "已有基础",
  learningGoals: "学习目标",
  explanationPreference: "讲解偏好",
  resourcePreferences: "资源偏好",
  paceAndTimeBudget: "学习节奏与时间",
};

interface Props {
  field: ProfileFieldKey;
  draft: LearningProfileDraft;
  meta?: ProfileFieldMeta;
  missing?: boolean;
  showEvidence?: boolean;
}

export default function ProfileDimensionCard({
  field,
  draft,
  meta,
  missing = false,
  showEvidence = true,
}: Props) {
  const confidence = confidenceLabel(meta?.confidence);
  const value = formatProfileValue(field, draft);
  return (
    <div className={`lm-profile-dimension ${missing ? "is-missing" : ""}`}>
      <dt>
        <span>{PROFILE_FIELD_LABELS[field]}</span>
        {confidence && <small>{confidence}</small>}
      </dt>
      <dd>
        <p>{value || "待补充"}</p>
        {missing && <span className="lm-profile-dimension__missing">这项信息仍需补充</span>}
        {showEvidence && meta?.evidence && <blockquote>依据：{meta.evidence}</blockquote>}
        {showEvidence && meta?.source && (
          <small className="lm-profile-dimension__source">{sourceLabel(meta.source)}</small>
        )}
      </dd>
    </div>
  );
}

export function formatProfileValue(field: ProfileFieldKey, draft: LearningProfileDraft): string {
  if (field === "majorAndGrade") {
    return [draft.majorAndGrade.major, draft.majorAndGrade.grade].filter(Boolean).join(" · ");
  }
  if (field === "paceAndTimeBudget") {
    const minutes = draft.paceAndTimeBudget.weeklyTimeBudgetMinutes;
    const budget = minutes ? (minutes % 60 === 0 ? `每周 ${minutes / 60} 小时` : `每周 ${minutes} 分钟`) : "";
    return [draft.paceAndTimeBudget.pacePreference, budget].filter(Boolean).join(" · ");
  }
  const value = draft[field];
  return Array.isArray(value) ? value.join("、") : String(value || "");
}

export function confidenceLabel(confidence?: number): string | null {
  if (typeof confidence !== "number") return null;
  if (confidence >= 0.85) return "信息明确";
  if (confidence >= 0.6) return "建议确认";
  return "需要补充";
}

export function sourceLabel(source?: string): string {
  const labels: Record<string, string> = {
    student_dialogue: "来自你的画像对话",
    student_edit: "来自你的确认修改",
    dialogue_confirmation: "来自画像确认",
    quiz_submission: "来自真实测验更新",
    quiz_behavior: "来自真实测验记录",
    wrong_answers: "来自真实错题记录",
    demo_seed: "来自已确认的初始画像",
    manual: "来自你的主动更新",
  };
  return source ? labels[source] || "来自已确认的学习记录" : "来源未记录";
}
