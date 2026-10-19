/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 题目里的代码排版工具。
 *
 * 背景：题库里不少程序题的题干是「一句提问 + 一段代码」，题面里已经带了换行与缩进，
 * 但之前整段塞进 <h2> 渲染，空白被折叠成一行，学生看到的就是一整行代码；
 * 也有更早的题目把代码写成一整行。这里统一拆成「题干 / 代码 / 收尾问句」三段，
 * 代码段交给 <pre> 渲染，单行代码会被重新缩进排版。
 */

/** 看起来像代码开头的一行 */
const CODE_LINE =
  /^\s*(?:#\s*(?:include|define|ifndef|ifdef|endif|pragma)\b|(?:int|char|float|double|void|long|short|unsigned|signed|struct|union|enum|typedef|static|const|extern|register|auto)\b|(?:for|while|if|switch|do|else|return|printf|scanf|puts|gets|malloc|free|calloc|realloc|fopen|fclose)\s*[({]|[{}]|[A-Za-z_]\w*\s*(?:\+\+|--|\+=|-=|\*=|\/=|=))/;

/** 整段是否包含代码（用于单行题面的判断） */
function looksLikeCode(text: string): boolean {
  if (/#\s*(include|define|pragma)/.test(text)) return true;
  if (!/[;{}]/.test(text)) return false;
  return /(?:for|while|if|switch|printf|scanf|return|sizeof)\s*\(|\b(?:int|char|float|double|void)\s+[A-Za-z_*]|[{}]/.test(
    text,
  );
}

function findCodeStartIndex(text: string): number {
  const candidates = [
    /#\s*(?:include|define|pragma)/,
    /\b(?:int|char|float|double|void|long|short|unsigned|struct|typedef|static|const)\s+[A-Za-z_*[(]/,
    /\b(?:for|while|if|switch)\s*\(/,
    /\b(?:printf|scanf|return|sizeof)\s*\(/,
  ];
  let best = -1;
  for (const pattern of candidates) {
    const match = pattern.exec(text);
    if (match && (best === -1 || match.index < best)) best = match.index;
  }
  return best;
}

/**
 * 把单行代码重新排版：按 { } ; 断行并缩进；字符串字面量与 for(...) 内的分号不动。
 * 已经是多行的代码直接原样返回（保留出题人写的缩进）。
 */
export function formatCodeText(raw: string): string {
  const text = String(raw || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return "";
  if (text.includes("\n")) return text.replace(/[ \t]+$/gm, "").trim();

  const source = text.replace(/[ \t]+/g, " ").trim();
  let out = "";
  let depth = 0;
  let paren = 0;
  let inString = false;
  let inChar = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];

    if (inString) {
      out += ch;
      if (ch === '"' && prev !== "\\") inString = false;
      continue;
    }
    if (inChar) {
      out += ch;
      if (ch === "'" && prev !== "\\") inChar = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "'") {
      inChar = true;
      out += ch;
      continue;
    }
    if (ch === "(") {
      paren += 1;
      out += ch;
      continue;
    }
    if (ch === ")") {
      paren = Math.max(0, paren - 1);
      out += ch;
      continue;
    }

    if (ch === "{") {
      out = `${out.trimEnd()} {\n${"    ".repeat(depth + 1)}`;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      out = `${out.trimEnd()}\n${"    ".repeat(depth)}}`;
      // } else / } while 保持同一行
      const rest = source.slice(i + 1).replace(/^\s+/, "");
      if (/^(else|while)\b/.test(rest)) out += " ";
      else out += `\n${"    ".repeat(depth)}`;
      continue;
    }
    if (ch === ";" && paren === 0) {
      out += `;\n${"    ".repeat(depth)}`;
      continue;
    }
    if (ch === " " && /\s/.test(out.slice(-1))) continue;
    out += ch;
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export interface StemParts {
  /** 提问文字（代码前的部分） */
  prose: string;
  /** 代码（可能为空） */
  code: string;
  /** 代码之后的收尾问句（例如“输出结果是？”） */
  tail: string;
}

/** 把题干拆成「提问 / 代码 / 收尾」三段，便于分别用正文与 <pre> 渲染 */
export function splitQuestionStem(stem: string): StemParts {
  const text = String(stem || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) return { prose: "", code: "", tail: "" };

  const lines = text.split("\n");
  let codeStartLine = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const isPreprocessor = /^\s*#\s*(?:include|define|ifndef|ifdef|endif|pragma)\b/.test(line);
    if (isPreprocessor || (CODE_LINE.test(line) && /[;{}()=]/.test(line))) {
      codeStartLine = i;
      break;
    }
  }

  if (codeStartLine > 0) {
    let prose = lines.slice(0, codeStartLine).join("\n").trim();
    let codeRaw = lines.slice(codeStartLine).join("\n");
    // 提问句末尾常常混进一段代码（例如「有以下程序 #include <stdio.h>」），把它挪进代码块
    const inlineStart = findCodeStartIndex(prose);
    if (inlineStart > 0) {
      const inlineCode = prose.slice(inlineStart).trim();
      prose = prose.slice(0, inlineStart).trim();
      codeRaw = `${inlineCode}\n${codeRaw}`;
    }
    // 代码后面可能还跟着一句中文提问，按最后一个 } 或 ; 切开
    const lastBrace = Math.max(codeRaw.lastIndexOf("}"), codeRaw.lastIndexOf(";"));
    const code = lastBrace >= 0 ? codeRaw.slice(0, lastBrace + 1) : codeRaw;
    const tail = lastBrace >= 0 ? codeRaw.slice(lastBrace + 1).trim() : "";
    return { prose, code: formatCodeText(code), tail };
  }

  // 单行题面：只有在确实像代码、且代码不是从第 0 个字符开始时才拆
  if (lines.length === 1 && looksLikeCode(text)) {
    const start = findCodeStartIndex(text);
    if (start > 0) {
      const prose = text.slice(0, start).trim();
      const codeRaw = text.slice(start);
      const lastBrace = Math.max(codeRaw.lastIndexOf("}"), codeRaw.lastIndexOf(";"));
      const code = lastBrace >= 0 ? codeRaw.slice(0, lastBrace + 1) : codeRaw;
      const tail = lastBrace >= 0 ? codeRaw.slice(lastBrace + 1).trim() : "";
      return { prose, code: formatCodeText(code), tail };
    }
  }

  return { prose: text, code: "", tail: "" };
}
