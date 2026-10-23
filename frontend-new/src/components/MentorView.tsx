/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ImagePlus,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  ApiRequestError,
  archiveChatSession,
  createChatSession,
  getChatSessionMessages,
  getStoredUser,
  listChatSessions,
  renameChatSession,
  streamChatMessage,
} from "../api";
import type { ChatAnswer, ChatMessage, ChatSession } from "../types";
import MarkdownRenderer from "./MarkdownRenderer";
import ChatAnswerView from "./mentor/ChatAnswerView";
import ChatSessionList from "./mentor/ChatSessionList";

interface MentorViewProps {
  initialPrompt?: string | null;
  onClearPrefill?: () => void;
  onNavigateToProfile?: () => void;
}

interface RequestErrorState {
  sessionId: number;
  message: string;
}

interface WrongQuestionImage {
  name: string;
  dataUrl: string;
}

const QUICK_PROMPTS = [
  "帮我梳理这节课的核心知识点与常见易错点。",
  "请对比栈和队列的典型应用场景。",
  "如何判断一个递归算法的时间复杂度？",
];

function localErrorMessage(error: unknown, area: "sessions" | "messages" | "send") {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "登录状态已失效，正在返回登录页。";
    if (error.status === 403) return "当前账号没有使用学生助手的权限。";
    if (error.status === 409) return "这个会话已归档，请新建会话继续提问。";
    if (error.status === 502) return error.message;
    if (error.status === 503) return error.message;
  }
  if (error instanceof TypeError) return "网络连接异常，请检查连接后再试。";
  if (area === "sessions") return "学习会话暂时无法加载，请稍后重试。";
  if (area === "messages") return "这段对话暂时无法恢复，请稍后重试。";
  return error instanceof Error && error.message ? error.message : "问题发送失败，请稍后再试。";
}

function parseStoredDrafts(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, draft]) => typeof draft === "string")
        .map(([key, draft]) => [key, String(draft).slice(0, 4000)]),
    );
  } catch {
    return {};
  }
}

function answerFromMessage(message: ChatMessage): ChatAnswer | null {
  if (message.answer) return message.answer;
  if (message.role !== "assistant" || !message.content || message.status === "failed") return null;
  return {
    answerMarkdown: message.content,
    sourceMode: "model_only",
    citations: [],
    followups: [],
    profileSuggestions: [],
  };
}

export default function MentorView({ initialPrompt, onClearPrefill, onNavigateToProfile }: MentorViewProps) {
  const storedUser = useMemo(() => getStoredUser(), []);
  const studentStorageId = storedUser?.studentId ?? storedUser?.id ?? "anonymous";
  const recentSessionKey = `learnmate:chat:recent:${studentStorageId}`;
  const draftsStorageKey = `learnmate:chat:drafts:${studentStorageId}`;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<number, ChatMessage[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    typeof window === "undefined" ? {} : parseStoredDrafts(window.localStorage.getItem(draftsStorageKey)),
  );
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionMutation, setSessionMutation] = useState(false);
  const [sendingSessionId, setSendingSessionId] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<RequestErrorState | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftSuggestion, setDraftSuggestion] = useState<string | null>(null);
  const [newAnswerAvailable, setNewAnswerAvailable] = useState(false);
  const [wrongQuestionImage, setWrongQuestionImage] = useState<WrongQuestionImage | null>(null);
  const [wrongQuestionSubject, setWrongQuestionSubject] = useState("数据结构");
  const [attachmentError, setAttachmentError] = useState("");

  const activeSessionIdRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const draftKey = String(activeSessionId ?? "new");
  const currentDraft = drafts[draftKey] ?? "";
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const activeMessages = activeSessionId === null ? [] : (messagesBySession[activeSessionId] ?? []);
  const isBusy = creatingSession || sessionMutation || sendingSessionId !== null;

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    if (activeSessionId !== null) window.localStorage.setItem(recentSessionKey, String(activeSessionId));
  }, [activeSessionId, recentSessionKey]);

  useEffect(() => {
    window.localStorage.setItem(draftsStorageKey, JSON.stringify(drafts));
  }, [drafts, draftsStorageKey]);

  const updateDraft = useCallback((key: string, value: string) => {
    setDrafts((previous) => ({ ...previous, [key]: value.slice(0, 4000) }));
  }, []);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const loadedSessions: ChatSession[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await listChatSessions(page);
        loadedSessions.push(...result.sessions);
        hasMore = result.pagination.hasMore && result.sessions.length > 0;
        page += 1;
      }
      setSessions(loadedSessions);
      setActiveSessionId((current) => {
        if (current !== null && loadedSessions.some((session) => session.id === current)) return current;
        const recent = Number(window.localStorage.getItem(recentSessionKey));
        if (Number.isInteger(recent) && loadedSessions.some((session) => session.id === recent))
          return recent;
        return loadedSessions[0]?.id ?? null;
      });
    } catch (error) {
      setSessionsError(localErrorMessage(error, "sessions"));
    } finally {
      setSessionsLoading(false);
    }
  }, [recentSessionKey]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const refreshMessages = useCallback(async (sessionId: number, signal?: AbortSignal, quiet = false) => {
    if (!quiet) {
      setMessagesLoading(true);
      setMessagesError(null);
    }
    try {
      let result = await getChatSessionMessages(sessionId, signal);
      let messages = result.messages;
      const seenCursors = new Set<number>();
      while (result.pagination.hasMore && result.pagination.nextBeforeId) {
        const cursor = result.pagination.nextBeforeId;
        if (seenCursors.has(cursor)) break;
        seenCursors.add(cursor);
        result = await getChatSessionMessages(sessionId, signal, cursor);
        messages = [...result.messages, ...messages];
      }
      setMessagesBySession((previous) => ({ ...previous, [sessionId]: messages }));
      setSessions((previous) =>
        previous.map((session) => (session.id === sessionId ? result.session : session)),
      );
      return true;
    } catch (error) {
      if (signal?.aborted) return false;
      if (!quiet && activeSessionIdRef.current === sessionId)
        setMessagesError(localErrorMessage(error, "messages"));
      return false;
    } finally {
      if (!quiet && activeSessionIdRef.current === sessionId) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSessionId === null) {
      setMessagesLoading(false);
      setMessagesError(null);
      return;
    }
    const controller = new AbortController();
    void refreshMessages(activeSessionId, controller.signal);
    return () => controller.abort();
  }, [activeSessionId, refreshMessages]);

  useEffect(() => {
    if (!initialPrompt || sessionsLoading) return;
    setDrafts((previous) => {
      const existing = previous[draftKey]?.trim();
      return {
        ...previous,
        [draftKey]: existing ? `${previous[draftKey]}\n${initialPrompt}` : initialPrompt,
      };
    });
    onClearPrefill?.();
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [draftKey, initialPrompt, onClearPrefill, sessionsLoading]);

  useEffect(() => {
    nearBottomRef.current = true;
    setNewAnswerAvailable(false);
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: "end" }), 0);
  }, [activeSessionId]);

  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 52), 168)}px`;
  }, [currentDraft]);

  useEffect(() => {
    if (sendingSessionId === null) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [sendingSessionId]);

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (workspaceRef.current) workspaceRef.current.inert = true;
    const focusable = drawer?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])");
    focusable?.[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const items = Array.from(
        drawer.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"),
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (workspaceRef.current) workspaceRef.current.inert = false;
      document.removeEventListener("keydown", handleKeyDown);
      drawerTriggerRef.current?.focus();
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (nearBottomRef.current) messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeMessages.length, activeSessionId]);

  const createAndSelectSession = async () => {
    setCreatingSession(true);
    setSessionsError(null);
    try {
      const session = await createChatSession();
      const newDraft = drafts.new ?? "";
      setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
      setDrafts((previous) => {
        const next = { ...previous, [String(session.id)]: newDraft };
        delete next.new;
        return next;
      });
      setActiveSessionId(session.id);
      setDrawerOpen(false);
      return session;
    } catch (error) {
      setSessionsError(localErrorMessage(error, "sessions"));
      return null;
    } finally {
      setCreatingSession(false);
    }
  };

  const handleRename = async (sessionId: number, title: string) => {
    setSessionMutation(true);
    try {
      const updated = await renameChatSession(sessionId, title);
      setSessions((previous) => previous.map((session) => (session.id === sessionId ? updated : session)));
    } finally {
      setSessionMutation(false);
    }
  };

  const handleArchive = async (sessionId: number) => {
    setSessionMutation(true);
    try {
      await archiveChatSession(sessionId);
      const remaining = sessions.filter((session) => session.id !== sessionId);
      setSessions(remaining);
      setMessagesBySession((previous) => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[String(sessionId)];
        return next;
      });
      if (activeSessionIdRef.current === sessionId) setActiveSessionId(remaining[0]?.id ?? null);
    } finally {
      setSessionMutation(false);
    }
  };

  const handleChooseFollowup = (followup: string) => {
    if (!currentDraft.trim()) {
      updateDraft(draftKey, followup);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    setDraftSuggestion(followup);
  };

  const [streamText, setStreamText] = useState("");
  const [streamStatus, setStreamStatus] = useState("");
  const streamAbort = useRef<AbortController | null>(null);
  useEffect(() => () => streamAbort.current?.abort(), []);
  const handleSend = async () => {
    const prompt =
      currentDraft.trim() ||
      (wrongQuestionImage ? "请识别并分析我上传的错题，指出关联知识点、错误原因并引用课程资料。" : "");
    if (!prompt || sendingSessionId !== null) return;

    let sessionId = activeSessionId;
    if (sessionId === null) {
      const created = await createAndSelectSession();
      if (!created) return;
      sessionId = created.id;
    }

    const shouldFollow = nearBottomRef.current;
    const pendingId = `pending-${Date.now()}`;
    const pendingMessage: ChatMessage = {
      id: pendingId,
      role: "user",
      content: prompt,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setRequestError(null);
    setStreamText("");
    setStreamStatus("正在检索课程资料");
    streamAbort.current = new AbortController();
    setNewAnswerAvailable(false);
    setSendingSessionId(sessionId);
    setMessagesBySession((previous) => ({
      ...previous,
      [sessionId as number]: [...(previous[sessionId as number] ?? []), pendingMessage],
    }));
    window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: "end" }), 0);

    try {
      const answer = await streamChatMessage(
        sessionId,
        prompt,
        wrongQuestionImage
          ? {
              subject: wrongQuestionSubject,
              imageDataUrl: wrongQuestionImage.dataUrl,
            }
          : undefined,
        (event) => {
          if (event.type === "delta") setStreamText((previous) => previous + (event.text || ""));
          if (event.type === "reset") setStreamText("");
          if (event.message) setStreamStatus(event.message);
          if (nearBottomRef.current)
            window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: "end" }), 0);
        },
        streamAbort.current.signal,
      );
      updateDraft(String(sessionId), "");
      setWrongQuestionImage(null);
      setAttachmentError("");
      const restored = await refreshMessages(sessionId, undefined, true);
      if (!restored) {
        const assistantMessage: ChatMessage = {
          id: answer.messageId || `answer-${Date.now()}`,
          messageId: answer.messageId,
          role: "assistant",
          content: answer.answerMarkdown,
          answer,
          status: "completed",
          createdAt: new Date().toISOString(),
        };
        setMessagesBySession((previous) => ({
          ...previous,
          [sessionId as number]: (previous[sessionId as number] ?? [])
            .filter((message) => message.id !== pendingId)
            .concat({ ...pendingMessage, status: "completed" }, assistantMessage),
        }));
      }
      void refreshSessions();
      if (activeSessionIdRef.current === sessionId) {
        if (shouldFollow)
          window.setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: "end" }), 0);
        else setNewAnswerAvailable(true);
      }
    } catch (error) {
      setMessagesBySession((previous) => ({
        ...previous,
        [sessionId as number]: (previous[sessionId as number] ?? []).filter(
          (message) => message.id !== pendingId,
        ),
      }));
      setRequestError({ sessionId, message: localErrorMessage(error, "send") });
      if (error instanceof ApiRequestError && (error.status === 502 || error.status === 503)) {
        void refreshMessages(sessionId, undefined, true);
        void refreshSessions();
      }
    } finally {
      setSendingSessionId(null);
      setStreamText("");
      streamAbort.current = null;
    }
  };

  const waitMessage =
    elapsedSeconds < 8
      ? "正在理解问题并查找相关课程资料。"
      : elapsedSeconds < 20
        ? "正在组织回答和核验资料依据。"
        : "回答仍在生成，你可以先浏览当前对话。";

  const sessionListProps = {
    sessions,
    activeSessionId,
    loading: sessionsLoading,
    error: sessionsError,
    busy: isBusy,
    onCreate: () => {
      void createAndSelectSession();
    },
    onSelect: (sessionId: number) => {
      setActiveSessionId(sessionId);
      setDrawerOpen(false);
    },
    onRename: handleRename,
    onArchive: handleArchive,
    onRetry: () => {
      void refreshSessions();
    },
  };

  return (
    <div className="lm-chat-page">
      <aside className="lm-chat-sidebar" aria-label="学习会话列表">
        <ChatSessionList {...sessionListProps} />
      </aside>

      <div className="lm-chat-workspace" ref={workspaceRef}>
        <header className="lm-chat-workspace__header">
          <button
            ref={drawerTriggerRef}
            type="button"
            className="lm-chat-sessions-trigger"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
          >
            <Menu aria-hidden="true" />
            <span>学习会话</span>
          </button>
          <div>
            <h2>{activeSession?.title || "开始新的学习对话"}</h2>
            <p>回答会标明资料来源，重要结论请结合课程内容核验。</p>
          </div>
        </header>

        <div
          className="lm-chat-messages"
          ref={messagesViewportRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            nearBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
            if (nearBottomRef.current) setNewAnswerAvailable(false);
          }}
          aria-live="polite"
        >
          <div className="lm-chat-reading-column">
            {messagesLoading ? (
              <div className="lm-chat-loading-state" role="status">
                <LoaderCircle aria-hidden="true" />
                <p>正在恢复这段学习对话。</p>
              </div>
            ) : messagesError ? (
              <div className="lm-chat-error-state" role="alert">
                <AlertCircle aria-hidden="true" />
                <div>
                  <strong>对话恢复失败</strong>
                  <p>{messagesError}</p>
                </div>
                {activeSessionId !== null && (
                  <button type="button" onClick={() => void refreshMessages(activeSessionId)}>
                    重新加载
                  </button>
                )}
              </div>
            ) : activeMessages.length === 0 ? (
              <div className="lm-chat-empty-state">
                <MessageSquareText aria-hidden="true" />
                <h3>从一个课程问题开始</h3>
                <p>可以追问概念、代码思路或题目中的具体困惑。</p>
                <div>
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      type="button"
                      key={prompt}
                      onClick={() => {
                        updateDraft(draftKey, prompt);
                        window.setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="lm-chat-message-list">
                {activeMessages.map((message) => {
                  const answer = answerFromMessage(message);
                  return (
                    <li key={message.id} className={`lm-chat-message lm-chat-message--${message.role}`}>
                      {message.role === "user" ? (
                        <div className="lm-chat-user-message">
                          <span>我的问题</span>
                          <p>{message.content}</p>
                          {message.status === "pending" && <small>正在发送</small>}
                        </div>
                      ) : message.status === "failed" ? (
                        <div className="lm-chat-failed-message">
                          <AlertCircle aria-hidden="true" />
                          <p>
                            {message.errorCode === "AI_RESPONSE_QUALITY_FAILED"
                              ? "之前这次回答未通过校验，问题已保留，可以重新发送。"
                              : "之前这次回答生成中断，请确认模型服务可用后重新发送。"}
                          </p>
                        </div>
                      ) : answer ? (
                        <ChatAnswerView
                          answer={answer}
                          onChooseFollowup={handleChooseFollowup}
                          onNavigateToProfile={onNavigateToProfile || (() => undefined)}
                        />
                      ) : (
                        <MarkdownRenderer content={message.content} />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {sendingSessionId === activeSessionId && streamText && (
              <section className="lm-chat-message lm-chat-message--assistant" aria-label="正在生成的回答">
                <small>正在生成，引用尚待最终核验</small>
                <MarkdownRenderer content={streamText} />
              </section>
            )}
            {sendingSessionId === activeSessionId && (
              <div className="lm-chat-waiting" role="status">
                <LoaderCircle aria-hidden="true" />
                <div>
                  <strong>学习助手正在处理</strong>
                  <p>{streamStatus || waitMessage}</p>
                  <button type="button" onClick={() => streamAbort.current?.abort()}>
                    停止生成
                  </button>
                </div>
              </div>
            )}

            {requestError?.sessionId === activeSessionId && (
              <div className="lm-chat-error-state" role="alert">
                <AlertCircle aria-hidden="true" />
                <div>
                  <strong>本次回答未完成</strong>
                  <p>{requestError.message}</p>
                </div>
                <button type="button" onClick={() => textareaRef.current?.focus()}>
                  返回输入框
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {newAnswerAvailable && (
          <button
            type="button"
            className="lm-chat-new-answer"
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ block: "end" });
              setNewAnswerAvailable(false);
            }}
          >
            <ArrowDown aria-hidden="true" />
            查看新回答
          </button>
        )}

        <div className="lm-chat-composer-wrap">
          <div className="lm-chat-composer">
            {draftSuggestion && (
              <div className="lm-chat-draft-choice" role="status">
                <p>输入框已有内容，如何加入这条追问？</p>
                <button
                  type="button"
                  onClick={() => {
                    updateDraft(draftKey, `${currentDraft.trim()}\n${draftSuggestion}`);
                    setDraftSuggestion(null);
                  }}
                >
                  追加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDraft(draftKey, draftSuggestion);
                    setDraftSuggestion(null);
                  }}
                >
                  替换
                </button>
                <button type="button" onClick={() => setDraftSuggestion(null)}>
                  取消
                </button>
              </div>
            )}
            <label htmlFor="mentor-question">向学习助手提问</label>
            <input
              ref={imageInputRef}
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                  setAttachmentError("只支持 PNG、JPEG 或 WebP 图片。");
                  return;
                }
                if (file.size > 6 * 1024 * 1024) {
                  setAttachmentError("错题图片不能超过 6MB。");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") {
                    setWrongQuestionImage({ name: file.name, dataUrl: reader.result });
                    setAttachmentError("");
                  }
                };
                reader.onerror = () => setAttachmentError("图片读取失败，请重新选择。");
                reader.readAsDataURL(file);
              }}
            />
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="lm-button lm-dashboard-secondary-button"
                disabled={sendingSessionId !== null}
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus aria-hidden="true" />
                上传错题图片
              </button>
              {wrongQuestionImage && (
                <>
                  <select
                    aria-label="错题所属课程"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={wrongQuestionSubject}
                    onChange={(event) => setWrongQuestionSubject(event.target.value)}
                    disabled={sendingSessionId !== null}
                  >
                    {["数据结构", "操作系统", "计算机组成原理", "计算机网络", "C语言"].map((subject) => (
                      <option key={subject}>{subject}</option>
                    ))}
                  </select>
                  <span
                    className="max-w-[260px] truncate text-sm text-slate-600"
                    title={wrongQuestionImage.name}
                  >
                    {wrongQuestionImage.name}
                  </span>
                  <button
                    type="button"
                    className="lm-chat-icon-button"
                    aria-label="移除错题图片"
                    onClick={() => setWrongQuestionImage(null)}
                    disabled={sendingSessionId !== null}
                  >
                    <X aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            {attachmentError && (
              <p className="mb-2 text-sm text-rose-700" role="alert">
                {attachmentError}
              </p>
            )}
            <div className="lm-chat-composer__field">
              <textarea
                ref={textareaRef}
                id="mentor-question"
                value={currentDraft}
                maxLength={4000}
                disabled={sendingSessionId !== null}
                onChange={(event) => updateDraft(draftKey, event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="输入课程问题，说明你卡住的具体位置"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={(!currentDraft.trim() && !wrongQuestionImage) || sendingSessionId !== null}
              >
                {sendingSessionId !== null ? (
                  <LoaderCircle aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" />
                )}
                <span>发送</span>
              </button>
            </div>
            <div className="lm-chat-composer__meta" data-level="B" data-carrier="tab" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
              <span>
                <Sparkles aria-hidden="true" />
                草稿已保存
              </span>
              <span>{currentDraft.length} / 4000</span>
            </div>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div className="lm-chat-drawer-layer">
          <button
            type="button"
            className="lm-chat-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-label="关闭会话列表"
          />
          <aside
            ref={drawerRef}
            className="lm-chat-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="学习会话列表"
          >
            <ChatSessionList {...sessionListProps} onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
