/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Moon, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, cycleOverride, getEffectiveTheme, getOverride, type ThemeMode } from "../theme";

const LABELS: Record<ThemeMode, string> = {
  auto: "主题：跟随时间（18:00–08:00 深色），点击固定为深色",
  dark: "主题：已固定深色，点击固定为浅色",
  light: "主题：已固定浅色，点击恢复自动",
};

/** 主题模式切换按钮：自动 → 深色 → 浅色 → 自动。 */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getOverride());

  useEffect(() => {
    const handleChange = () => setMode(getOverride());
    window.addEventListener("lm-theme-change", handleChange);
    // 自动模式下每分钟校准一次，页面跨过 18:00 / 08:00 边界时自动切换
    const timer = setInterval(() => {
      if (getOverride() === "auto") applyTheme(getEffectiveTheme());
    }, 60_000);
    return () => {
      window.removeEventListener("lm-theme-change", handleChange);
      clearInterval(timer);
    };
  }, []);

  const Icon = mode === "auto" ? SunMoon : mode === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition-colors duration-200 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
      aria-label="切换主题模式"
      title={LABELS[mode]}
      onClick={() => cycleOverride()}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
