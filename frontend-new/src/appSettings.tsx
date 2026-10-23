/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// 全局偏好设置：语言 / 外观 / 字号大小 / 字体。
// 全部落 localStorage，并在 <html> 上打标记 + 写 CSS 变量，所以整个软件立刻生效，
// 刷新之后依然生效（index.html 的首屏脚本不会覆盖这些标记）。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "zh" | "en";
export type Appearance = "light" | "dark" | "system";
export type FontChoice = "system" | "yahei" | "song" | "kai" | "mono";

export interface AppSettings {
  language: Language;
  appearance: Appearance;
  /** 会话内容字号（px）：只影响对话正文，不改变整体界面 */
  fontSize: number;
  fontFamily: FontChoice;
}

export const SETTINGS_STORAGE_KEY = "learnmate:app-settings";
export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 24;

export const DEFAULT_SETTINGS: AppSettings = {
  language: "zh",
  appearance: "light",
  fontSize: 15,
  fontFamily: "system",
};

export const FONT_STACKS: Record<FontChoice, string> = {
  system:
    'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
  yahei: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Heiti SC", sans-serif',
  song: '"Songti SC", "SimSun", "Noto Serif CJK SC", Georgia, serif',
  kai: '"Kaiti SC", "KaiTi", "STKaiti", "LXGW WenKai Screen", serif',
  mono: '"JetBrains Mono", "Cascadia Mono", Consolas, "Sarasa Mono SC", ui-monospace, monospace',
};

export const FONT_LABELS: Record<FontChoice, { zh: string; en: string }> = {
  system: { zh: "系统默认", en: "System default" },
  yahei: { zh: "微软雅黑", en: "Microsoft YaHei" },
  song: { zh: "宋体 / 衬线", en: "Songti / serif" },
  kai: { zh: "楷体", en: "Kaiti" },
  mono: { zh: "等宽字体", en: "Monospace" },
};

/* ------------------------------------------------------------------ 文案 ---- */
type Dict = Record<string, { zh: string; en: string }>;

const DICT: Dict = {
  "nav.dashboard": { zh: "学习首页", en: "Home" },
  "nav.path": { zh: "学习路径", en: "Path" },
  "nav.mentor": { zh: "AI 学习助手", en: "AI tutor" },
  "nav.knowledge": { zh: "知识图谱", en: "Knowledge map" },
  "nav.quiz": { zh: "能力检测", en: "Assessment" },
  "nav.report": { zh: "学习报告", en: "Report" },
  "nav.ranking": { zh: "班级信息", en: "Class info" },
  "nav.settings": { zh: "设置", en: "Settings" },
  "shell.search": { zh: "搜索课程、知识点…", en: "Search courses and topics…" },
  "shell.navAria": { zh: "学生端主导航", en: "Student navigation" },
  "shell.brandAria": { zh: "寻笺 学生端", en: "Xunjian student terminal" },
  "shell.profile": { zh: "学习档案", en: "Profile" },
  "shell.logout": { zh: "退出登录", en: "Sign out" },
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.subtitle": { zh: "让学习空间更适合你", en: "Make the workspace yours" },
  "settings.englishHeader": { zh: "PERSONALIZE YOUR LEARNING SPACE", en: "PERSONALIZE YOUR LEARNING SPACE" },
  "settings.group01": { zh: "学习偏好", en: "Learning preferences" },
  "settings.group02": { zh: "显示与阅读", en: "Display & reading" },
  "settings.group03": { zh: "语言与外观", en: "Language & appearance" },
  "settings.group03.en": { zh: "LANGUAGE & APPEARANCE", en: "LANGUAGE & APPEARANCE" },
  "settings.goal": { zh: "每日学习目标", en: "Daily study goal" },
  "settings.goal.help": {
    zh: "设定你每天希望投入的学习时间",
    en: "How much time you plan to study each day",
  },
  "settings.goal.unit": { zh: "分钟", en: "min" },
  "settings.reminder": { zh: "提醒时间", en: "Reminder" },
  "settings.reminder.help": {
    zh: "我们会在设定的时间提醒你开始学习",
    en: "We nudge you when it's time to start",
  },
  "settings.difficulty": { zh: "学习难度", en: "Difficulty" },
  "settings.difficulty.help": {
    zh: "让系统根据你的表现智能调整学习内容",
    en: "Content adapts to your performance",
  },
  "settings.difficulty.easy": { zh: "简单", en: "Easy" },
  "settings.difficulty.auto": { zh: "自适应", en: "Adaptive" },
  "settings.difficulty.hard": { zh: "困难", en: "Hard" },
  "settings.density": { zh: "信息密度", en: "Density" },
  "settings.density.help": { zh: "调整内容在页面中的显示密度", en: "How tightly content is packed" },
  "settings.density.compact": { zh: "紧凑", en: "Compact" },
  "settings.density.cozy": { zh: "舒适", en: "Cozy" },
  "settings.density.loose": { zh: "宽松", en: "Loose" },
  "settings.motion": { zh: "界面动效", en: "Motion" },
  "settings.motion.help": {
    zh: "调整页面动画效果，获得更专注的体验",
    en: "Reduce animation for a calmer workspace",
  },
  "settings.motion.rich": { zh: "增强", en: "Rich" },
  "settings.motion.normal": { zh: "标准", en: "Normal" },
  "settings.motion.reduce": { zh: "减弱", en: "Reduced" },
  "settings.language": { zh: "语言", en: "Language" },
  "settings.language.help": {
    zh: "界面语言；课程与知识点名称仍以中文数据为准",
    en: "Interface language; course data stays in Chinese",
  },
  "settings.appearance": { zh: "外观", en: "Appearance" },
  "settings.appearance.help": {
    zh: "浅色纸面 / 深色夜间 / 跟随系统设置",
    en: "Light, dark, or follow the system",
  },
  "settings.appearance.light": { zh: "浅色", en: "Light" },
  "settings.appearance.dark": { zh: "深色", en: "Dark" },
  "settings.appearance.system": { zh: "跟随系统", en: "System" },
  "settings.fontSize": { zh: "字号大小", en: "Font size" },
  "settings.fontSize.help": { zh: "仅影响会话内容的字号", en: "Applies to conversation text only" },
  "settings.fontFamily": { zh: "字体", en: "Font" },
  "settings.fontFamily.help": {
    zh: "选择阅读正文字体，立即在整个软件生效",
    en: "Reading font, applied across the whole app",
  },
  "settings.save": { zh: "保存设置", en: "Save settings" },
  "settings.saved": { zh: "已保存", en: "Saved" },
  "settings.reset": { zh: "恢复默认", en: "Reset" },
  "settings.rail.account": { zh: "个人简介", en: "Profile" },
  "settings.rail.appearance": { zh: "外观", en: "Appearance" },
  "settings.rail.data": { zh: "数据管理", en: "Data" },
  "settings.rail.privacy": { zh: "隐私", en: "Privacy" },
  "settings.applied": { zh: "已即时生效", en: "Applied instantly" },
  "settings.group04": { zh: "账户与隐私", en: "Account & privacy" },
  "settings.group05": { zh: "数据管理", en: "Data" },
  "settings.account": { zh: "当前账号", en: "Signed in as" },
  "settings.account.help": { zh: "本机登录的学生账号", en: "The student account on this device" },
  "settings.signOut": { zh: "退出登录", en: "Sign out" },
  "settings.signOut.help": {
    zh: "退出后回到登录页，学习记录不受影响",
    en: "Returns to the sign-in page; your records stay",
  },
  "settings.switchAccount": { zh: "切换账号", en: "Switch account" },
  "settings.changePassword": { zh: "修改密码", en: "Change password" },
  "settings.changePassword.help": {
    zh: "新密码需 8-64 位并同时包含字母和数字",
    en: "8-64 characters, must include letters and digits",
  },
  "settings.currentPassword": { zh: "当前密码", en: "Current password" },
  "settings.newPassword": { zh: "新密码", en: "New password" },
  "settings.confirmPassword": { zh: "确认新密码", en: "Confirm new password" },
  "settings.submitPassword": { zh: "确认修改", en: "Update password" },
  "settings.cancel": { zh: "取消", en: "Cancel" },
  "settings.deleteAccount": { zh: "注销账号", en: "Delete account" },
  "settings.deleteAccount.help": {
    zh: "注销后该账号无法再登录，用户名与昵称会被匿名化，学习记录保留",
    en: "The account becomes unusable and is anonymised; records are kept",
  },
  "settings.deleteConfirm": { zh: "输入「注销」确认", en: "Type 注销 to confirm" },
  "settings.deleteSubmit": { zh: "确认注销", en: "Delete permanently" },
  "settings.deleteOpen": { zh: "我要注销账号", en: "Delete my account" },
  "settings.exportData": { zh: "导出我的设置", en: "Export my settings" },
  "settings.exportData.help": {
    zh: "下载一份包含偏好与外观设置的 JSON 文件",
    en: "Download preferences and appearance as JSON",
  },
  "settings.clearCache": { zh: "清理本地缓存", en: "Clear local cache" },
  "settings.clearCache.help": {
    zh: "清掉本机保存的偏好与主题，下次打开回到默认",
    en: "Removes locally stored preferences and theme",
  },
  "settings.preview": { zh: "会话预览", en: "Conversation preview" },
  "settings.preview.text": {
    zh: "红黑树通过颜色约束把最长路径控制在最短路径的两倍以内，因此查找、插入、删除都是 O(log n)。",
    en: "A red-black tree keeps the longest path within twice the shortest, so search, insert and delete all stay O(log n).",
  },
};

export function translate(language: Language, key: string): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[language] || entry.zh;
}

/* -------------------------------------------------------------- 读写存储 ---- */
export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return normalize(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function normalize(input: Partial<AppSettings> | null | undefined): AppSettings {
  const language: Language = input?.language === "en" ? "en" : "zh";
  const appearance: Appearance =
    input?.appearance === "dark" || input?.appearance === "system" ? input.appearance : "light";
  const rawSize = Number(input?.fontSize);
  const fontSize = Number.isFinite(rawSize)
    ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(rawSize)))
    : DEFAULT_SETTINGS.fontSize;
  const fontFamily: FontChoice = (["system", "yahei", "song", "kai", "mono"] as FontChoice[]).includes(
    input?.fontFamily as FontChoice,
  )
    ? (input!.fontFamily as FontChoice)
    : DEFAULT_SETTINGS.fontFamily;
  return { language, appearance, fontSize, fontFamily };
}

export function writeSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式等场景忽略写入失败，本次会话内仍旧生效
  }
}

/* ------------------------------------------------------------ 全局生效 ---- */
/* 界面动效偏好存在设置页那份 blueprint-preferences 里，这里负责在应用启动时读一次并
   挂到 <html data-motion>：这样「减弱」是整站生效（含侧边导航的光泽扫过等过渡），
   而不是只有打开过设置页之后才生效。默认「标准」，动效全开。 */
export const BLUEPRINT_PREFS_KEY = "learnmate:blueprint-preferences";
const BLUEPRINT_PREFS_VERSION = 2;

export function readMotionPref(): string {
  try {
    const raw = (JSON.parse(localStorage.getItem(BLUEPRINT_PREFS_KEY) || "{}") || {}) as {
      motion?: string;
      version?: number;
    };
    let motion = raw.motion === "减弱" || raw.motion === "增强" ? raw.motion : "标准";
    /* v2 迁移：老数据里那份默认的「减弱」会把全站过渡一起关掉（侧边导航的
       光泽扫过就是其中之一），这里在应用启动时一次性改回「标准」并记账，
       之后用户自己选的「减弱」依旧生效。 */
    if ((Number(raw.version) || 0) < BLUEPRINT_PREFS_VERSION) {
      if (raw.motion === "减弱") motion = "标准";
      const next = { ...raw, motion, version: BLUEPRINT_PREFS_VERSION };
      try {
        localStorage.setItem(BLUEPRINT_PREFS_KEY, JSON.stringify(next));
      } catch {
        /* 忽略写入失败 */
      }
    }
    return motion;
  } catch {
    return "标准";
  }
}

export function applyMotionPref(motion: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.motion = motion === "减弱" ? "reduce" : "normal";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches)
  );
}

export function resolveAppearance(appearance: Appearance): "light" | "dark" {
  if (appearance === "system") return systemPrefersDark() ? "dark" : "light";
  return appearance;
}

/**
 * 把设置写到 <html> 与 :root 变量上。
 * 深色用 data-appearance="dark"（整壳反相 + 色相回正，见 appSettings.css）；
 * data-theme 始终固定 light，避免和旧版深色变量叠加成"反相两次"。
 */
export function applySettings(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveAppearance(settings.appearance);
  root.dataset.appearance = resolved;
  root.dataset.appearanceMode = settings.appearance;
  root.dataset.theme = "light";
  root.dataset.lang = settings.language;
  root.lang = settings.language === "en" ? "en" : "zh-CN";
  root.style.setProperty("--lm-font", FONT_STACKS[settings.fontFamily]);
  root.style.setProperty("--lm-chat-font-size", `${settings.fontSize}px`);
}

/* ------------------------------------------------------------- Provider ---- */
interface SettingsContextValue {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  reset: () => void;
  save: () => void;
  saved: boolean;
  t: (key: string) => string;
  resolvedAppearance: "light" | "dark";
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());
  const [saved, setSaved] = useState(false);
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());

  /* 跟随系统：只监听系统偏好，不做 18:00 定时判断 */
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedAppearance: "light" | "dark" =
    settings.appearance === "system" ? (systemDark ? "dark" : "light") : settings.appearance;

  useEffect(() => {
    applySettings(settings);
  }, [settings, systemDark]);

  /* 首屏（React 之前）可能被旧主题脚本写成 dark，这里纠正一次；
     同时把「界面动效」偏好挂上，保证刷新后依旧是用户选的那档。 */
  useEffect(() => {
    if (document.documentElement.dataset.theme !== "light") {
      document.documentElement.dataset.theme = "light";
    }
    applyMotionPref(readMotionPref());
  }, []);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => {
      const next = normalize({ ...current, [key]: value });
      writeSettings(next); /* 改一项就落盘：立即生效 + 刷新依然保持 */
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    writeSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const save = useCallback(() => {
    setSettings((current) => {
      writeSettings(current);
      return current;
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }, []);

  const t = useCallback((key: string) => translate(settings.language, key), [settings.language]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, reset, save, saved, t, resolvedAppearance }),
    [settings, update, reset, save, saved, t, resolvedAppearance],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAppSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useAppSettings 必须在 AppSettingsProvider 内使用");
  return value;
}

/** 页头日期：语言决定星期写法 */
export function weekdayLabel(language: Language, day: number): string {
  const zh = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const en = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return language === "en" ? en[day] : zh[day];
}
