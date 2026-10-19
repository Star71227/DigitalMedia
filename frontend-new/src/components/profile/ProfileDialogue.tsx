/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import {
  confirmProfileDialogue,
  describeApiError,
  sendProfileDialogueMessage,
  startProfileDialogue,
  type ProfileDialogueResponse,
  type ProfileFieldKey,
  type ProfileResponse,
} from "../../api";
import ProfileConfirmation from "./ProfileConfirmation";
import ProfileDimensionCard, { PROFILE_FIELDS, PROFILE_FIELD_LABELS } from "./ProfileDimensionCard";

const EXAMPLE =
  "我是软件工程大二学生，正在学习数据结构。链表和栈比较熟，但树和图掌握得不好。我希望准备408考试，喜欢先看图解再看C语言代码，每天大约可以学习一小时。";

export default function ProfileDialogue({
  onConfirmed,
  onCancel,
}: {
  onConfirmed: (profile: ProfileResponse) => void;
  onCancel?: () => void;
}) {
  const [session, setSession] = useState<ProfileDialogueResponse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const busyRef = useRef(false);

  const loadSession = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      setSession(await startProfileDialogue());
    } catch (reason) {
      setError(describeApiError(reason, "画像对话暂时无法开始"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  const send = async () => {
    const content = message.trim();
    if (!session || !content || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await sendProfileDialogueMessage(session.sessionId, content);
      const priorMessages = session.messages || [];
      const patchMeta = Object.fromEntries(
        Object.entries(next.profilePatch || {}).map(([field, descriptor]) => [
          field,
          {
            confidence: descriptor?.confidence,
            evidence: descriptor?.evidence,
            source: "student_dialogue",
          },
        ]),
      );
      setSession({
        ...next,
        fieldMeta: { ...session.fieldMeta, ...next.fieldMeta, ...patchMeta },
        messages: next.messages || [
          ...priorMessages,
          { role: "user", content },
          { role: "assistant", content: next.assistantMessage },
        ],
      });
      setMessage("");
    } catch (reason) {
      setError(describeApiError(reason, "这段描述没有成功提交"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      onConfirmed(await confirmProfileDialogue(session.sessionId, session.currentDraft));
    } catch (reason) {
      setError(describeApiError(reason, "学习画像确认失败"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const extractedFields = PROFILE_FIELDS.filter((field) => Boolean(session?.profilePatch?.[field]));
  const missingFields = (session?.missingFields || []).filter((field): field is ProfileFieldKey =>
    PROFILE_FIELDS.includes(field as ProfileFieldKey),
  );
  const recognizedCount = PROFILE_FIELDS.length - missingFields.length;
  const hasRestoredConversation = Boolean(session?.messages && session.messages.length > 1);

  return (
    <section className="lm-profile-dialogue" aria-labelledby="profile-dialogue-title">
      <header className="lm-profile-dialogue__header">
        <div>
          <h2 id="profile-dialogue-title">用一段话介绍你的学习情况</h2>
          <p>
            可以同时说明专业年级、当前课程、已有基础、目标、偏好和每周可投入的时间。系统只提取你明确表达的信息。
          </p>
        </div>
        {session && <span>{recognizedCount} / 7 项已识别</span>}
        {onCancel && (
          <button type="button" onClick={onCancel}>
            返回画像总览
          </button>
        )}
      </header>

      {hasRestoredConversation && (
        <p className="lm-profile-dialogue__restored" role="status">
          已恢复上次未完成的画像对话，没有创建重复会话。
        </p>
      )}

      <div className="lm-profile-prompt" aria-live="polite" aria-busy={busy && !session ? "true" : undefined}>
        <strong>{busy && !session ? "正在恢复画像对话" : "AI 想继续了解"}</strong>
        <p>{studentAssistantMessage(session?.assistantMessage)}</p>
      </div>

      <div className="lm-profile-composer">
        <label htmlFor="profile-natural-language">我的学习情况</label>
        <textarea
          ref={inputRef}
          id="profile-natural-language"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              !composingRef.current
            ) {
              event.preventDefault();
              void send();
            }
          }}
          maxLength={1000}
          rows={6}
          disabled={!session || busy}
          aria-describedby="profile-input-example profile-input-count"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          placeholder="写下课程、基础、目标、偏好和学习时间…"
        />
        <div className="lm-profile-composer__meta">
          <p id="profile-input-example">示例：{EXAMPLE}</p>
          <span id="profile-input-count">{message.length} / 1000</span>
        </div>
        <div className="lm-profile-composer__actions">
          <button
            type="button"
            className="lm-button lm-button--primary"
            disabled={!session || busy || !message.trim()}
            onClick={() => void send()}
          >
            {busy && session
              ? "正在分析…"
              : session?.status === "ready_for_confirmation"
                ? "提交补充"
                : "发送给 AI 分析"}
          </button>
          {!session && !busy && (
            <button
              type="button"
              className="lm-button lm-dashboard-secondary-button"
              onClick={() => void loadSession()}
            >
              重新开始
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="lm-profile-error" role="alert">
          <p>{error}</p>
          <span>已输入的内容仍保留在输入框中。</span>
        </div>
      )}

      {session?.modelAvailable === false && (
        <p className="lm-profile-model-note" role="status">
          本轮使用明确表达规则提取，复杂表达可能需要继续补充；系统没有把模型不可用伪装成已完成分析。
        </p>
      )}
      {session?.modelAvailable === true && (
        <p className="lm-profile-model-note" role="status">
          本轮由 AI 分析，并以明确表达规则校验学生原话。
        </p>
      )}

      {extractedFields.length > 0 && session && (
        <section className="lm-profile-extraction" aria-labelledby="profile-extraction-title">
          <div className="lm-profile-extraction__heading">
            <h3 id="profile-extraction-title">已从这段描述中识别出以下信息</h3>
            <p>请同时检查提取值和学生原话依据。</p>
          </div>
          <dl className="lm-profile-dimension-list lm-profile-dimension-list--extraction">
            {extractedFields.map((field) => (
              <ProfileDimensionCard
                key={field}
                field={field}
                draft={session.currentDraft}
                meta={{
                  ...session.fieldMeta[field],
                  confidence: session.profilePatch?.[field]?.confidence,
                  evidence: session.profilePatch?.[field]?.evidence,
                  source: "student_dialogue",
                }}
                missing={missingFields.includes(field)}
              />
            ))}
          </dl>
        </section>
      )}

      {session && (
        <div className="lm-profile-missing-summary">
          <strong>{missingFields.length ? "仍需补充" : "七项信息已经齐全"}</strong>
          <p>
            {missingFields.length
              ? `${missingFields.map((field) => PROFILE_FIELD_LABELS[field]).join("、")}。当前追问会优先补充其中一项。`
              : "可以继续修订，也可以进入确认。"}
          </p>
        </div>
      )}

      {session?.messages && session.messages.length > 1 && (
        <details className="lm-profile-conversation-history">
          <summary>查看本次画像对话</summary>
          <ol>
            {session.messages.map((item, index) => (
              <li key={`${item.role}-${item.created_at || index}`}>
                <strong>{item.role === "user" ? "我" : "AI"}</strong>
                <p>{item.content}</p>
              </li>
            ))}
          </ol>
        </details>
      )}

      {session?.status === "ready_for_confirmation" && (
        <ProfileConfirmation
          draft={session.currentDraft}
          fieldMeta={session.fieldMeta}
          missingFields={session.missingFields}
          submitting={busy}
          onConfirm={() => void confirm()}
          onContinue={() => inputRef.current?.focus()}
        />
      )}
    </section>
  );
}

function studentAssistantMessage(message?: string) {
  const value = message || "你可以先用一段完整的话介绍自己的学习情况。";
  return value.replace(/你也可以选择跳过[。.]?/g, "暂不填写时，这项会保持未完善。");
}
