/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import { BookOpen, Copy, Database, Mic, Paperclip, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { createChatSession, describeApiError, sendChatMessage } from "../api";
import type { ChatAnswer } from "../types";
import MarkdownRenderer from "../components/MarkdownRenderer";
import { BlueprintHeader, BlueprintMotif } from "./BlueprintDecorations";

interface Props {
  initialPrompt: string | null;
  onClearPrefill: () => void;
  onNavigateToProfile: () => void;
}

type ThreadMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; answer?: ChatAnswer };

export default function BlueprintMentorView({ initialPrompt, onClearPrefill, onNavigateToProfile }: Props) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好，我是你的学习助手。可以直接问课程问题，也可以让我整理本章讲义、思维导图或下一组练习。",
    },
  ]);
  const prefillHandled = useRef("");

  useEffect(() => {
    if (!initialPrompt || prefillHandled.current === initialPrompt) return;
    prefillHandled.current = initialPrompt;
    setInput(initialPrompt);
    onClearPrefill();
  }, [initialPrompt, onClearPrefill]);

  const ask = async () => {
    const question = input.trim();
    if (!question || sending) return;
    setInput("");
    setError("");
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", content: question }]);
    setSending(true);
    try {
      let nextSessionId = sessionId;
      if (!nextSessionId) {
        const session = await createChatSession(question.slice(0, 24));
        nextSessionId = session.id;
        setSessionId(session.id);
      }
      const answer = await sendChatMessage(nextSessionId, question);
      setMessages((current) => [
        ...current,
        {
          id: answer.messageId || `a-${Date.now()}`,
          role: "assistant",
          content: answer.answerMarkdown,
          answer,
        },
      ]);
    } catch (reason) {
      setError(describeApiError(reason, "学习助手暂时无法回答"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="bp-page bp-mentor-page">
      <BlueprintMotif variant="network" />
      <BlueprintHeader title="AI 学习助手" english="LEARNING COMPANION" />
      <div className="bp-mentor-title">
        <h2>AI 学习助手</h2>
        <p>提问、复习、整理资料，在同一个对话里完成。</p>
      </div>

      <div className="bp-mentor-layout">
        <div className="bp-chat-thread">
          {messages.map((message) => (
            <article key={message.id} className={`bp-chat-message is-${message.role}`}>
              <span className="bp-chat-avatar">{message.role === "user" ? "张" : "AI"}</span>
              <div>
                <header>
                  <strong data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">{message.role === "user" ? "STUDENT" : "LEARNMATE"}</strong>
                  <time data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">
                    {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  {message.role === "assistant" && (
                    <span className="bp-message-tools" data-level="B" data-carrier="rail" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
                      <Copy />
                      <ThumbsUp />
                      <ThumbsDown />
                    </span>
                  )}
                </header>
                {message.role === "assistant" ? (
                  <MarkdownRenderer content={message.content} />
                ) : (
                  <p>{message.content}</p>
                )}
                {message.role === "assistant" && message.answer?.citations?.length ? (
                  <footer>
                    {message.answer.citations.slice(0, 3).map((citation, index) => (
                      <span key={`${citation.sourceTitle}-${index}`}>
                        [{index + 1}] {citation.sourceTitle}
                      </span>
                    ))}
                  </footer>
                ) : null}
              </div>
            </article>
          ))}
          {sending && (
            <div className="bp-chat-thinking">
              <i />
              <i />
              <i />
              <span>正在整理回答</span>
            </div>
          )}
          {error && <div className="bp-inline-error">{error}</div>}
        </div>

        <aside className="bp-mentor-rail">
          <button className="is-active">
            <BookOpen />
            <span>会话</span>
          </button>
          <button onClick={() => setInput("请基于我的当前学习路径生成一份本章讲义，并给出思维导图。")}>
            <Database />
            <span>班级资料</span>
          </button>
          <button onClick={() => setInput("请列出回答中使用的知识点与来源。")}>
            <Copy />
            <span>引用记录</span>
          </button>
          <button onClick={onNavigateToProfile}>
            <span className="bp-rail-node">◇</span>
            <span>学习档案</span>
          </button>
        </aside>
      </div>

      <form
        className="bp-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <button type="button" aria-label="添加附件">
          <Paperclip />
        </button>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="继续提问，例如：根据我的薄弱点生成讲义和思维导图"
        />
        <button type="button" aria-label="语音输入">
          <Mic />
        </button>
        <button type="submit" className="bp-send-button" disabled={sending || !input.trim()}>
          <Send />
          发送
        </button>
      </form>
    </section>
  );
}
