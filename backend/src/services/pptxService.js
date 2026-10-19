/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs/promises");
const posixPath = require("path").posix;
const PptxGenJS = require("pptxgenjs");
const JSZip = require("jszip");
const { resolveTheme } = require("./ppt/themes");
const { expandSlides, inferPersonalization } = require("./ppt/textUtils");
const renderTitleSlide = require("./ppt/renderTitleSlide");
const renderObjectivesSlide = require("./ppt/renderObjectivesSlide");
const renderConceptSlide = require("./ppt/renderConceptSlide");
const renderProcessSlide = require("./ppt/renderProcessSlide");
const renderComparisonSlide = require("./ppt/renderComparisonSlide");
const renderMisconceptionSlide = require("./ppt/renderMisconceptionSlide");
const renderExampleSlide = require("./ppt/renderExampleSlide");
const renderCodeSlide = require("./ppt/renderCodeSlide");
const renderQuizSlide = require("./ppt/renderQuizSlide");
const renderSummarySlide = require("./ppt/renderSummarySlide");
const renderNextStepsSlide = require("./ppt/renderNextStepsSlide");
const renderReferencesSlide = require("./ppt/renderReferencesSlide");

const MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const RENDERERS = {
  cover: renderTitleSlide,
  title: renderTitleSlide,
  objectives: renderObjectivesSlide,
  roadmap: renderProcessSlide,
  concept: renderConceptSlide,
  mechanism: renderConceptSlide,
  process: renderProcessSlide,
  comparison: renderComparisonSlide,
  mistakes: renderMisconceptionSlide,
  misconception: renderMisconceptionSlide,
  misconceptions: renderMisconceptionSlide,
  example: renderExampleSlide,
  code: renderCodeSlide,
  practice: renderQuizSlide,
  quiz: renderQuizSlide,
  answers: renderConceptSlide,
  summary: renderSummarySlide,
  next_steps: renderNextStepsSlide,
  references: renderReferencesSlide,
};

async function generatePptx(content = {}, filePath, citationCatalog = []) {
  const sourceSlides = Array.isArray(content.slides) ? content.slides : [];
  const slides = expandSlides(sourceSlides);
  const theme = resolveTheme(content.theme);
  const personalization = inferPersonalization(sourceSlides);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "LearnMate";
  pptx.subject = "个性化学习课件";
  pptx.title = sourceSlides[0]?.title || "LearnMate 个性化学习课件";
  pptx.company = "LearnMate · 智课研伴";
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei", lang: "zh-CN" };

  let pageNumber = 1;
  slides.forEach((data) => {
    const renderer = RENDERERS[data.slideType] || renderConceptSlide;
    renderer({ pptx, data, theme, pageNumber, citationCatalog, personalization });
    pageNumber += 1;
  });
  const references = Array.isArray(content.references) ? content.references : [];
  const hasReferenceSlide = slides.some((slide) => slide.slideType === "references");
  if (!hasReferenceSlide) {
    for (let offset = 0; offset < references.length; offset += 6) {
      renderReferencesSlide({
        pptx,
        data: {
          slideType: "references",
          title: offset ? `参考资料（续 ${Math.floor(offset / 6) + 1}）` : "参考资料",
          references: references.slice(offset, offset + 6),
          offset,
        },
        theme,
        pageNumber,
        citationCatalog,
        personalization,
      });
      pageNumber += 1;
    }
  }
  if (!slides.length) {
    const data = { slideType: "concept", title: "个性化学习课件", body: "当前课件暂无可展示页面。" };
    renderConceptSlide({ pptx, data, theme, pageNumber, citationCatalog, personalization });
  }
  await pptx.writeFile({ fileName: filePath });
  return validatePptxFile(filePath, {
    expectedSlideCount: pageNumber - 1,
    expectedTitles: slides.map((slide) => slide.title).filter(Boolean),
  });
}

async function validatePptxFile(filePath, options = {}) {
  const bytes = await fs.readFile(filePath);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("PPTX is not a ZIP package");
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  for (const name of ["[Content_Types].xml", "ppt/presentation.xml", "ppt/slides/slide1.xml"])
    if (!zip.file(name)) throw new Error(`PPTX missing ${name}`);
  const slideEntries = entries
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(compareSlideNames);
  if (!slideEntries.length) throw new Error("PPTX contains no slides");
  if (options.expectedSlideCount && slideEntries.length !== Number(options.expectedSlideCount)) {
    throw new Error(
      `PPTX slide count mismatch: expected ${options.expectedSlideCount}, got ${slideEntries.length}`,
    );
  }
  const externalRelationships = [];
  const missingInternalRelationships = [];
  const missingSlideRelationships = [];
  const slideTexts = [];
  let relationshipCount = 0;
  for (const name of slideEntries) {
    const xml = await zip.file(name).async("string");
    if (!xml.trim()) throw new Error(`PPTX empty slide XML: ${name}`);
    slideTexts.push(extractTextFromXml(xml));
    if (/\br:id=["'][^"']+["']/i.test(xml)) {
      const relsName = slideRelsName(name);
      if (!zip.file(relsName)) missingSlideRelationships.push(relsName);
    }
  }
  for (const name of entries.filter((entry) => entry.endsWith(".rels"))) {
    const xml = await zip.file(name).async("string");
    const relationships = parseRelationships(xml);
    relationshipCount += relationships.length;
    for (const relationship of relationships) {
      if (relationship.external) {
        externalRelationships.push(name);
        continue;
      }
      const target = resolveRelationshipTarget(name, relationship.target);
      if (target && !zip.file(target)) missingInternalRelationships.push({ rels: name, target });
    }
  }
  const expectedTitles = Array.isArray(options.expectedTitles) ? options.expectedTitles.filter(Boolean) : [];
  const missingTitles = expectedTitles.filter(
    (title) => !slideTexts.some((text) => normalizeText(text).includes(normalizeText(title))),
  );
  if (missingTitles.length)
    throw new Error(`PPTX missing expected slide titles: ${missingTitles.slice(0, 5).join(",")}`);
  const externalUnique = [...new Set(externalRelationships)];
  if (externalUnique.length)
    throw new Error(`PPTX contains external relationships: ${externalUnique.join(",")}`);
  const relationshipErrorCount = missingInternalRelationships.length + missingSlideRelationships.length;
  if (relationshipErrorCount) {
    throw new Error(`PPTX relationship validation failed: ${relationshipErrorCount} missing targets`);
  }
  const privateFieldLeakCount = await countPrivateLeaks(zip, entries);
  if (privateFieldLeakCount) throw new Error(`PPTX contains private field leaks: ${privateFieldLeakCount}`);
  return {
    size: bytes.length,
    entries,
    slideCount: slideEntries.length,
    notesCount: entries.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).length,
    mediaCount: entries.filter((name) => /^ppt\/media\/[^/]+$/.test(name)).length,
    relationshipCount,
    relationshipErrorCount,
    missingMedia: missingInternalRelationships.filter((item) => item.target.startsWith("ppt/media/")),
    missingInternalRelationships,
    missingSlideRelationships,
    externalRelationships: externalUnique,
    privateFieldLeakCount,
    packageValid: true,
  };
}

function compareSlideNames(a, b) {
  return slideNumber(a) - slideNumber(b);
}

function slideNumber(name) {
  return Number((name.match(/slide(\d+)\.xml$/) || [0, 0])[1]);
}

function slideRelsName(name) {
  return name.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
}

function parseRelationships(xml) {
  const relationships = [];
  const pattern = /<Relationship\b([^>]+)>?/gi;
  let match;
  while ((match = pattern.exec(xml))) {
    const attrs = match[1] || "";
    const target = attr(attrs, "Target");
    if (!target) continue;
    relationships.push({
      target,
      external: /TargetMode=["']External["']/i.test(attrs),
    });
  }
  return relationships;
}

function attr(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function resolveRelationshipTarget(relsName, rawTarget) {
  let target = String(rawTarget || "")
    .split("#")[0]
    .trim();
  if (!target || target.startsWith("#")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return "";
  try {
    target = decodeURIComponent(target);
  } catch {
    /* Keep the raw value. */
  }
  if (target.startsWith("/")) return posixPath.normalize(target.slice(1));
  const sourcePart =
    relsName === "_rels/.rels" ? "" : relsName.replace("/_rels/", "/").replace(/\.rels$/i, "");
  const base = sourcePart.includes("/") ? sourcePart.slice(0, sourcePart.lastIndexOf("/")) : "";
  return posixPath.normalize(posixPath.join(base, target));
}

function extractTextFromXml(xml) {
  return [...String(xml || "").matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

async function countPrivateLeaks(zip, entries) {
  const pattern =
    /correctAnswer|answerKey|referenceSolution|hiddenTests|privateTests|judgeConfig|systemPrompt|profileSnapshot|qualityAttempts|modelRawOutput|correctedContent|reference solution|hidden tests|judge config|参考实现|隐藏测试|判题配置|私有答案/i;
  let count = 0;
  for (const name of entries.filter((entry) => entry.endsWith(".xml") || entry.endsWith(".rels"))) {
    const xml = await zip.file(name).async("string");
    if (pattern.test(xml)) count += 1;
  }
  return count;
}

module.exports = { generatePptx, validatePptxFile, resolveTheme, expandSlides, MIME, RENDERERS };
