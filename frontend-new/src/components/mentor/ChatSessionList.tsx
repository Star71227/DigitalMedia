/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Archive, Check, MessageSquareText, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatSession } from "../../types";

interface ChatSessionListProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onCreate: () => void;
  onSelect: (sessionId: number) => void;
  onRename: (sessionId: number, title: string) => Promise<void>;
  onArchive: (sessionId: number) => Promise<void>;
  onRetry: () => void;
  onClose?: () => void;
}

function formatSessionTime(value: string | null) {
  if (!value) return "尚未提问";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ChatSessionList(props: ChatSessionListProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [archiveId, setArchiveId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId !== null) renameRef.current?.focus();
  }, [renamingId]);

  const beginRename = (session: ChatSession) => {
    setArchiveId(null);
    setActionError(null);
    setRenamingId(session.id);
    setRenameValue(session.title);
  };

  const saveRename = async () => {
    if (renamingId === null) return;
    const title = renameValue.trim().replace(/\s+/g, " ");
    if (!title) {
      setActionError("会话名称不能为空。");
      return;
    }
    try {
      await props.onRename(renamingId, title);
      setRenamingId(null);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "重命名失败，请稍后再试。");
    }
  };

  const confirmArchive = async (sessionId: number) => {
    try {
      await props.onArchive(sessionId);
      setArchiveId(null);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "归档失败，请稍后再试。");
    }
  };

  return (
    <div className="lm-chat-sessions">
      <header className="lm-chat-sessions__header">
        <div>
          <strong>学习会话</strong>
          <span>{props.sessions.length} 个进行中</span>
        </div>
        {props.onClose && (
          <button
            type="button"
            className="lm-chat-icon-button"
            onClick={props.onClose}
            aria-label="关闭会话列表"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </header>

      <button type="button" className="lm-chat-new-session" onClick={props.onCreate} disabled={props.busy}>
        <Plus aria-hidden="true" />
        <span>新建学习会话</span>
      </button>

      {props.loading ? (
        <div className="lm-chat-session-skeleton" aria-label="正在加载学习会话" role="status">
          <span />
          <span />
          <span />
        </div>
      ) : props.error ? (
        <div className="lm-chat-session-state" role="alert">
          <p>{props.error}</p>
          <button type="button" onClick={props.onRetry}>
            <RotateCcw aria-hidden="true" />
            重新加载
          </button>
        </div>
      ) : props.sessions.length === 0 ? (
        <div className="lm-chat-session-state">
          <MessageSquareText aria-hidden="true" />
          <p>还没有学习会话。新建后可以跨刷新继续追问。</p>
        </div>
      ) : (
        <ul className="lm-chat-session-list">
          {props.sessions.map((session) => {
            const active = session.id === props.activeSessionId;
            const renaming = session.id === renamingId;
            const archiving = session.id === archiveId;
            return (
              <li key={session.id} className={active ? "is-active" : undefined}>
                {renaming ? (
                  <div className="lm-chat-session-edit">
                    <label htmlFor={`rename-session-${session.id}`}>会话名称</label>
                    <input
                      ref={renameRef}
                      id={`rename-session-${session.id}`}
                      value={renameValue}
                      maxLength={60}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key === "Enter") void saveRename();
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                    <button
                      type="button"
                      disabled={props.busy}
                      onClick={() => void saveRename()}
                      aria-label="保存会话名称"
                    >
                      <Check aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setRenamingId(null)} aria-label="取消重命名">
                      <X aria-hidden="true" />
                    </button>
                  </div>
                ) : archiving ? (
                  <div className="lm-chat-session-confirm">
                    <p>归档后将从当前列表移除。</p>
                    <button
                      type="button"
                      disabled={props.busy}
                      onClick={() => void confirmArchive(session.id)}
                    >
                      确认归档
                    </button>
                    <button type="button" onClick={() => setArchiveId(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="lm-chat-session-row">
                    <button
                      type="button"
                      className="lm-chat-session-select"
                      onClick={() => props.onSelect(session.id)}
                      aria-current={active ? "page" : undefined}
                      title={session.title}
                    >
                      <strong>{session.title}</strong>
                      <span>{formatSessionTime(session.lastMessageAt || session.updatedAt)}</span>
                    </button>
                    <div className="lm-chat-session-actions">
                      <button
                        type="button"
                        disabled={props.busy}
                        onClick={() => beginRename(session)}
                        aria-label={`重命名 ${session.title}`}
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={props.busy}
                        onClick={() => {
                          setRenamingId(null);
                          setArchiveId(session.id);
                        }}
                        aria-label={`归档 ${session.title}`}
                      >
                        <Archive aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {actionError && (
        <p className="lm-chat-session-error" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}
