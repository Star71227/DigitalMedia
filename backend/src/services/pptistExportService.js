/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { pool } = require("../config/db");

/**
 * 把 LearnMate 生成的课件内容转换成 PPTist 本地编辑器可导入的 JSON。
 *
 * 分工：内容仍然由 LearnMate 的模型生成（PPTist 网页上的一键 AI 生成没有后端，本地 /api 返回 503），
 * PPTist 只负责"可编辑 + 导出 PPTX"。所以这里是一段纯转换，不调用任何模型。
 *
 * 目标格式来自 PPTist 安装源码：src/hooks/useImport.ts 的 importJSON 读取
 * { title, slides, theme, width, height }；元素类型见 src/types/slides.ts，
 * 画布坐标按逻辑画布 1000×562.5 计算，富文本只使用受支持的 p/span/strong/em/ul/li。
 */
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 562.5;
const MARGIN = 64;
const TITLE_TOP = 52;
const CONTENT_TOP = 138;
const CONTENT_WIDTH = CANVAS_WIDTH - MARGIN * 2;

const THEME = {
  backgroundColor: "#FFFFFF",
  themeColors: ["#086FE7", "#4A90E2", "#1F3A8A"],
  fontColor: "#0F172A",
  fontName: "微软雅黑",
  outline: { width: 1, color: "#086FE7", style: "solid" },
  shadow: { h: 0, v: 0, blur: 0, color: "transparent" },
};

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textElement(id, options) {
  const {
    left = MARGIN,
    top = CONTENT_TOP,
    width = CONTENT_WIDTH,
    height = 80,
    html,
    fontSize = 18,
    bold = false,
    align = "left",
    color = THEME.fontColor,
    fontName = THEME.fontName,
    lineHeight = 1.5,
  } = options;
  return {
    id,
    type: "text",
    left,
    top,
    width,
    height,
    rotate: 0,
    content: html,
    defaultFontName: fontName,
    defaultColor: color,
    lineHeight,
    wordSpace: 0,
    paragraphSpace: bold ? 6 : 4,
    vertical: false,
    textType: align === "center" ? "title" : "content",
    ...(align === "center" ? { align: "center" } : {}),
  };
}

function fontSizeSpan(text, size, extra = "") {
  return `<span style="font-size:${size}px;${extra}">${escapeHtml(text)}</span>`;
}

function paragraphHtml(text, size, extra = "") {
  return `<p style="text-align:left;">${fontSizeSpan(text, size, extra)}</p>`;
}

function listHtml(items, size) {
  const rows = items
    .map((item) => String(item === undefined || item === null ? "" : item).trim())
    .filter(Boolean)
    .map((item) => `<li><span style="font-size:${size}px;">${escapeHtml(item)}</span></li>`);
  return rows.length ? `<ul>${rows.join("")}</ul>` : "";
}

function codeHtml(code) {
  const lines = String(code || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .slice(0, 22);
  return lines.map((line) => `<p style="text-align:left;">${escapeHtml(line) || "&nbsp;"}</p>`).join("");
}

function linesToHtml(lines, size) {
  return lines
    .filter((line) => String(line || "").trim())
    .map((line) =>
      Array.isArray(line) ? paragraphHtml(`${line[0]}：${line[1]}`, size) : paragraphHtml(line, size),
    )
    .join("");
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

/** 把一张课件页转换成 PPTist 元素数组 */
function buildSlideElements(slide, index, deckTitle) {
  const type = str(slide.slideType || slide.type || "concept").toLowerCase();
  const title = str(slide.title) || deckTitle;
  const elements = [];
  const prefix = `s${String(index + 1).padStart(2, "0")}`;

  if (type === "cover" || type === "title") {
    elements.push(
      textElement(`${prefix}-title`, {
        top: 208,
        width: CONTENT_WIDTH,
        height: 110,
        html: paragraphHtml(title, 44, "font-weight:700;"),
        fontSize: 44,
        bold: true,
        align: "center",
      }),
    );
    const subtitle = str(slide.subtitle) || str(slide.body);
    if (subtitle) {
      elements.push(
        textElement(`${prefix}-subtitle`, {
          top: 322,
          width: CONTENT_WIDTH,
          height: 40,
          html: paragraphHtml(subtitle, 20),
          fontSize: 20,
          align: "center",
          color: "#475569",
        }),
      );
    }
    return elements;
  }

  elements.push(
    textElement(`${prefix}-title`, {
      top: TITLE_TOP,
      height: 62,
      html: paragraphHtml(title, 30, "font-weight:700;"),
      fontSize: 30,
      bold: true,
      color: "#0B2A6B",
    }),
  );

  const subtitle = str(slide.subtitle);
  if (subtitle) {
    elements.push(
      textElement(`${prefix}-subtitle`, {
        top: 112,
        height: 30,
        html: paragraphHtml(subtitle, 16),
        fontSize: 16,
        color: "#64748B",
      }),
    );
  }

  const body = str(slide.body);
  if (body) {
    elements.push(
      textElement(`${prefix}-body`, {
        top: subtitle ? 150 : CONTENT_TOP,
        height: 70,
        html: paragraphHtml(body, 18),
        fontSize: 18,
      }),
    );
  }

  const bullets = arrayOf(slide.bullets).map(str).filter(Boolean);
  if (bullets.length) {
    elements.push(
      textElement(`${prefix}-bullets`, {
        top: body ? 226 : CONTENT_TOP,
        height: Math.min(300, 34 * bullets.length + 20),
        html: listHtml(bullets, 18),
        fontSize: 18,
      }),
    );
  }

  const steps = arrayOf(slide.steps);
  if (steps.length) {
    const lines = steps.map((step, order) => {
      if (typeof step === "string") return `${order + 1}. ${step}`;
      const stepTitle = str(step && step.title);
      const stepDesc = str(step && step.description);
      return `${order + 1}. ${[stepTitle, stepDesc].filter(Boolean).join("：")}`;
    });
    elements.push(
      textElement(`${prefix}-steps`, {
        top: body || bullets.length ? 300 : CONTENT_TOP,
        height: Math.min(240, 34 * lines.length + 20),
        html: listHtml(lines, 17),
        fontSize: 17,
      }),
    );
  }

  const items = arrayOf(slide.items);
  if (items.length) {
    const lines = items.map((item) => {
      if (typeof item === "string") return item;
      const itemTitle = str(item && item.title);
      const mistake = str(item && item.mistake);
      const correction = str(item && item.correction);
      const description = str(item && item.description);
      if (mistake) return `易错：${mistake}${correction ? ` → 纠正：${correction}` : ""}`;
      return [itemTitle, description].filter(Boolean).join("：");
    });
    elements.push(
      textElement(`${prefix}-items`, {
        top: CONTENT_TOP + (body ? 60 : 0),
        height: Math.min(320, 36 * lines.length + 20),
        html: listHtml(lines, 17),
        fontSize: 17,
      }),
    );
  }

  const left = slide.left || {};
  const right = slide.right || {};
  const leftItems = arrayOf(left.items).map(str).filter(Boolean);
  const rightItems = arrayOf(right.items).map(str).filter(Boolean);
  if (leftItems.length || rightItems.length) {
    const columnWidth = (CONTENT_WIDTH - 24) / 2;
    if (leftItems.length) {
      elements.push(
        textElement(`${prefix}-left`, {
          left: MARGIN,
          top: CONTENT_TOP + 10,
          width: columnWidth,
          height: 300,
          html: `${left.title ? paragraphHtml(str(left.title), 19) : ""}${listHtml(leftItems, 16)}`,
          fontSize: 16,
        }),
      );
    }
    if (rightItems.length) {
      elements.push(
        textElement(`${prefix}-right`, {
          left: MARGIN + columnWidth + 24,
          top: CONTENT_TOP + 10,
          width: columnWidth,
          height: 300,
          html: `${right.title ? paragraphHtml(str(right.title), 19) : ""}${listHtml(rightItems, 16)}`,
          fontSize: 16,
        }),
      );
    }
  }

  const code = str(slide.code);
  if (code) {
    elements.push(
      textElement(`${prefix}-code`, {
        top: body || bullets.length ? 320 : CONTENT_TOP,
        width: CONTENT_WIDTH,
        height: 210,
        html: codeHtml(code),
        fontSize: 14,
        fontName: "Consolas",
      }),
    );
  }

  const explanation = str(slide.explanation);
  if (explanation) {
    elements.push(
      textElement(`${prefix}-explanation`, {
        top: 452,
        height: 74,
        html: paragraphHtml(explanation, 15),
        fontSize: 15,
        color: "#475569",
      }),
    );
  }

  const speakerNotes = str(slide.speakerNotes);
  return { elements, notes: speakerNotes };
}

function buildDeck(content, meta = {}) {
  const slides = arrayOf(content && content.slides);
  const deckTitle = str(meta.title) || str(content && content.title) || "LearnMate 课件";
  // 参考资料不在 slides 里（由前端/PPTX 按 6 条一页自动追加），导出到 PPTist 时显式补一页，
  // 否则「导出到本地 PPTist」得到的文稿会缺最后一页参考资料。
  const references = arrayOf(content && content.references);
  const referenceSlides = references.length
    ? [
        {
          slideType: "references",
          title: "参考资料",
          bullets: references.map((item, index) => {
            const title = str(item && (item.title || item.sourceTitle)) || `来源 ${index + 1}`;
            const chapter = str(item && item.chapter);
            const edition = [str(item && item.version) && `V${str(item.version)}`, str(item && item.license)]
              .filter(Boolean)
              .join(" · ");
            return `[${index + 1}] ${title}${chapter ? ` · ${chapter}` : ""}${edition ? ` · ${edition}` : ""}`;
          }),
        },
      ]
    : [];
  const pptistSlides = [...slides, ...referenceSlides].map((slide, index) => {
    const built = buildSlideElements(slide, index, deckTitle);
    const elements = Array.isArray(built) ? built : built.elements;
    const notes = Array.isArray(built) ? "" : built.notes;
    return {
      id: `learnmate-${String(index + 1).padStart(2, "0")}`,
      background: { type: "solid", color: "#FFFFFF" },
      elements,
      ...(notes ? { notes } : {}),
    };
  });
  return {
    title: deckTitle,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    theme: THEME,
    slides: pptistSlides,
  };
}

async function exportPptistDeck(studentId, resourceId, version) {
  const [[resource]] = await pool.query(
    "SELECT * FROM learning_resources WHERE id=? AND student_id=? LIMIT 1",
    [resourceId, studentId],
  );
  if (!resource) throw apiError("resource not found", 404);
  if (resource.resource_type !== "pptx") throw apiError("只有 PPT 资源可以导出为 PPTist 文稿。", 422);
  const selected = Number(version) || Number(resource.current_version);
  const [[row]] = await pool.query(
    "SELECT content_json FROM learning_resource_versions WHERE resource_id=? AND student_id=? AND version=? LIMIT 1",
    [resourceId, studentId, selected],
  );
  if (!row) throw apiError("resource version not found", 404);
  const envelope = parseJson(row.content_json);
  const deck = buildDeck(envelope.content || {}, {
    title: resource.title || envelope.title,
    subject: resource.subject,
    knowledgePoint: resource.knowledge_point,
  });
  return {
    deck,
    version: selected,
    fileName: `learnmate-ppt-${resourceId}-v${selected}-pptist.json`,
    slideCount: deck.slides.length,
  };
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    return {};
  }
}

function apiError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { exportPptistDeck, buildDeck, CANVAS_WIDTH, CANVAS_HEIGHT };
