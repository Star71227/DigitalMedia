/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  citationLabels?: string[];
  citationIdPrefix?: string;
}

type CopyState = { id: string; status: "success" | "error" } | null;
const CLIPBOARD_API_TIMEOUT_MS = 1200;

async function copyWithClipboardApi(text: string) {
  let timer: number | null = null;
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("clipboard timeout")), CLIPBOARD_API_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await copyWithClipboardApi(text);
      return;
    } catch {
      // Some browsers expose the API but deny it in embedded contexts.
    }
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy failed");
}

function withCitationLinks(markdown: string, labels: string[], citationIdPrefix: string) {
  if (!labels.length) return markdown;
  const labelSet = new Set(labels);
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part) =>
      part.startsWith("```")
        ? part
        : part.replace(/\[([A-Za-z]\d+)\]/g, (match, label: string) =>
            labelSet.has(label) ? `[${match}](#${citationIdPrefix}-${label})` : match,
          ),
    )
    .join("");
}

function CodeBlock({ language, code, blockId }: { language: string; code: string; blockId: string }) {
  const [copyState, setCopyState] = useState<CopyState>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await copyText(code);
      setCopyState({ id: blockId, status: "success" });
    } catch {
      setCopyState({ id: blockId, status: "error" });
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopyState(null), 2200);
  };

  const status = copyState?.id === blockId ? copyState.status : null;

  return (
    <div className="lm-markdown-code">
      <div className="lm-markdown-code__toolbar">
        <span>{language || "text"}</span>
        <button type="button" onClick={handleCopy} aria-label="复制代码">
          {status === "success" ? (
            <Check aria-hidden="true" />
          ) : status === "error" ? (
            <X aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          <span>{status === "success" ? "已复制" : status === "error" ? "复制失败" : "复制"}</span>
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function codeText(children: ReactNode) {
  return String(children ?? "").replace(/\n$/, "");
}

export default function MarkdownRenderer({
  content,
  citationLabels = [],
  citationIdPrefix = "citation",
}: MarkdownRendererProps) {
  const blockCounter = useRef(0);
  blockCounter.current = 0;

  const components: Components = {
    h1: ({ children }) => <h2>{children}</h2>,
    h2: ({ children }) => <h3>{children}</h3>,
    h3: ({ children }) => <h4>{children}</h4>,
    h4: ({ children }) => <h5>{children}</h5>,
    a: ({ href = "", children }) => {
      const external = /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
        >
          {children}
        </a>
      );
    },
    pre: ({ children }) => {
      const child = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
      const language = child?.props.className?.replace(/^language-/, "") || "text";
      const code = codeText(child?.props.children);
      const blockId = `answer-code-${blockCounter.current++}`;
      return <CodeBlock language={language} code={code} blockId={blockId} />;
    },
    code: ({ className, children }) => <code className={className}>{children}</code>,
  };

  if (!content) return null;

  return (
    <div className="lm-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) => {
          const rootRelative = url.startsWith("/") && !url.startsWith("//");
          if (url.startsWith("#") || rootRelative || /^mailto:/i.test(url) || /^https?:\/\//i.test(url)) {
            return defaultUrlTransform(url);
          }
          return "";
        }}
      >
        {withCitationLinks(content, citationLabels, citationIdPrefix)}
      </ReactMarkdown>
    </div>
  );
}
