/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const THEMES = {
  "academic-blue": {
    name: "academic-blue",
    background: "F7FAFF",
    surface: "FFFFFF",
    surfaceAlt: "EAF2FF",
    primary: "1F5AA6",
    accent: "2F80ED",
    text: "172033",
    muted: "5B6B82",
    border: "B9CBE6",
    success: "167C5A",
    warning: "B45309",
    danger: "B42318",
    codeBackground: "101C33",
    codeText: "E8F0FF",
  },
  "technology-dark": {
    name: "technology-dark",
    background: "0B1220",
    surface: "111C30",
    surfaceAlt: "162642",
    primary: "65B7FF",
    accent: "3DD6C6",
    text: "F3F7FF",
    muted: "A8B6CB",
    border: "2D486C",
    success: "64D7A6",
    warning: "F2C66D",
    danger: "FF8F86",
    codeBackground: "070D18",
    codeText: "DCEAFF",
  },
  "learning-light": {
    name: "learning-light",
    background: "FFFDF8",
    surface: "FFFFFF",
    surfaceAlt: "F3F7EA",
    primary: "28745A",
    accent: "F09A3E",
    text: "20302A",
    muted: "63726B",
    border: "C9DCCF",
    success: "28745A",
    warning: "A75B12",
    danger: "B43A35",
    codeBackground: "17241F",
    codeText: "F2FFF8",
  },
};

const ALIASES = {
  "academic-light": "academic-blue",
  academic: "academic-blue",
  blue: "academic-blue",
  technology: "technology-dark",
  dark: "technology-dark",
  learning: "learning-light",
  light: "learning-light",
};

function resolveTheme(theme) {
  const requested = typeof theme === "string" ? theme : theme?.name;
  const key = THEMES[requested] ? requested : ALIASES[requested] || "academic-blue";
  return THEMES[key];
}

module.exports = { THEMES, resolveTheme };
