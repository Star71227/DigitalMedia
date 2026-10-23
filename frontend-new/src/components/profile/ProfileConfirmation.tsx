/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { LearningProfileDraft, ProfileFieldKey, ProfileFieldMeta } from "../../api";
import ProfileDimensionCard, { PROFILE_FIELDS, PROFILE_FIELD_LABELS } from "./ProfileDimensionCard";

interface Props {
  draft: LearningProfileDraft;
  fieldMeta: Record<string, ProfileFieldMeta>;
  missingFields: string[];
  submitting: boolean;
  onConfirm: () => void;
  onContinue: () => void;
}

export default function ProfileConfirmation({
  draft,
  fieldMeta,
  missingFields,
  submitting,
  onConfirm,
  onContinue,
}: Props) {
  const missing = missingFields.filter((field): field is ProfileFieldKey =>
    PROFILE_FIELDS.includes(field as ProfileFieldKey),
  );
  return (
    <section className="lm-profile-confirmation" aria-labelledby="profile-confirmation-title">
      <div className="lm-profile-confirmation__heading">
        <div>
          <h3 id="profile-confirmation-title">确认这份学习画像</h3>
          <p>确认前请检查全部七项。画像只会在你点击确认后写入新版本。</p>
        </div>
        <span>{missing.length ? `${missing.length} 项未完善` : "七项已齐全"}</span>
      </div>
      <dl className="lm-profile-dimension-list lm-profile-dimension-list--confirmation">
        {PROFILE_FIELDS.map((field) => (
          <ProfileDimensionCard
            key={field}
            field={field}
            draft={draft}
            meta={fieldMeta[field]}
            missing={missing.includes(field)}
          />
        ))}
      </dl>
      {missing.length > 0 && (
        <p className="lm-profile-confirmation__notice" role="status">
          尚未完善：{missing.map((field) => PROFILE_FIELD_LABELS[field]).join("、")}
          。后端允许先确认当前内容，这些项目会继续保持未完善，不会显示为完整画像。
        </p>
      )}
      <div className="lm-profile-confirmation__actions">
        <button
          type="button"
          className="lm-button lm-button--primary"
          disabled={submitting}
          onClick={onConfirm}
        >
          {submitting ? "正在确认画像…" : "确认并生成学习画像"}
        </button>
        <button
          type="button"
          className="lm-button lm-dashboard-secondary-button"
          disabled={submitting}
          onClick={onContinue}
        >
          继续补充
        </button>
      </div>
    </section>
  );
}
