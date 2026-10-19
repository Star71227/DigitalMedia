/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const PptxGenJS = require("pptxgenjs");
const { getResource } = require("./resourceGenerationService");
const { STORAGE_ROOT } = require("./resourceStorageService");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const color = (value) => /^#[0-9a-f]{6}$/i.test(value);
function validateDocument(input) {
  if (
    !input ||
    typeof input.title !== "string" ||
    input.title.length > 200 ||
    !Array.isArray(input.slides) ||
    input.slides.length < 1 ||
    input.slides.length > 60
  )
    throw fail("课件需要 1–60 页，标题最多 200 字");
  return {
    title: input.title,
    width: 1000,
    height: 562.5,
    slides: input.slides.map((slide, index) => {
      if (!slide || !color(slide.background) || !Array.isArray(slide.elements) || slide.elements.length > 20)
        throw fail("页面格式不正确");
      return {
        id: `page-${index}`,
        background: slide.background,
        notes: String(slide.notes || "").slice(0, 5000),
        elements: slide.elements.map((el, i) => {
          if (
            !el ||
            typeof el.text !== "string" ||
            el.text.length > 10000 ||
            !color(el.color) ||
            typeof el.bold !== "boolean"
          )
            throw fail("文字格式不正确");
          for (const [key, low, high] of [
            ["left", 0, 980],
            ["top", 0, 540],
            ["width", 20, 1000],
            ["height", 20, 562.5],
            ["fontSize", 12, 72],
          ]) {
            if (!Number.isFinite(el[key]) || el[key] < low || el[key] > high)
              throw fail("文字位置或字号超出范围");
          }
          if (el.left + el.width > 1000.1 || el.top + el.height > 562.6) throw fail("文字框超出页面");
          return {
            id: `el-${index}-${i}`,
            text: el.text,
            left: el.left,
            top: el.top,
            width: el.width,
            height: el.height,
            fontSize: el.fontSize,
            color: el.color,
            bold: el.bold,
          };
        }),
      };
    }),
  };
}
async function ownedResource(studentId, resourceId) {
  const resource = await getResource(studentId, resourceId);
  if (resource.resourceType !== "pptx") throw fail("请选择课件资源");
  return resource;
}
function draftPath(resource) {
  return path.join(STORAGE_ROOT, "presentation-drafts", `${resource.id}-v${resource.version}.json`);
}
async function load(studentId, resourceId) {
  const resource = await ownedResource(studentId, resourceId);
  try {
    return { document: validateDocument(JSON.parse(await fs.readFile(draftPath(resource), "utf8"))) };
  } catch (error) {
    if (error.code === "ENOENT") return { document: null };
    throw error;
  }
}
async function save(studentId, resourceId, input) {
  const resource = await ownedResource(studentId, resourceId);
  const document = validateDocument(input);
  const file = draftPath(resource);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(document), "utf8");
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return { savedAt: new Date().toISOString() };
}
async function render(input) {
  const document = validateDocument(input);
  const ppt = new PptxGenJS();
  ppt.layout = "LAYOUT_WIDE";
  ppt.title = document.title;
  ppt.author = "LearnMate";
  ppt.lang = "zh-CN";
  for (const page of document.slides) {
    const slide = ppt.addSlide();
    slide.background = { color: page.background.slice(1) };
    for (const el of page.elements)
      slide.addText(el.text, {
        x: el.left / 75,
        y: el.top / 75,
        w: el.width / 75,
        h: el.height / 75,
        fontSize: el.fontSize * 0.75,
        color: el.color.slice(1),
        bold: el.bold,
        fontFace: "Microsoft YaHei",
        margin: 0,
        valign: "top",
        fit: "shrink",
      });
    if (page.notes) slide.addNotes(page.notes);
  }
  return Buffer.from(await ppt.write({ outputType: "nodebuffer" }));
}
async function exportDeck(studentId, resourceId, input) {
  await ownedResource(studentId, resourceId);
  return render(input);
}
module.exports = { load, save, exportDeck, validateDocument, render };
