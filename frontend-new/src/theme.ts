/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// 主题运行时：18:00–08:00 自动深色，可手动固定覆盖（localStorage learnmate_theme）。
// 与 index.html 内联脚本保持同一套约定：data-theme = dark | light。
export type ThemeMode = "auto" | "dark" | "light";
export type Theme = "dark" | "light";

export const STORAGE_KEY = "learnmate_theme";
export const NIGHT_START_HOUR = 18;
export const NIGHT_END_HOUR = 8;
export const THEME_COLORS: Record<Theme, string> = { dark: "#171613", light: "#F7F6F3" };

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

export function getOverride(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function getEffectiveTheme(): Theme {
  const override = getOverride();
  if (override !== "auto") return override;
  // 自动模式：18:00–08:00 深色，其余时段浅色
  return isNightHour(new Date().getHours()) ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[theme];
  window.dispatchEvent(new CustomEvent("lm-theme-change", { detail: { theme } }));
}

/** 三态循环：自动 → 固定深色 → 固定浅色 → 自动。 */
export function cycleOverride(): ThemeMode {
  const current = getOverride();
  const next: ThemeMode = current === "auto" ? "dark" : current === "dark" ? "light" : "auto";
  try {
    if (next === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 隐私模式等场景忽略写入失败，仍按本次选择生效
  }
  applyTheme(getEffectiveTheme());
  return next;
}
