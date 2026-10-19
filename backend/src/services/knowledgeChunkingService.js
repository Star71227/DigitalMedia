/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const normalizeText = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
function slug(value) {
  return (
    String(value || "section")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "section"
  );
}
function splitMarkdown(
  content,
  { sourceKey, documentKey, subject, title, targetChars = 650, overlapChars = 100 } = {},
) {
  const lines = String(content || "")
    .replace(/\r/g, "")
    .split("\n");
  let fence = false;
  let headings = [];
  let section = [];
  const sections = [];
  const flush = () => {
    const text = normalizeText(section.join("\n"));
    if (text && !/^#{1,6}\s+[^\n]+$/.test(text)) sections.push({ headings: [...headings], text });
    section = [];
  };
  for (const line of lines) {
    if (/^```/.test(line.trim())) fence = !fence;
    const h = !fence && /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      headings = headings.slice(0, level - 1);
      headings[level - 1] = h[2].trim();
      section.push(line);
    } else section.push(line);
  }
  flush();
  const chunks = [];
  for (const item of sections) {
    if (item.text.length <= targetChars) {
      chunks.push(item);
      continue;
    }
    const blocks = item.text.split(/\n\n+/);
    let current = "";
    for (const block of blocks) {
      if (current && current.length + block.length > targetChars && !current.trim().startsWith("```")) {
        chunks.push({ ...item, text: current.trim() });
        current = `${current.slice(-overlapChars)}\n\n${block}`;
      } else current += `${current ? "\n\n" : ""}${block}`;
    }
    if (current.trim()) chunks.push({ ...item, text: current.trim() });
  }
  return chunks
    .filter((x) => normalizeText(x.text).length > 30)
    .map((item, index) => {
      const normalized = normalizeText(item.text);
      const heading = item.headings[item.headings.length - 1] || title || documentKey;
      return {
        chunkKey: `${sourceKey}-${slug(documentKey)}-${slug(heading)}-${String(index + 1).padStart(3, "0")}`,
        subject,
        chapter: item.headings[0] || title || "",
        section: heading,
        headingPath: item.headings,
        content: item.text.slice(0, 6000),
        normalizedText: normalized.slice(0, 6000),
        tokenEstimate: Math.ceil(normalized.length / 2),
        charCount: normalized.length,
        chunkIndex: index,
        checksum: sha256(normalized),
      };
    });
}
module.exports = { splitMarkdown, normalizeText, sha256, slug };
