/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, MessageSquareText, RefreshCw } from "lucide-react";
import {
  describeApiError,
  getStoredUser,
  getLearningProfile,
  type LearningProfileDraft,
  type ProfileFieldKey,
  type ProfileResponse,
} from "../api";
import ProfileDialogue from "./profile/ProfileDialogue";
import ProfileDimensionCard, { PROFILE_FIELDS, sourceLabel } from "./profile/ProfileDimensionCard";
import ProfileEvidence from "./profile/ProfileEvidence";
import ProfileVersionHistory from "./profile/ProfileVersionHistory";
import AsyncState from "./ui/AsyncState";

export default function ProfileView({
  onNavigateToTab,
}: {
  onNavigateToTab: (tab: string, data?: unknown) => void;
}) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  const [showDialogue, setShowDialogue] = useState(false);
  const [confirmedMessage, setConfirmedMessage] = useState("");
  const dialogueStorageKey = `learnmate:profile-dialogue:${getStoredUser()?.studentId || "student"}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const value = await getLearningProfile();
      setData(value);
      const incomplete = value.version === 0 || value.completeness < 1;
      const shouldResume =
        typeof window !== "undefined" && window.sessionStorage.getItem(dialogueStorageKey) === "active";
      setShowDialogue(incomplete || shouldResume);
      if (incomplete && typeof window !== "undefined")
        window.sessionStorage.setItem(dialogueStorageKey, "active");
    } catch (reason) {
      setError(describeApiError(reason, "学习画像读取失败"));
    } finally {
      setLoading(false);
    }
  }, [dialogueStorageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const missingFields = useMemo(
    () => (data ? PROFILE_FIELDS.filter((field) => isMissing(field, data.profile)) : []),
    [data],
  );

  if (loading && !data) {
    return (
      <AsyncState
        kind="loading"
        title="正在读取学习画像"
        description="正在恢复已确认画像和未完成的画像对话。"
      />
    );
  }

  if (error && !data) {
    return (
      <AsyncState
        kind="error"
        title="学习画像暂时无法读取"
        description={error}
        preserved="已有画像和未完成对话都没有被修改。"
        action={{ label: "重新读取", onClick: () => void load() }}
      />
    );
  }

  if (!data) return null;
  const profileConfirmed = data.version > 0;
  const profileComplete = profileConfirmed && missingFields.length === 0;

  const handleConfirmed = (next: ProfileResponse) => {
    setData(next);
    setShowDialogue(false);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(dialogueStorageKey);
    setConfirmedMessage("学习资料已确认并保存。返回首页后，可以从当前任务继续学习。");
    setHistoryKey((value) => value + 1);
  };

  return (
    <div className="lm-profile-page">
      {confirmedMessage && (
        <section className="lm-profile-success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <strong>学习画像已更新</strong>
            <p>{confirmedMessage}</p>
          </div>
          <button type="button" onClick={() => onNavigateToTab("dashboard")}>
            返回学习首页
            <ArrowRight aria-hidden="true" />
          </button>
        </section>
      )}

      {!profileConfirmed && (
        <section className="lm-profile-onboarding">
          <MessageSquareText aria-hidden="true" />
          <div>
            <h2>先让 AI 了解你的学习情况</h2>
            <p>不用逐项填写表格。用一段自然语言说明自己，保存前会请你确认。</p>
          </div>
        </section>
      )}

      {showDialogue && (
        <ProfileDialogue
          onConfirmed={handleConfirmed}
          onCancel={profileConfirmed ? () => setShowDialogue(false) : undefined}
        />
      )}

      {!showDialogue && (
        <section className="lm-profile-overview" aria-labelledby="profile-overview-title">
          <div className="lm-profile-overview__copy">
            <span>{profileComplete ? "当前画像已确认" : "当前画像仍需补充"}</span>
            <h2 id="profile-overview-title">
              {data.profile.currentCourse ? `围绕${data.profile.currentCourse}的学习画像` : "当前学习画像"}
            </h2>
            <p>补充课程、目标和学习偏好后，后续内容会更贴合你的学习节奏。</p>
            <small>最近更新：{formatDate(data.updatedAt)}</small>
          </div>
          <button
            type="button"
            className="lm-button lm-button--primary"
            onClick={() => {
              setConfirmedMessage("");
              if (typeof window !== "undefined") window.sessionStorage.setItem(dialogueStorageKey, "active");
              setShowDialogue(true);
            }}
          >
            补充或修改画像
          </button>
        </section>
      )}

      <section className="lm-profile-dimensions" aria-labelledby="profile-dimensions-title">
        <div className="lm-profile-section-heading">
          <div>
            <h2 id="profile-dimensions-title">
              {showDialogue && profileConfirmed ? "当前已确认画像" : "七维学习画像"}
            </h2>
            <p>
              {showDialogue && profileConfirmed
                ? "本轮修改确认前不会覆盖以下内容。"
                : "以下内容全部来自你的明确描述或已确认记录。"}
            </p>
          </div>
          <span>{missingFields.length ? `${missingFields.length} 项待完善` : "七项已齐全"}</span>
        </div>
        <dl className="lm-profile-dimension-list">
          {PROFILE_FIELDS.map((field) => (
            <ProfileDimensionCard
              key={field}
              field={field}
              draft={data.profile}
              meta={data.fieldMeta[field]}
              missing={missingFields.includes(field)}
            />
          ))}
        </dl>
      </section>

      {data.latestChange && (
        <section className="lm-profile-latest-change">
          <strong>最近一次变化</strong>
          <p>{data.latestChange.reason}</p>
          <small>
            {sourceLabel(data.latestChange.sourceType)} · {formatDate(data.latestChange.createdAt)}
          </small>
        </section>
      )}

      <div className="lm-profile-secondary">
        <ProfileEvidence items={data.evidenceSummary} />
        <ProfileVersionHistory refreshKey={historyKey} />
      </div>

      {error && (
        <div className="lm-profile-refresh-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            重试
          </button>
        </div>
      )}
    </div>
  );
}

function isMissing(field: ProfileFieldKey, draft: LearningProfileDraft) {
  if (field === "majorAndGrade") return !draft.majorAndGrade.major || !draft.majorAndGrade.grade;
  if (field === "paceAndTimeBudget")
    return !draft.paceAndTimeBudget.pacePreference || !draft.paceAndTimeBudget.weeklyTimeBudgetMinutes;
  const value = draft[field];
  return Array.isArray(value) ? value.length === 0 : !value;
}

function formatDate(value: string | null) {
  if (!value) return "尚未确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
