/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, describeApiError, downloadPresentation, type LearningResource } from "../../api";
import "./presentation-editor.css";

interface Element {
  id: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  bold: boolean;
}
interface Page {
  id: string;
  background: string;
  notes: string;
  elements: Element[];
}
interface Deck {
  title: string;
  width: number;
  height: number;
  slides: Page[];
}
const id = () => crypto.randomUUID();
const themes = [
  { name: "学术蓝", background: "#f6f8ff", ink: "#172c57" },
  { name: "科技夜色", background: "#101b30", ink: "#c6deff" },
  { name: "纸页白", background: "#fffdf7", ink: "#34312c" },
];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const lines = (v: unknown): string =>
  typeof v === "string"
    ? v
    : Array.isArray(v)
      ? v.map(lines).filter(Boolean).join("\n")
      : v && typeof v === "object"
        ? Object.entries(v)
            .filter(([k]) =>
              [
                "title",
                "description",
                "explanation",
                "items",
                "label",
                "mistake",
                "correction",
                "url",
                "answer",
                "steps",
                "prompt",
                "sourceTitle",
              ].includes(k),
            )
            .map(([, x]) => lines(x))
            .filter(Boolean)
            .join("：")
        : "";
function page(title: string, body = "", background = themes[0].background, ink = themes[0].ink): Page {
  return {
    id: id(),
    background,
    notes: "",
    elements: [
      {
        id: id(),
        text: title,
        left: 60,
        top: 45,
        width: 880,
        height: 100,
        fontSize: 36,
        color: ink,
        bold: true,
      },
      {
        id: id(),
        text: body,
        left: 60,
        top: 160,
        width: 880,
        height: 350,
        fontSize: 23,
        color: ink,
        bold: false,
      },
    ],
  };
}
function fromResource(resource: LearningResource): Deck {
  const content = resource.content as { slides?: Record<string, unknown>[] };
  const slides = (content.slides || [])
    .flatMap((slide) => {
      const body = [
        "subtitle",
        "body",
        "bullets",
        "steps",
        "left",
        "right",
        "items",
        "code",
        "explanation",
        "nextSteps",
        "references",
      ]
        .map((k) => lines(slide[k]))
        .filter(Boolean)
        .join("\n\n");
      const chunks = body.match(/[\s\S]{1,450}/g) || [""];
      return chunks.map((chunk, i) => ({
        ...page(String(slide.title || resource.knowledgePoint) + (i ? " · 续" : ""), chunk),
        notes: String(slide.speakerNotes || ""),
      }));
    })
    .slice(0, 60);
  return {
    title: resource.title,
    width: 1000,
    height: 562.5,
    slides: slides.length ? slides : [page(resource.title, resource.learningObjectives.join("\n"))],
  };
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const html = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function PresentationEditor({ resource }: { resource: LearningResource }) {
  const key = `learnmate-presentation-${resource.id}-v${resource.version}`;
  const [deck, setDeck] = useState<Deck>(() => fromResource(resource));
  const [index, setIndex] = useState(0);
  const [elementId, setElementId] = useState("");
  const [history, setHistory] = useState<Deck[]>([]);
  const [future, setFuture] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [present, setPresent] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; el: Element; deck: Deck; scale: number } | null>(null);
  const current = deck.slides[Math.min(index, deck.slides.length - 1)];
  const latestDeck = useRef(deck);
  latestDeck.current = deck;
  const selected = current.elements.find((el) => el.id === elementId);
  useEffect(() => {
    setIndex((i) => Math.min(i, deck.slides.length - 1));
  }, [deck.slides.length]);
  useEffect(() => {
    let cancelled = false;
    let local: Deck | null = null;
    try {
      local = JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      /* browser storage may be unavailable */
    }
    apiRequest<{ document: Deck | null }>(`/api/resources/${resource.id}/presentation`)
      .then((r) => {
        if (cancelled) return;
        setDeck(local || r.document || fromResource(resource));
        setDirty(Boolean(local));
        if (local) setMessage("已恢复本机未保存草稿");
      })
      .catch((e) => {
        if (!cancelled) {
          if (local) setDeck(local);
          setMessage(describeApiError(e, "草稿暂时无法读取"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, resource.id]);
  useEffect(() => {
    if (dirty && !loading)
      try {
        localStorage.setItem(key, JSON.stringify(deck));
      } catch {
        setMessage("本机缓存不可用，请点击保存草稿");
      }
  }, [deck, dirty, key, loading]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (!present) return;
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresent(false);
      if (["ArrowRight", "PageDown"].includes(e.key))
        setIndex((i) => Math.min(deck.slides.length - 1, i + 1));
      if (["ArrowLeft", "PageUp"].includes(e.key)) setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [present, deck.slides.length]);
  function commit(next: Deck) {
    setHistory((h) => [...h.slice(-29), deck]);
    setFuture([]);
    setDeck(next);
    setDirty(true);
    setMessage("修改已暂存本机，点击保存可同步");
  }
  function editElement(changes: Partial<Element>) {
    if (!selected) return;
    commit({
      ...deck,
      slides: deck.slides.map((p, i) =>
        i === index
          ? { ...p, elements: p.elements.map((el) => (el.id === selected.id ? { ...el, ...changes } : el)) }
          : p,
      ),
    });
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((f) => [deck, ...f]);
    setDeck(previous);
    setHistory((h) => h.slice(0, -1));
    setDirty(true);
  }
  function redo() {
    if (!future[0]) return;
    setHistory((h) => [...h, deck]);
    setDeck(future[0]);
    setFuture((f) => f.slice(1));
    setDirty(true);
  }
  async function save() {
    const savingDeck = deck;
    setBusy(true);
    try {
      await apiRequest(`/api/resources/${resource.id}/presentation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deck),
      });
      if (latestDeck.current === savingDeck) {
        setDirty(false);
        try {
          localStorage.removeItem(key);
        } catch {}
        setMessage("草稿已保存");
      } else setMessage("上一版本已保存，最新改动仍保留在本机");
    } catch (e) {
      setMessage(describeApiError(e, "保存失败，本机草稿仍保留"));
    } finally {
      setBusy(false);
    }
  }
  async function exportPptx() {
    setBusy(true);
    try {
      await downloadPresentation(resource.id, deck);
      setMessage("已导出当前编辑版本");
    } catch (e) {
      setMessage(describeApiError(e, "课件导出失败"));
    } finally {
      setBusy(false);
    }
  }
  function exportJson() {
    const json = {
      title: deck.title,
      width: 1000,
      height: 562.5,
      theme: {
        themeColors: ["#1849c6", "#0fa47f"],
        fontColor: "#172c57",
        fontName: "Microsoft YaHei",
        backgroundColor: "#f6f8ff",
      },
      slides: deck.slides.map((p) => ({
        id: p.id,
        background: { type: "solid", color: p.background },
        remark: p.notes,
        elements: p.elements.map((el) => ({
          type: "text",
          id: el.id,
          left: el.left,
          top: el.top,
          width: el.width,
          height: el.height,
          rotate: 0,
          defaultFontName: "Microsoft YaHei",
          defaultColor: el.color,
          fixedHeight: true,
          lineHeight: 1.35,
          content: el.text
            .split("\n")
            .map(
              (line) =>
                `<p><span style="font-size:${el.fontSize}px;color:${el.color};">${el.bold ? "<strong>" : ""}${html(line)}${el.bold ? "</strong>" : ""}</span></p>`,
            )
            .join(""),
        })),
      })),
    };
    download(
      new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
      `${deck.title}-PPTist.json`,
    );
  }
  function movePage(delta: number) {
    const target = index + delta;
    if (target < 0 || target >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    commit({ ...deck, slides });
    setIndex(target);
  }
  if (loading)
    return (
      <p className="pe-loading" role="status">
        正在展开课件编辑器…
      </p>
    );
  const editor = (
    <section className={`pe-editor${present ? " is-presenting" : ""}`} aria-label="个性化 PPT 编辑器">
      <header className="pe-toolbar">
        <label>
          课件标题
          <input
            aria-label="课件标题"
            maxLength={200}
            value={deck.title}
            onChange={(e) => commit({ ...deck, title: e.target.value })}
          />
        </label>
        <div>
          <button onClick={undo} disabled={!history.length}>
            撤销
          </button>
          <button onClick={redo} disabled={!future.length}>
            重做
          </button>
          <button onClick={save} disabled={busy}>
            保存草稿{dirty ? " ·" : ""}
          </button>
          <button onClick={() => setPresent(!present)}>{present ? "结束放映" : "放映"}</button>
          <button onClick={exportJson}>导出 JSON</button>
          <button className="is-primary" onClick={exportPptx} disabled={busy}>
            {busy ? "处理中…" : "下载 PPTX"}
          </button>
        </div>
      </header>
      <div className="pe-workspace">
        <aside className="pe-pages" aria-label="幻灯片列表">
          {deck.slides.map((p, i) => (
            <button
              key={p.id}
              aria-label={`选择第 ${i + 1} 页`}
              aria-pressed={i === index}
              className={i === index ? "is-active" : ""}
              onClick={() => {
                setIndex(i);
                setElementId("");
              }}
            >
              <small>{String(i + 1).padStart(2, "0")}</small>
              <span style={{ background: p.background, color: p.elements[0]?.color }}>
                {p.elements[0]?.text || "空白页"}
              </span>
            </button>
          ))}
          <button
            disabled={deck.slides.length >= 60}
            onClick={() => {
              commit({
                ...deck,
                slides: [
                  ...deck.slides,
                  page("新的知识页", "输入本页内容", current.background, current.elements[0]?.color),
                ],
              });
              setIndex(deck.slides.length);
            }}
          >
            ＋ 添加页面
          </button>
          <div className="pe-page-actions">
            <button disabled={index === 0} onClick={() => movePage(-1)}>
              上移
            </button>
            <button disabled={index === deck.slides.length - 1} onClick={() => movePage(1)}>
              下移
            </button>
            <button
              disabled={deck.slides.length === 1}
              onClick={() => {
                commit({ ...deck, slides: deck.slides.filter((_, i) => i !== index) });
                setIndex(Math.max(0, index - 1));
                setElementId("");
              }}
            >
              删除页
            </button>
          </div>
        </aside>
        <main className="pe-stage">
          <div
            className="pe-canvas"
            ref={canvas}
            style={{ background: current.background }}
            aria-label={`第 ${index + 1} 页画布`}
          >
            {current.elements.map((el) => (
              <button
                key={el.id}
                type="button"
                aria-label={`选择文本：${el.text.slice(0, 30)}`}
                className={`pe-text${elementId === el.id ? " is-selected" : ""}`}
                style={{
                  left: `${el.left / 10}%`,
                  top: `${el.top / 5.625}%`,
                  width: `${el.width / 10}%`,
                  height: `${el.height / 5.625}%`,
                  color: el.color,
                  fontWeight: el.bold ? 700 : 400,
                  fontSize: `${el.fontSize / 10}cqw`,
                }}
                onPointerDown={(e) => {
                  if (present) return;
                  setElementId(el.id);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = {
                    x: e.clientX,
                    y: e.clientY,
                    el,
                    deck,
                    scale: (canvas.current?.getBoundingClientRect().width || 1000) / 1000,
                  };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  const left = clamp(d.el.left + (e.clientX - d.x) / d.scale, 0, 1000 - el.width);
                  const top = clamp(d.el.top + (e.clientY - d.y) / d.scale, 0, 562.5 - el.height);
                  setDeck({
                    ...d.deck,
                    slides: d.deck.slides.map((p, i) =>
                      i === index
                        ? {
                            ...p,
                            elements: p.elements.map((x) => (x.id === el.id ? { ...x, left, top } : x)),
                          }
                        : p,
                    ),
                  });
                }}
                onPointerUp={() => {
                  if (drag.current) {
                    const previous = drag.current.deck;
                    setHistory((h) => [...h.slice(-29), previous]);
                    setFuture([]);
                    setDirty(true);
                    drag.current = null;
                  }
                }}
                onPointerCancel={() => {
                  if (drag.current) {
                    setDeck(drag.current.deck);
                    drag.current = null;
                  }
                }}
                onClick={() => setElementId(el.id)}
              >
                {el.text}
              </button>
            ))}
          </div>
          <footer>
            <button disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              上一页
            </button>
            <span>
              {index + 1} / {deck.slides.length} · 16:9
            </span>
            <button disabled={index === deck.slides.length - 1} onClick={() => setIndex((i) => i + 1)}>
              下一页
            </button>
          </footer>
          <p className="pe-status" role="status">
            {message || "选择文字后编辑，拖动文字框可调整位置。"}
          </p>
        </main>
        <aside className="pe-properties">
          <h3>页面设计</h3>
          <div className="pe-themes">
            {themes.map((t) => (
              <button
                key={t.name}
                onClick={() =>
                  commit({
                    ...deck,
                    slides: deck.slides.map((p, i) =>
                      i === index
                        ? {
                            ...p,
                            background: t.background,
                            elements: p.elements.map((el) => ({ ...el, color: t.ink })),
                          }
                        : p,
                    ),
                  })
                }
              >
                {t.name}
              </button>
            ))}
          </div>
          <label>
            背景色
            <input
              aria-label="页面背景色"
              type="color"
              value={current.background}
              onChange={(e) =>
                commit({
                  ...deck,
                  slides: deck.slides.map((p, i) => (i === index ? { ...p, background: e.target.value } : p)),
                })
              }
            />
          </label>
          <button
            disabled={current.elements.length >= 20}
            onClick={() => {
              const el = { ...page("").elements[1], id: id(), text: "新的文本", width: 500, height: 140 };
              commit({
                ...deck,
                slides: deck.slides.map((p, i) =>
                  i === index ? { ...p, elements: [...p.elements, el] } : p,
                ),
              });
              setElementId(el.id);
            }}
          >
            ＋ 添加文本
          </button>
          {selected ? (
            <>
              <label>
                文字内容
                <textarea
                  aria-label="幻灯片文字内容"
                  maxLength={10000}
                  value={selected.text}
                  onChange={(e) => editElement({ text: e.target.value })}
                />
              </label>
              <label>
                字号
                <input
                  aria-label="文字字号"
                  type="number"
                  min={12}
                  max={72}
                  value={selected.fontSize}
                  onChange={(e) => editElement({ fontSize: clamp(Number(e.target.value), 12, 72) })}
                />
              </label>
              <label>
                文字颜色
                <input
                  aria-label="文字颜色"
                  type="color"
                  value={selected.color}
                  onChange={(e) => editElement({ color: e.target.value })}
                />
              </label>
              <button aria-pressed={selected.bold} onClick={() => editElement({ bold: !selected.bold })}>
                加粗
              </button>
              <div className="pe-dimensions">
                {(["left", "top", "width", "height"] as const).map((field, i) => (
                  <label key={field}>
                    {["横坐标", "纵坐标", "宽度", "高度"][i]}
                    <input
                      type="number"
                      aria-label={["横坐标", "纵坐标", "文本框宽度", "文本框高度"][i]}
                      value={Math.round(selected[field])}
                      min={i < 2 ? 0 : 20}
                      onChange={(e) => {
                        const max =
                          field === "left"
                            ? 1000 - selected.width
                            : field === "top"
                              ? 562.5 - selected.height
                              : field === "width"
                                ? 1000 - selected.left
                                : 562.5 - selected.top;
                        editElement({ [field]: clamp(Number(e.target.value), i < 2 ? 0 : 20, max) });
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  commit({
                    ...deck,
                    slides: deck.slides.map((p, i) =>
                      i === index ? { ...p, elements: p.elements.filter((el) => el.id !== selected.id) } : p,
                    ),
                  });
                  setElementId("");
                }}
              >
                删除文本
              </button>
            </>
          ) : (
            <p>在画布中选择文字，可调整内容、字号与位置。</p>
          )}
          <label>
            讲解备注
            <textarea
              aria-label="讲解备注"
              maxLength={5000}
              value={current.notes}
              onChange={(e) =>
                commit({
                  ...deck,
                  slides: deck.slides.map((p, i) => (i === index ? { ...p, notes: e.target.value } : p)),
                })
              }
            />
          </label>
        </aside>
      </div>
    </section>
  );
  return present ? createPortal(editor, document.body) : editor;
}
