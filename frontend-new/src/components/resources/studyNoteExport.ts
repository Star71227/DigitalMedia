/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { StudyNoteContent } from "./StudyNotePreview";

/**
 * 学生端讲义导出 PDF。
 *
 * 做法：把讲义内容重新排成一份 A4 打印文档（自包含 HTML），在独立窗口里直接调浏览器打印，
 * 学生在打印对话框里选「另存为 PDF / Save as PDF」即可得到 PDF 文件。
 * 选它的原因：中文排版与字体由浏览器负责（不需要后端装 chromium/字体），
 * 且与学生端「学习报告」页现有的导出方式一致。
 */

export interface StudyNoteExportMeta {
  /** 讲义标题，缺省用「个性化学习讲义」 */
  title?: string;
  subject?: string;
  knowledgePoint?: string;
  stageTitle?: string;
  version?: number | string;
  /** 学习路径版本，可选 */
  pathVersion?: number | string;
}

const FONT_STACK =
  '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif';

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function list<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : value === null || value === undefined
      ? ""
      : String(value);
}

function paragraph(value: unknown): string {
  const body = text(value);
  if (!body) return "";
  return body
    .split(/\n{2,}/)
    .map((chunk) => `<p>${esc(chunk).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function section(index: string, title: string, body: string, extraClass = ""): string {
  if (!body) return "";
  return `<section class="sec ${extraClass}">
  <h2><span>${esc(index)}</span>${esc(title)}</h2>
  ${body}
</section>`;
}

function orderedSteps(steps: unknown[], className = "steps"): string {
  const items = list(steps)
    .map((step) => text(step))
    .filter(Boolean);
  if (!items.length) return "";
  return `<ol class="${className}">${items.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>`;
}

/** 把讲义内容排成可打印的完整 HTML 文档 */
export function buildStudyNotePrintHtml(content: StudyNoteContent, meta: StudyNoteExportMeta = {}): string {
  const note = (content || {}) as StudyNoteContent;
  const title = text(meta.title) || "个性化学习讲义";
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });

  const metaRows = [
    meta.subject ? ["课程", meta.subject] : null,
    meta.knowledgePoint ? ["知识点", meta.knowledgePoint] : null,
    meta.stageTitle ? ["学习阶段", meta.stageTitle] : null,
    meta.version ? ["讲义版本", `v${meta.version}`] : null,
    ["导出时间", exportedAt],
  ]
    .filter((row): row is [string, string] => Boolean(row))
    .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`)
    .join("");

  const objectives = list(note.personalizedObjectives)
    .map((item) => `<li>${esc(item)}</li>`)
    .join("");

  const foundation = `
    ${paragraph(note.foundationSummary)}
    ${objectives ? `<div class="objectives"><h3>本节目标</h3><ol>${objectives}</ol></div>` : ""}`;

  const concepts = list(note.coreConcepts)
    .map((item, index) => {
      const importance =
        item?.importance === "high" ? "重点" : item?.importance === "medium" ? "常规" : "补充";
      return `<article class="card">
        <header><b>${String(index + 1).padStart(2, "0")}</b><h4>${esc(item?.title)}</h4><em>${esc(importance)}</em></header>
        ${paragraph(item?.explanation)}
      </article>`;
    })
    .join("");

  const diagrams = list(note.diagrams)
    .map(
      (item) => `<article class="card">
        <h4>${esc(item?.title)}</h4>
        ${paragraph(item?.description)}
        ${orderedSteps(item?.steps as unknown[])}
      </article>`,
    )
    .join("");

  const methods = list(note.methodsAndFormulas)
    .map((item) => {
      const conditions = list(item?.conditions)
        .map((condition) => `<li>${esc(condition)}</li>`)
        .join("");
      return `<article class="card">
        <h4>${esc(item?.title)}</h4>
        ${item?.expression ? `<code>${esc(item.expression)}</code>` : ""}
        ${paragraph(item?.explanation)}
        ${conditions ? `<ul class="conditions">${conditions}</ul>` : ""}
      </article>`;
    })
    .join("");

  const examples = list(note.workedExamples)
    .map(
      (item, index) => `<article class="card">
        <header><b>CASE ${String(index + 1).padStart(2, "0")}</b></header>
        <h4>${esc(item?.question)}</h4>
        ${orderedSteps(item?.steps as unknown[])}
        ${item?.answer ? `<p class="answer"><strong>结论</strong>${esc(item.answer)}</p>` : ""}
      </article>`,
    )
    .join("");

  const mistakes = list(note.commonMistakes)
    .map(
      (item) => `<article class="card card--warn">
        <h4>${esc(item?.mistake)}</h4>
        ${item?.reason ? `<p><strong>原因：</strong>${esc(item.reason)}</p>` : ""}
        ${item?.correction ? `<p><strong>纠正：</strong>${esc(item.correction)}</p>` : ""}
      </article>`,
    )
    .join("");

  const practice = list(note.practiceTasks)
    .map(
      (item, index) => `<article class="card">
        <header><b>${String(index + 1).padStart(2, "0")}</b><h4>${esc(item?.prompt)}</h4></header>
        ${item?.hint ? `<p><strong>提示：</strong>${esc(item.hint)}</p>` : ""}
        ${item?.answerGuide ? `<p><strong>参考评分点：</strong>${esc(item.answerGuide)}</p>` : ""}
      </article>`,
    )
    .join("");

  const advice = list(note.studyAdvice)
    .map((item) => `<li>${esc(item)}</li>`)
    .join("");
  const citations = list(note.citationBasis)
    .map((item) => `<li>${esc(item)}</li>`)
    .join("");

  const sections = [
    section("00", "当前基础摘要", foundation),
    section("01", "核心概念", concepts ? `<div class="grid">${concepts}</div>` : ""),
    section("02", "图示理解", diagrams, "sec--split"),
    section("03", "方法与公式", methods, "sec--split"),
    section("04", "例题拆解", examples ? `<div class="grid">${examples}</div>` : ""),
    section("05", "易错点", mistakes ? `<div class="grid">${mistakes}</div>` : ""),
    section("06", "巩固练习", practice),
    section("07", "学习建议", advice ? `<ul class="plain">${advice}</ul>` : ""),
    section("08", "引用依据", citations ? `<ul class="plain">${citations}</ul>` : ""),
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(title)} · 讲义 PDF</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    color: #1b2740;
    font: 12.5px/1.75 ${FONT_STACK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { max-width: 820px; margin: 0 auto; padding: 26px 30px 40px; }

  /* 屏幕提示条：打印时不出现 */
  .screenbar {
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
    margin-bottom: 18px; padding: 12px 16px;
    border: 1px solid #d7e3f5; border-radius: 10px 3px 10px 3px;
    background: linear-gradient(145deg, #fff, #eef4fd);
  }
  .screenbar p { margin: 0; color: #4c5b75; font-size: 12px; }
  .screenbar b { font-size: 13px; }
  .screenbar button {
    margin-left: auto; padding: 9px 18px; border: 1px solid #086fe7; border-radius: 6px;
    background: #086fe7; color: #fff; font: 650 13px ${FONT_STACK}; cursor: pointer;
  }
  .screenbar button:hover { background: #045fc9; border-color: #045fc9; }

  .cover { padding-bottom: 16px; border-bottom: 2px solid #086fe7; }
  .cover .brand { color: #086fe7; font-size: 11px; font-weight: 700; letter-spacing: .28em; }
  .cover h1 { margin: 10px 0 0; font-size: 22px; font-weight: 750; line-height: 1.35; }
  .cover dl { display: flex; flex-wrap: wrap; gap: 6px 26px; margin: 14px 0 0; }
  .cover dl > div { display: flex; align-items: baseline; gap: 6px; }
  .cover dt { color: #6b7c96; font-size: 11px; }
  .cover dd { margin: 0; font-size: 12px; font-weight: 650; }

  .sec { margin-top: 22px; break-inside: auto; }
  .sec h2 {
    display: flex; align-items: center; gap: 10px; margin: 0 0 12px;
    padding-bottom: 7px; border-bottom: 1px solid #dde5f1;
    font-size: 15px; font-weight: 750;
  }
  .sec h2 span {
    display: inline-grid; width: 26px; height: 22px; place-items: center;
    border: 1px solid #cfe0f7; border-radius: 3px; background: #f2f7fd;
    color: #086fe7; font: 700 11px/1 Georgia, serif;
  }
  .sec p { margin: 0 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  .card {
    padding: 12px 14px; border: 1px solid #dbe4f1; border-radius: 8px 2px 8px 2px;
    background: #fcfdff; break-inside: avoid;
  }
  .card + .card { margin-top: 10px; }
  .grid .card + .card { margin-top: 0; }
  .card header { display: flex; align-items: center; gap: 8px; }
  .card header b { color: #086fe7; font: 700 11px/1 Georgia, serif; letter-spacing: .06em; }
  .card h4 { margin: 0; font-size: 13px; font-weight: 700; }
  .card header em {
    margin-left: auto; padding: 1px 8px; border: 1px solid #cfe0f7; border-radius: 999px;
    background: #f2f7fd; color: #2f5cb8; font-size: 10.5px; font-style: normal; font-weight: 650;
  }
  .card p { margin: 6px 0 0; color: #3d4c66; }
  .card code {
    display: block; margin: 8px 0 0; padding: 8px 10px; border: 1px solid #e2e8f4; border-radius: 5px;
    background: #f6f8fc; color: #1b2740; font: 12px/1.6 Consolas, "Cascadia Mono", monospace;
    word-break: break-word; white-space: pre-wrap;
  }
  .steps, .conditions, .plain, .objectives ol { margin: 8px 0 0; padding-left: 20px; }
  .steps li, .conditions li, .plain li, .objectives li { margin-bottom: 4px; break-inside: avoid; }
  .conditions { color: #4c5b75; }
  .answer { padding-top: 6px; border-top: 1px dashed #dde5f1; }
  .answer strong, .card p strong { margin-right: 4px; color: #1b2740; }
  .objectives { margin-top: 10px; padding: 10px 14px; border: 1px solid #dbe4f1; border-left: 3px solid #086fe7; border-radius: 4px; background: #f7fafe; break-inside: avoid; }
  .objectives h3 { margin: 0; font-size: 12.5px; font-weight: 700; }
  .card--warn { border-color: #f1d9dd; background: #fffafb; }

  .doc-foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #dde5f1; color: #7b8aa1; font-size: 11px; text-align: center; }

  @media print {
    .screenbar { display: none !important; }
    .sheet { max-width: none; padding: 0; }
    .sec { break-inside: auto; }
    .card, .objectives, .grid > * { break-inside: avoid; }
    .sec h2 { break-after: avoid; }
  }
  @media (max-width: 720px) {
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="screenbar">
    <b>讲义已排版完成</b>
    <p>若没有自动弹出打印窗口，按 <b>Ctrl/⌘ + P</b>，在目标打印机里选「另存为 PDF」即可保存。</p>
    <button type="button" onclick="window.print()">打印 / 保存为 PDF</button>
  </div>

  <header class="cover">
    <div class="brand">寻笺 · 学生端讲义</div>
    <h1>${esc(title)}</h1>
    <dl>${metaRows}</dl>
  </header>

  ${sections || '<p class="empty">当前讲义还没有可导出的内容。</p>'}

  <div class="doc-foot">本讲义由「寻笺」依据你的学习画像与知识库生成 · 导出于 ${esc(exportedAt)}</div>
</div>
</body>
</html>`;
}

/**
 * 打开打印窗口导出讲义 PDF。
 * 浏览器拦截弹窗时抛错，交给调用方提示。
 */
export function exportStudyNotePdf(content: StudyNoteContent, meta: StudyNoteExportMeta = {}): void {
  const html = buildStudyNotePrintHtml(content, meta);
  const win = window.open("", "_blank", "width=1024,height=1120");
  if (!win) throw new Error("浏览器拦截了新窗口，请允许本站弹出窗口后重试。");

  win.document.open();
  win.document.write(html);
  win.document.close();

  let printed = false;
  const trigger = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      /* 某些浏览器在窗口未就绪时会拒绝 print，此时用户可用页面里的按钮手动打印 */
    }
  };
  // 等字体与布局就绪再唤起打印，避免打出空白页
  if (win.document.readyState === "complete") window.setTimeout(trigger, 350);
  else win.addEventListener("load", () => window.setTimeout(trigger, 350));
  window.setTimeout(trigger, 1200);
}
