/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useState } from "react";
import type { ProfileFieldKey, ProfileResponse } from "../../api";
import { confidenceLabel, PROFILE_FIELD_LABELS, sourceLabel } from "./ProfileDimensionCard";

export default function ProfileEvidence({ items }: { items: ProfileResponse["evidenceSummary"] }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="lm-profile-disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-expanded={open}>
        <span>
          <strong>画像依据</strong>
          <small>{items.length ? `${items.length} 项真实来源` : "尚无来源记录"}</small>
        </span>
        <span aria-hidden="true">{open ? "收起" : "展开"}</span>
      </summary>
      <div className="lm-profile-disclosure__body">
        {items.length === 0 ? (
          <p className="lm-profile-disclosure__empty">
            画像确认或产生真实测验记录后，这里会保留来源与更新依据。
          </p>
        ) : (
          <ul className="lm-profile-evidence-list">
            {items.map((item, index) => (
              <li key={`${item.field}-${index}`}>
                <div>
                  <strong>{evidenceFieldLabel(item.field)}</strong>
                  {typeof item.confidence === "number" && <span>{confidenceLabel(item.confidence)}</span>}
                </div>
                <p>{item.evidence || "这项信息来自已保存的学习记录。"}</p>
                <small>{sourceLabel(item.source)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function evidenceFieldLabel(field: string) {
  if (field in PROFILE_FIELD_LABELS) return PROFILE_FIELD_LABELS[field as ProfileFieldKey];
  if (field === "knowledgeMastery") return "知识点掌握记录";
  if (field === "errorPatterns") return "错题与错误模式";
  return "学习记录依据";
}
