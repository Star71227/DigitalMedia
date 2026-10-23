/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { BookOpen, ChevronRight, CircleCheck, FileText, UserRound } from "lucide-react";
import { useId } from "react";
import type { ChatAnswer, ChatCitation } from "../../types";
import MarkdownRenderer from "../MarkdownRenderer";

interface ChatAnswerViewProps {
  answer: ChatAnswer;
  onChooseFollowup: (followup: string) => void;
  onNavigateToProfile: () => void;
}

const SOURCE_LABELS: Record<ChatAnswer["sourceMode"], string> = {
  rag_model: "结合课程资料",
  model_only: "模型通识回答",
  deterministic_fallback: "本地资料整理",
  clarification: "需要补充信息",
};

const PROFILE_LABELS: Record<string, string> = {
  priorKnowledge: "已有知识",
  learningGoals: "学习目标",
  explanationPreference: "讲解偏好",
  resourcePreferences: "资源偏好",
  pacePreference: "学习节奏",
  currentCourse: "当前课程",
};

const TRACE_LABELS: Record<string, string> = {
  learner_context: "读取学习背景",
  context_resolution: "衔接当前对话",
  intent: "理解问题意图",
  retrieval: "检索课程资料",
  TutorAgent: "组织学习回答",
  ReviewAgent: "复核回答内容",
  local_fallback: "整理本地资料",
};

function citationLabel(citation: ChatCitation) {
  return citation.label.replace(/^\[|\]$/g, "");
}

function publicTraceDetail(detail?: string) {
  if (!detail || /Agent|[_{}[\]]/.test(detail)) return null;
  return detail;
}

function CitationList({
  citations,
  citationIdPrefix,
}: {
  citations: ChatCitation[];
  citationIdPrefix: string;
}) {
  if (!citations.length) return null;

  return (
    <section className="lm-chat-evidence" aria-label="学习资料依据">
      <div className="lm-chat-section-heading" data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
        <BookOpen aria-hidden="true" />
        <h3>学习资料依据</h3>
      </div>
      <div className="lm-chat-evidence__list">
        {citations.map((citation, index) => {
          const label = citationLabel(citation) || `S${index + 1}`;
          const location = [citation.chapter, citation.section].filter(Boolean).join(" / ");
          return (
            <details
              id={`${citationIdPrefix}-${label}`}
              key={`${label}-${index}`}
              className="lm-chat-evidence__item"
            >
              <summary>
                <span className="lm-chat-evidence__label" data-level="B" data-carrier="tab" data-enter="attach" data-family="F13" data-mg-behavior="reveal">[{label}]</span>
                <span>
                  <strong>{citation.sourceTitle || "课程资料"}</strong>
                  {location && <small>{location}</small>}
                </span>
                <ChevronRight aria-hidden="true" />
              </summary>
              <div className="lm-chat-evidence__body">
                <p>{citation.excerpt}</p>
                {(citation.license || citation.version) && (
                  <small>
                    {[citation.license, citation.version && `版本 ${citation.version}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

export default function ChatAnswerView({
  answer,
  onChooseFollowup,
  onNavigateToProfile,
}: ChatAnswerViewProps) {
  const citationIdPrefix = `${useId().replace(/:/g, "")}-citation`;
  const citationLabels = answer.citations.map(citationLabel);
  const visibleTrace = answer.trace?.steps?.slice(0, 8) ?? [];
  const traceSummary = publicTraceDetail(answer.trace?.summary);
  const followups = answer.followups.slice(0, 3);

  return (
    <article className="lm-chat-answer">
      <div className="lm-chat-answer__meta">
        <span className={`lm-chat-source lm-chat-source--${answer.sourceMode}`}>
          {SOURCE_LABELS[answer.sourceMode]}
        </span>
        {answer.subject && <span>{answer.subject}</span>}
        {answer.knowledgePoint && <span>{answer.knowledgePoint}</span>}
      </div>

      {answer.knowledgeNotice && <p className="lm-chat-notice">{answer.knowledgeNotice}</p>}

      <MarkdownRenderer
        content={answer.answerMarkdown}
        citationLabels={citationLabels}
        citationIdPrefix={citationIdPrefix}
      />
      <CitationList citations={answer.citations} citationIdPrefix={citationIdPrefix} />

      {followups.length > 0 && (
        <section className="lm-chat-followups" aria-label="继续追问">
          <div className="lm-chat-section-heading" data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
            <FileText aria-hidden="true" />
            <h3>继续追问</h3>
          </div>
          <div className="lm-chat-followups__list">
            {followups.map((followup) => (
              <button type="button" key={followup} onClick={() => onChooseFollowup(followup)}>
                <span>{followup}</span>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      {answer.profileSuggestions.length > 0 && (
        <section className="lm-chat-profile-suggestions" aria-label="学习画像建议">
          <div className="lm-chat-section-heading" data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
            <UserRound aria-hidden="true" />
            <h3>学习画像建议</h3>
          </div>
          {answer.profileSuggestions.slice(0, 3).map((suggestion, index) => (
            <div key={`${suggestion.dimension}-${index}`}>
              <strong>{PROFILE_LABELS[suggestion.dimension] || "学习偏好"}</strong>
              <p>{suggestion.suggestedValue.join("、")}</p>
              <small>{suggestion.reason || suggestion.evidence}</small>
            </div>
          ))}
          <button type="button" className="lm-chat-text-action" onClick={onNavigateToProfile}>
            前往学习画像核对
          </button>
        </section>
      )}

      {visibleTrace.length > 0 && (
        <details className="lm-chat-details">
          <summary>查看回答过程</summary>
          {traceSummary && <p>{traceSummary}</p>}
          <ol>
            {visibleTrace.map((step, index) => (
              <li key={`${step.name}-${index}`}>
                <CircleCheck aria-hidden="true" />
                <span>
                  <strong>{TRACE_LABELS[step.name] || "学习处理"}</strong>
                  {publicTraceDetail(step.detail) && <small>{publicTraceDetail(step.detail)}</small>}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {answer.sourceMode !== "clarification" && answer.quality && (
        <details className="lm-chat-details lm-chat-details--quality">
          <summary>回答质量说明</summary>
          <p>
            {answer.quality.passed
              ? "回答已完成结构与内容检查。"
              : "部分内容未通过完整性检查，请结合资料依据核验。"}
          </p>
          <dl>
            {typeof answer.quality.sectionCount === "number" && (
              <>
                <dt>回答段落</dt>
                <dd>{answer.quality.sectionCount}</dd>
              </>
            )}
            {typeof answer.quality.exampleCount === "number" && (
              <>
                <dt>示例</dt>
                <dd>{answer.quality.exampleCount}</dd>
              </>
            )}
            {typeof answer.quality.practiceCount === "number" && (
              <>
                <dt>练习建议</dt>
                <dd>{answer.quality.practiceCount}</dd>
              </>
            )}
          </dl>
        </details>
      )}
    </article>
  );
}
