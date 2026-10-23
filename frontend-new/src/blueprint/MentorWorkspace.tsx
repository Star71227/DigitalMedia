/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Database,
  FileText,
  MessageSquare,
  Mic,
  Network,
  Paperclip,
  Plus,
  Send,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  createChatSession,
  describeApiError,
  getChatSessionMessages,
  getLearningPath,
  getMyClasses,
  getStoredUser,
  listChatSessions,
  sendChatMessage,
  type MyClassSummary,
} from "../api";
import type { ChatAnswer, ChatSession } from "../types";
import MarkdownRenderer from "../components/MarkdownRenderer";
import ThemeToggle from "../components/ThemeToggle";
import LogoReveal from "../components/LogoReveal";
import { BlueprintMotif } from "./BlueprintDecorations";
import "./mentor-workspace.css";

interface Props {
  initialPrompt: string | null;
  onClearPrefill: () => void;
  onNavigateToProfile: () => void;
}
/** 题目图片上限：后端按 data URL 校验约 6MB，这里留出 base64 膨胀余量取 4MB */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  answer?: ChatAnswer;
};
type Speech = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
const welcome = (): Message => ({
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是你的学习助手。\n\n可以一起梳理课程知识、讲解错题，或把复杂的概念拆成容易理解的小步骤。今天想从哪里开始？",
  createdAt: new Date().toISOString(),
});
const shortcuts = [
  {
    label: "生成思维导图",
    icon: Network,
    prompt: "请围绕当前课程主题生成 Markdown 思维导图，展示知识点的层次与联系。",
  },
  { label: "梳理考点", icon: BookOpen, prompt: "请梳理当前课程主题的核心考点、易错点与复习顺序。" },
  {
    label: "出练习题",
    icon: FileText,
    prompt: "请围绕当前课程主题出 3 道由浅入深的练习题，先不要给出答案。",
  },
  { label: "错题讲解", icon: Sparkles, prompt: "请帮我分析这道错题，先确认我的解题思路，再解释错误原因：" },
];

export default function MentorWorkspace({ initialPrompt, onClearPrefill, onNavigateToProfile }: Props) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<Message[]>([welcome()]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [course, setCourse] = useState({ subject: "当前课程", topic: "自由提问" });
  const [classes, setClasses] = useState<MyClassSummary[]>([]);
  const [sideTab, setSideTab] = useState("会话");
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 700px)").matches);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enterSend, setEnterSend] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [copied, setCopied] = useState("");
  const [image, setImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [listening, setListening] = useState(false);
  const user = getStoredUser();
  const prefillHandled = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  const speechRef = useRef<Speech | null>(null);
  const imageVersion = useRef(0);

  useEffect(() => {
    let active = true;
    void listChatSessions()
      .then((r) => {
        if (active) setSessions(r.sessions);
      })
      .catch(() => {
        if (active) setNotice("历史会话暂时无法加载，可继续新对话。");
      });
    void getLearningPath()
      .then((path) => {
        const stage = path.stages.find((s) => s.status === "active") ?? path.stages[0];
        if (active && stage)
          setCourse({ subject: stage.subject, topic: stage.knowledgePoints[0] || stage.title });
      })
      .catch(() => {});
    void getMyClasses()
      .then((r) => {
        if (active) setClasses(r.data);
      })
      .catch(() => {});
    const started = Date.now();
    const timer = window.setInterval(() => setMinutes(Math.floor((Date.now() - started) / 60000)), 10000);
    return () => {
      active = false;
      requestVersion.current++;
      imageVersion.current++;
      clearInterval(timer);
      speechRef.current?.stop();
    };
  }, []);
  useEffect(() => {
    if (!initialPrompt || prefillHandled.current === initialPrompt) return;
    prefillHandled.current = initialPrompt;
    setInput(initialPrompt);
    onClearPrefill();
  }, [initialPrompt, onClearPrefill]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
  }, [input]);

  const ask = async () => {
    const question = input.trim();
    const attached = image;
    if (sending || loading) return;
    if (!question && !attached) return;
    speechRef.current?.stop();
    const bubbleText = question || "请识别并分析这张图片里的题目";
    setInput("");
    setImage(null);
    setError("");
    setSending(true);
    setMessages((current) => [
      ...current,
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: bubbleText + (attached ? `\n\n附件：${attached.name}` : ""),
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      let nextId = sessionId;
      if (!nextId) {
        const session = await createChatSession(bubbleText.slice(0, 24));
        nextId = session.id;
        setSessionId(nextId);
        setSessions((current) => [session, ...current]);
      }
      /* 只发图片不带文字：message 留空，后端按「错题识别与教材归因」处理并写入错题本；
         图片 + 自己的问题：把问题原样发过去，后端先识别图片再按要求作答（可以要代码）。 */
      const answer = await sendChatMessage(
        nextId,
        question,
        attached
          ? { subject: course.subject, questionText: question, imageDataUrl: attached.dataUrl }
          : undefined,
      );
      setMessages((current) => [
        ...current,
        {
          id: answer.messageId || `a-${Date.now()}`,
          role: "assistant",
          content: answer.answerMarkdown,
          answer,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (reason) {
      setError(describeApiError(reason, "学习助手暂时无法回答，请稍后重试。"));
      setInput(question);
      setImage(attached);
    } finally {
      setSending(false);
    }
  };
  const selectSession = async (id: number) => {
    if (sending || loading) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await getChatSessionMessages(id);
      if (requestVersion.current !== version) return;
      setSessionId(id);
      setImage(null);
      setMessages(
        result.messages.map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          createdAt: m.createdAt || "",
          answer: m.answer,
        })),
      );
    } catch (reason) {
      if (requestVersion.current === version) setError(describeApiError(reason, "会话加载失败"));
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  };
  const copy = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setNotice("已复制消息");
    } catch {
      setNotice("无法自动复制，请选中消息文字复制。");
    }
  };
  const attach = (file?: File | null) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setNotice(`请选择 ${MAX_IMAGE_BYTES / 1024 / 1024} MB 以内的 PNG、JPG 或 WebP 题目图片。`);
      return;
    }
    const version = ++imageVersion.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (version === imageVersion.current) {
        setImage({ name: file.name || "粘贴的截图.png", dataUrl: String(reader.result) });
        setNotice("图片已添加，发送时将用于错题讲解或按你的问题作答。");
        inputRef.current?.focus();
      }
    };
    reader.onerror = () => setNotice("图片读取失败，请重新选择。");
    reader.readAsDataURL(file);
  };
  /** 直接粘贴截图（Ctrl/⌘ + V）也能当附件用 */
  const attachFromPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(event.clipboardData?.items || []).find((entry) =>
      entry.type.startsWith("image/"),
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    event.preventDefault();
    attach(file);
  };
  const voice = () => {
    if (listening) {
      speechRef.current?.stop();
      return;
    }
    const browser = window as unknown as {
      SpeechRecognition?: new () => Speech;
      webkitSpeechRecognition?: new () => Speech;
    };
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice("当前浏览器不支持语音输入，请使用键盘输入。");
      return;
    }
    const recognition = new Recognition();
    speechRef.current = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) =>
      setInput((current) => (current + " " + event.results[0][0].transcript).trim().slice(0, 4000));
    recognition.onerror = () => {
      setListening(false);
      setNotice("语音识别未完成，请检查麦克风权限或使用键盘输入。");
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setNotice("无法启动语音输入，请使用键盘输入。");
    }
  };
  const citations = messages.flatMap((m) => m.answer?.citations || []);
  const railItems = [
    { name: "会话", icon: MessageSquare },
    { name: "班级资料", icon: Database },
    { name: "引用记录", icon: Copy },
    { name: "学习档案", icon: UserRound },
  ];

  return (
    <section className="bp-page bp-mentor-page mentor-workspace">
      <BlueprintMotif variant="network" />
      <header className="mw-header">
        <div className="mw-brand">
          <LogoReveal size={34} static bare />
          <div>
            <h1>AI 学习助手</h1>
            <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">LEARNING COMPANION</span>
          </div>
        </div>
        <div className="mw-course">
          <BookOpen size={16} />
          <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">
            {course.subject}
            <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">{course.topic}</strong>
          </span>
        </div>
        <div className="mw-header-actions">
          <span className="mw-duration" title="本次助手页面停留时长" data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">
            <Clock3 size={14} />
            {minutes} 分钟
          </span>
          <ThemeToggle />
          <button
            type="button"
            aria-label="对话设置"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <Settings size={18} />
          </button>
          <button type="button" className="mw-user" aria-label="打开学习档案" onClick={onNavigateToProfile}>
            {user?.displayName?.slice(0, 1) || "我"}
          </button>
        </div>
        {settingsOpen && (
          <div className="mw-settings">
            <strong>对话设置</strong>
            <label>
              <input type="checkbox" checked={enterSend} onChange={(e) => setEnterSend(e.target.checked)} />
              Enter 发送，Shift + Enter 换行
            </label>
            <button type="button" onClick={onNavigateToProfile}>
              查看学习档案与偏好 <ChevronRight size={14} />
            </button>
          </div>
        )}
      </header>
      <div className={`mw-layout${collapsed ? " is-collapsed" : ""}`}>
        <div className="mw-conversation">
          <nav className="mw-shortcuts" aria-label="快捷学习指令">
            {shortcuts.map(({ label, icon: Icon, prompt }) => (
              <button
                key={label}
                type="button"
                disabled={sending || loading}
                onClick={() => {
                  setInput(`${prompt}\n课程主题：${course.subject} · ${course.topic}`);
                  inputRef.current?.focus();
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
          <div className="mw-thread" aria-label="对话消息" aria-busy={sending || loading}>
            <div className="mw-thread-intro" data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
              <span className="mw-online" /> 学习助手 · 一起把知识学明白
            </div>
            {loading ? (
              <p className="mw-muted" role="status">
                正在恢复会话…
              </p>
            ) : (
              messages.map((message) => (
                <article key={message.id} className={`mw-message is-${message.role}`}>
                  <span className="mw-avatar" aria-hidden="true">
                    {message.role === "assistant" ? (
                      <Sparkles size={17} />
                    ) : (
                      user?.displayName?.slice(0, 1) || "我"
                    )}
                  </span>
                  <div className="mw-message-body">
                    <header>
                      <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">{message.role === "assistant" ? "寻笺" : "我"}</strong>
                      <time dateTime={message.createdAt} data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">
                        {message.createdAt
                          ? new Date(message.createdAt).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </time>
                    </header>
                    <div className="mw-bubble">
                      {message.role === "assistant" ? (
                        <MarkdownRenderer content={message.content} />
                      ) : (
                        <p>{message.content}</p>
                      )}
                      {message.answer?.citations?.length ? (
                        <footer>
                          {message.answer.citations.slice(0, 3).map((citation, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setSideTab("引用记录");
                                setCollapsed(false);
                              }} data-level="B" data-carrier="tab" data-enter="attach" data-family="F13" data-mg-behavior="reveal"
                            >
                              <BookOpen size={12} />[{i + 1}] {citation.sourceTitle}
                            </button>
                          ))}
                        </footer>
                      ) : null}
                    </div>
                    <div className="mw-message-tools">
                      <button
                        type="button"
                        aria-label={`复制${message.role === "assistant" ? "助手" : "我的"}消息`}
                        onClick={() => void copy(message)}
                      >
                        {copied === message.id ? <Check size={14} /> : <Copy size={14} />}复制
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
            {sending && (
              <div className="mw-thinking" role="status">
                <span className="mw-avatar">
                  <Sparkles size={17} />
                </span>
                <div>
                  <i />
                  <i />
                  <i />
                  <span>正在整理回答</span>
                </div>
              </div>
            )}
            {error && (
              <p className="mw-error" role="alert">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>
          <div className="mw-input-area">
            {image && (
              <div className="mw-attachment">
                <img src={image.dataUrl} alt="待发送错题附件" />
                <span>{image.name}</span>
                <button
                  type="button"
                  aria-label="移除附件"
                  onClick={() => {
                    imageVersion.current++;
                    setImage(null);
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <form
              className="mw-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  attach(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="添加错题图片附件"
                disabled={sending || loading}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip size={20} />
              </button>
              <textarea
                ref={inputRef}
                aria-label="向学习助手提问"
                value={input}
                maxLength={4000}
                rows={2}
                disabled={loading || sending}
                onChange={(e) => setInput(e.target.value)}
                onPaste={attachFromPaste}
                placeholder="把你的问题写下来（也可以直接粘贴题目截图），我们一起理清思路…"
                onKeyDown={(e) => {
                  if (enterSend && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void ask();
                  }
                }}
              />
              <button
                type="button"
                className={listening ? "is-listening" : ""}
                aria-label={listening ? "停止语音输入" : "语音输入"}
                aria-pressed={listening}
                disabled={sending || loading}
                onClick={voice}
              >
                <Mic size={20} />
              </button>
              <button
                type="submit"
                className="mw-send"
                disabled={sending || loading || (!input.trim() && !image)}
              >
                <Send size={17} />
                <span>{image && !input.trim() ? "识图讲解" : "发送"}</span>
              </button>
            </form>
            <div className="mw-input-hint" data-level="B" data-carrier="tab" data-enter="attach" data-family="F12" data-mg-behavior="reveal">
              <span role="status">{notice || "AI 回答供学习参考，重要结论请结合课程资料核实。"}</span>
              <span>
                {enterSend ? "Shift + Enter 换行" : "支持多行提问"} · {input.length}/4000
              </span>
            </div>
          </div>
        </div>
        <aside className="mw-side" aria-label="助手功能侧栏">
          <div className="mw-side-heading">
            {!collapsed && <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">学习空间</span>}
            <button
              type="button"
              aria-label={collapsed ? "展开功能侧栏" : "收起功能侧栏"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
          </div>
          <nav aria-label="助手功能">
            {railItems.map(({ name, icon: Icon }) => (
              <button
                key={name}
                type="button"
                className={sideTab === name ? "is-active" : ""}
                aria-current={sideTab === name ? "page" : undefined}
                title={name}
                onClick={() => {
                  if (name === "学习档案") {
                    onNavigateToProfile();
                    return;
                  }
                  setSideTab(name);
                  setCollapsed(false);
                }}
              >
                <Icon size={18} />
                {!collapsed && <span>{name}</span>}
              </button>
            ))}
          </nav>
          {!collapsed && (
            <div className="mw-side-content">
              {sideTab === "会话" && (
                <>
                  <button
                    type="button"
                    className="mw-new-chat"
                    disabled={sending || loading}
                    onClick={() => {
                      setSessionId(null);
                      setMessages([welcome()]);
                      setError("");
                      setImage(null);
                      inputRef.current?.focus();
                    }}
                  >
                    <Plus size={15} />
                    新建会话
                  </button>
                  <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">最近会话</small>
                  {sessions.length ? (
                    sessions.slice(0, 12).map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className={`mw-session${sessionId === session.id ? " is-current" : ""}`}
                        disabled={sending || loading}
                        onClick={() => void selectSession(session.id)}
                      >
                        <MessageSquare size={14} />
                        <span>{session.title || "学习对话"}</span>
                      </button>
                    ))
                  ) : (
                    <p className="mw-muted">你的学习对话会保存在这里。</p>
                  )}
                </>
              )}
              {sideTab === "班级资料" && (
                <>
                  <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">已加入班级</small>
                  {classes.length ? (
                    classes.map((item) => (
                      <div className="mw-material" key={item.classId}>
                        <BookOpen size={18} />
                        <strong>{item.className}</strong>
                        <p>
                          {item.subject} · {item.teacherName}
                        </p>
                        {item.description && <p>{item.description}</p>}
                        <button
                          type="button"
                          onClick={() => {
                            setInput(
                              `请结合 ${item.subject} 的课程知识帮我梳理「${course.topic}」，有来源时请注明引用。`,
                            );
                            inputRef.current?.focus();
                          }}
                        >
                          结合课程提问 <ChevronRight size={13} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="mw-muted">尚未加入班级，加入后可查看课程信息。</p>
                  )}
                </>
              )}
              {sideTab === "引用记录" && (
                <>
                  <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">本会话使用的来源</small>
                  {citations.length ? (
                    citations.map((citation, i) => (
                      <div className="mw-citation" key={`${citation.sourceTitle}-${i}`}>
                        <strong data-level="B" data-carrier="tab" data-enter="attach" data-family="F13" data-mg-behavior="reveal">
                          [{i + 1}] {citation.sourceTitle}
                        </strong>
                        {citation.chapter && <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">{citation.chapter}</small>}
                        <p>{citation.excerpt}</p>
                      </div>
                    ))
                  ) : (
                    <p className="mw-muted">有资料引用的回答会在这里展示来源与原文摘要。</p>
                  )}
                </>
              )}
            </div>
          )}
          {!collapsed && (
            <div className="mw-side-foot">
              <Sparkles size={16} />
              <span>循序渐进，学有所获</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
