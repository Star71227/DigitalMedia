import { Carrier } from "./motion/Motion";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Database,
  Download,
  Eraser,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Save,
  Shield,
  Sun,
  UserRound,
  Users,
} from "lucide-react";
import { changePassword, deactivateAccount, describeApiError, getStoredUser } from "../api";
import {
  applyMotionPref,
  FONT_LABELS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  SETTINGS_STORAGE_KEY,
  useAppSettings,
  type Appearance,
  type FontChoice,
  type Language,
} from "../appSettings";
import { BlueprintHeader, BlueprintMotif } from "./BlueprintDecorations";

interface Props {
  onNavigateToTab: (tab: string) => void;
  onLogout: () => void;
}

interface Preferences {
  minutes: number;
  reminder: string;
  difficulty: "简单" | "自适应" | "困难";
  density: "紧凑" | "舒适" | "宽松";
  motion: "增强" | "标准" | "减弱";
}

const defaults: Preferences = {
  minutes: 120,
  reminder: "20:00",
  difficulty: "自适应",
  density: "舒适",
  motion: "标准",
};
const PREFS_KEY = "learnmate:blueprint-preferences";
/* v2：界面动效默认从「减弱」改成「标准」——原来那份默认值会把侧边导航的光泽扫过等
   全站过渡一起关掉，看着像"特效没了"。老数据一次性迁移，用户之后仍可自行选「减弱」。 */
const PREFS_VERSION = 2;

function loadPreferences(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as Partial<Preferences> & {
      version?: number;
    };
    const merged = { ...defaults, ...raw } as Preferences & { version?: number };
    if ((Number(raw.version) || 0) < PREFS_VERSION) {
      if (raw.motion === "减弱") merged.motion = defaults.motion;
      merged.version = PREFS_VERSION;
      localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
    }
    return merged;
  } catch {
    return { ...defaults };
  }
}

/* 后端会带着 code 返回，但通用错误文案会退化成「请求失败（400）」；
   账号安全这几条是最常见的输入问题，这里按 code 给出明确提示。 */
const ACCOUNT_ERROR_TEXT: Record<string, { zh: string; en: string }> = {
  CURRENT_PASSWORD_REQUIRED: { zh: "请输入当前密码", en: "Enter your current password" },
  CURRENT_PASSWORD_WRONG: { zh: "当前密码不正确", en: "Current password is incorrect" },
  INVALID_PASSWORD: {
    zh: "新密码需为 8-64 位，并同时包含字母和数字",
    en: "New password must be 8-64 characters with letters and digits",
  },
  PASSWORD_MISMATCH: { zh: "两次输入的新密码不一致", en: "The two new passwords do not match" },
  PASSWORD_UNCHANGED: { zh: "新密码不能与当前密码相同", en: "New password must differ from the current one" },
  PASSWORD_REQUIRED: { zh: "请输入登录密码以确认注销", en: "Enter your password to confirm" },
  PASSWORD_WRONG: { zh: "密码不正确，无法注销", en: "Password is incorrect" },
  CONFIRM_REQUIRED: { zh: "请输入「注销」两个字以确认", en: "Type 注销 to confirm deletion" },
  DEMO_ACCOUNT_PROTECTED: {
    zh: "该账号不支持该操作，请使用自己的学生账号",
    en: "Demo accounts cannot do this; use your own account",
  },
  AUTH_INVALID: { zh: "登录状态已失效，请重新登录", en: "Session expired, please sign in again" },
};

type RailKey = "account" | "appearance" | "data" | "privacy";

export default function BlueprintSettingsView({ onNavigateToTab, onLogout }: Props) {
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  const { settings, update, save, saved, reset, t } = useAppSettings();
  const [rail, setRail] = useState<RailKey>("appearance");

  /* 修改密码 */
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwState, setPwState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [dangerOpen, setDangerOpen] = useState(false);
  const [dangerForm, setDangerForm] = useState({ password: "", confirm: "" });
  const [dangerState, setDangerState] = useState<{ kind: "idle" | "busy" | "error"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [dataNote, setDataNote] = useState("");
  const account = getStoredUser();

  const groupRefs = {
    appearance: useRef<HTMLElement | null>(null),
    privacy: useRef<HTMLElement | null>(null),
    data: useRef<HTMLElement | null>(null),
  };

  /* 界面动效：减弱 → <html data-motion="reduce"> 关掉过渡与动画，立刻生效并落盘 */
  useEffect(() => {
    applyMotionPref(prefs.motion);
  }, [prefs.motion]);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      if (key === "motion") {
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify({ ...next, version: PREFS_VERSION }));
        } catch {
          /* 忽略写入失败 */
        }
      }
      return next;
    });
  };
  const persist = () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }));
    save();
  };

  /* 「恢复默认」一把回到图上那套：120 分钟 / 20:00 / 自适应 / 舒适 / 标准 /
     中文 / 浅色 / 15px / 系统默认，并立即落盘生效 */
  const restoreAllDefaults = () => {
    setPrefs(defaults);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...defaults, version: PREFS_VERSION }));
    } catch {
      /* 隐私模式忽略 */
    }
    applyMotionPref(defaults.motion);
    reset();
    save();
    setDataNote("");
  };

  const goRail = (key: RailKey) => {
    setRail(key);
    if (key === "account") {
      onNavigateToTab("analytics");
      return;
    }
    const target =
      key === "appearance" ? groupRefs.appearance : key === "privacy" ? groupRefs.privacy : groupRefs.data;
    target.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const describeAccountError = (reason: unknown, fallback: string) => {
    const code = (reason as { code?: string } | null)?.code;
    const mapped = code ? ACCOUNT_ERROR_TEXT[code] : undefined;
    if (mapped) return mapped[settings.language] || mapped.zh;
    return describeApiError(reason, fallback);
  };

  const submitPassword = async () => {
    setPwState({ kind: "busy", text: "正在提交…" });
    try {
      const result = await changePassword(pwForm);
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPwState({ kind: "ok", text: result.message || "密码已更新" });
    } catch (reason) {
      setPwState({ kind: "error", text: describeAccountError(reason, t("settings.changePassword")) });
    }
  };

  const submitDeactivate = async () => {
    setDangerState({ kind: "busy", text: "正在注销…" });
    try {
      await deactivateAccount(dangerForm);
      setDangerState({ kind: "idle", text: "" });
      onLogout(); /* 账号已不可用，直接退回登录页 */
    } catch (reason) {
      setDangerState({ kind: "error", text: describeAccountError(reason, t("settings.deleteAccount")) });
    }
  };

  const exportSettings = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: account ? { username: account.username, displayName: account.displayName } : null,
      appSettings: settings,
      blueprintPreferences: prefs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Xunjian-settings.json";
    link.click();
    URL.revokeObjectURL(url);
    setDataNote("已导出设置文件 Xunjian-settings.json");
  };

  const clearLocalCache = () => {
    const removed: string[] = [];
    [
      PREFS_KEY,
      SETTINGS_STORAGE_KEY,
      "learnmate_theme",
      "learnmate:batch-checkin-dismissed",
      "learnmate:focus-timer",
    ].forEach((key) => {
      try {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          removed.push(key);
        }
      } catch {
        /* 忽略隐私模式下的写入失败 */
      }
    });
    setPrefs(defaults);
    setDataNote(
      removed.length
        ? "已清理 " + removed.length + " 项本地缓存，刷新后回到默认设置"
        : "本地没有可清理的缓存",
    );
  };

  const appearanceOptions: { value: Appearance; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t("settings.appearance.light"), icon: Sun },
    { value: "dark", label: t("settings.appearance.dark"), icon: Moon },
    { value: "system", label: t("settings.appearance.system"), icon: Monitor },
  ];

  return (
    <section className="bp-page bp-settings-page">
      <BlueprintMotif variant="type" />
      <BlueprintHeader title={t("settings.title")} english={t("settings.englishHeader")} />
      <div className="bp-settings-title">
        <h2>
          {t("settings.title")}
          <span>.</span>
        </h2>
        <p>{t("settings.subtitle")}</p>
        <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F12" data-mg-behavior="reveal">{t("settings.englishHeader")}.</small>
      </div>

      <div className="bp-settings-layout">
        <section className="bp-settings-sheet">
          <Carrier shape="rail" className="mg-settings-rail" />
          <SettingsGroup number="01" title={t("settings.group01")} english="LEARNING PREFERENCES">
            <SettingRow label={t("settings.goal")} help={t("settings.goal.help")}>
              <input
                type="range"
                min="30"
                max="240"
                step="15"
                value={prefs.minutes}
                onChange={(event) => set("minutes", Number(event.target.value))}
              />
              <b>
                {prefs.minutes} {t("settings.goal.unit")}
              </b>
            </SettingRow>
            <SettingRow label={t("settings.reminder")} help={t("settings.reminder.help")}>
              <input
                className="bp-time-input"
                type="time"
                value={prefs.reminder}
                onChange={(event) => set("reminder", event.target.value)}
              />
            </SettingRow>
            <SettingRow label={t("settings.difficulty")} help={t("settings.difficulty.help")}>
              <Segment
                values={[
                  { value: "简单", label: t("settings.difficulty.easy") },
                  { value: "自适应", label: t("settings.difficulty.auto") },
                  { value: "困难", label: t("settings.difficulty.hard") },
                ]}
                value={prefs.difficulty}
                onChange={(value) => set("difficulty", value as Preferences["difficulty"])}
              />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup number="02" title={t("settings.group02")} english="DISPLAY & READING">
            <SettingRow label={t("settings.density")} help={t("settings.density.help")}>
              <Segment
                values={[
                  { value: "紧凑", label: t("settings.density.compact") },
                  { value: "舒适", label: t("settings.density.cozy") },
                  { value: "宽松", label: t("settings.density.loose") },
                ]}
                value={prefs.density}
                onChange={(value) => set("density", value as Preferences["density"])}
              />
            </SettingRow>
            <SettingRow label={t("settings.motion")} help={t("settings.motion.help")}>
              <Segment
                values={[
                  { value: "增强", label: t("settings.motion.rich") },
                  { value: "标准", label: t("settings.motion.normal") },
                  { value: "减弱", label: t("settings.motion.reduce") },
                ]}
                value={prefs.motion}
                onChange={(value) => set("motion", value as Preferences["motion"])}
              />
            </SettingRow>
          </SettingsGroup>

          <section ref={groupRefs.appearance}>
            <SettingsGroup number="03" title={t("settings.group03")} english={t("settings.group03.en")}>
              <SettingRow label={t("settings.language")} help={t("settings.language.help")}>
                <span className="bp-lang-select">
                  <select
                    aria-label={t("settings.language")}
                    value={settings.language}
                    onChange={(event) => update("language", event.target.value as Language)}
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </span>
              </SettingRow>

              <SettingRow label={t("settings.appearance")} help={t("settings.appearance.help")}>
                <div className="bp-appearance" role="radiogroup" aria-label={t("settings.appearance")}>
                  {appearanceOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={settings.appearance === option.value}
                        className={settings.appearance === option.value ? "is-active" : ""}
                        onClick={() => update("appearance", option.value)}
                      >
                        <Icon />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </SettingRow>

              <SettingRow label={t("settings.fontSize")} help={t("settings.fontSize.help")}>
                <span className="bp-number">
                  <input
                    type="number"
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    step={1}
                    aria-label={t("settings.fontSize")}
                    value={settings.fontSize}
                    onChange={(event) => update("fontSize", Number(event.target.value))}
                  />
                  <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">px</small>
                </span>
              </SettingRow>

              <SettingRow label={t("settings.fontFamily")} help={t("settings.fontFamily.help")}>
                <select
                  className="bp-select"
                  aria-label={t("settings.fontFamily")}
                  value={settings.fontFamily}
                  onChange={(event) => update("fontFamily", event.target.value as FontChoice)}
                >
                  {(Object.keys(FONT_LABELS) as FontChoice[]).map((key) => (
                    <option key={key} value={key}>
                      {FONT_LABELS[key][settings.language]}
                    </option>
                  ))}
                </select>
              </SettingRow>

              <div className="bp-font-preview">
                <span>
                  {t("settings.preview")} · {settings.fontSize}px
                </span>
                <p className="bp-font-preview__text">{t("settings.preview.text")}</p>
              </div>
              <p className="bp-model-state" data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">
                <i />
                {t("settings.applied")}
                <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F12" data-mg-behavior="reveal">{t("settings.language.help")}</small>
              </p>
            </SettingsGroup>
          </section>

          <section ref={groupRefs.privacy}>
            <SettingsGroup number="04" title={t("settings.group04")} english="ACCOUNT & PRIVACY">
              <SettingRow label={t("settings.account")} help={t("settings.account.help")}>
                <span className="bp-account-chip" data-level="B" data-carrier="tab" data-enter="persist" data-family="F11" data-mg-behavior="persist">
                  <b>{account?.displayName || "同学"}</b>
                  <em>{account?.username || account?.studentNo || "—"}</em>
                </span>
              </SettingRow>
              <SettingRow label={t("settings.signOut")} help={t("settings.signOut.help")}>
                <span className="bp-row-actions">
                  <button type="button" className="bp-line-button" onClick={onLogout}>
                    <LogOut />
                    {t("settings.signOut")}
                  </button>
                  <button type="button" className="bp-line-button" onClick={onLogout}>
                    <Users />
                    {t("settings.switchAccount")}
                  </button>
                </span>
              </SettingRow>

              <div className="bp-inline-form">
                <div className="bp-inline-form__head">
                  <KeyRound aria-hidden="true" />
                  <div>
                    <strong>{t("settings.changePassword")}</strong>
                    <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">{t("settings.changePassword.help")}</small>
                  </div>
                </div>
                <div className="bp-inline-form__fields">
                  <label>
                    {t("settings.currentPassword")}
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={pwForm.currentPassword}
                      onChange={(event) => setPwForm({ ...pwForm, currentPassword: event.target.value })}
                    />
                  </label>
                  <label>
                    {t("settings.newPassword")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={pwForm.newPassword}
                      onChange={(event) => setPwForm({ ...pwForm, newPassword: event.target.value })}
                    />
                  </label>
                  <label>
                    {t("settings.confirmPassword")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={pwForm.confirmPassword}
                      onChange={(event) => setPwForm({ ...pwForm, confirmPassword: event.target.value })}
                    />
                  </label>
                </div>
                <div className="bp-inline-form__foot">
                  <button
                    type="button"
                    className="bp-primary-action"
                    disabled={pwState.kind === "busy"}
                    onClick={() => void submitPassword()}
                  >
                    {t("settings.submitPassword")}
                  </button>
                  <span className={"bp-form-note is-" + pwState.kind}>{pwState.text}</span>
                </div>
              </div>

              <div className="bp-danger">
                <div className="bp-inline-form__head">
                  <AlertTriangle aria-hidden="true" />
                  <div>
                    <strong>{t("settings.deleteAccount")}</strong>
                    <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">{t("settings.deleteAccount.help")}</small>
                  </div>
                </div>
                {dangerOpen ? (
                  <div className="bp-inline-form__fields">
                    <label>
                      {t("settings.currentPassword")}
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={dangerForm.password}
                        onChange={(event) => setDangerForm({ ...dangerForm, password: event.target.value })}
                      />
                    </label>
                    <label>
                      {t("settings.deleteConfirm")}
                      <input
                        type="text"
                        placeholder="注销"
                        value={dangerForm.confirm}
                        onChange={(event) => setDangerForm({ ...dangerForm, confirm: event.target.value })}
                      />
                    </label>
                    <div className="bp-inline-form__foot">
                      <button
                        type="button"
                        className="bp-danger-action"
                        disabled={dangerState.kind === "busy"}
                        onClick={() => void submitDeactivate()}
                      >
                        {t("settings.deleteSubmit")}
                      </button>
                      <button
                        type="button"
                        className="bp-line-button"
                        onClick={() => {
                          setDangerOpen(false);
                          setDangerState({ kind: "idle", text: "" });
                        }}
                      >
                        {t("settings.cancel")}
                      </button>
                      <span className={"bp-form-note is-" + dangerState.kind}>{dangerState.text}</span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="bp-line-button bp-line-button--danger"
                    onClick={() => setDangerOpen(true)}
                  >
                    {t("settings.deleteOpen")}
                  </button>
                )}
              </div>
            </SettingsGroup>
          </section>

          <section ref={groupRefs.data}>
            <SettingsGroup number="05" title={t("settings.group05")} english="DATA">
              <SettingRow label={t("settings.exportData")} help={t("settings.exportData.help")}>
                <button
                  type="button"
                  className="bp-line-button"
                  data-action="export-settings"
                  onClick={exportSettings}
                >
                  <Download />
                  {t("settings.exportData")}
                </button>
              </SettingRow>
              <SettingRow label={t("settings.clearCache")} help={t("settings.clearCache.help")}>
                <button
                  type="button"
                  className="bp-line-button"
                  data-action="clear-cache"
                  onClick={clearLocalCache}
                >
                  <Eraser />
                  {t("settings.clearCache")}
                </button>
              </SettingRow>
              {dataNote ? (
                <p className="bp-model-state" data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist">
                  <i />
                  {dataNote}
                </p>
              ) : null}
            </SettingsGroup>
          </section>

          <footer>
            <span data-level="C" data-carrier="rail" data-enter="persist" data-family="F16" data-mg-behavior="persist">SETTINGS FOR A BRIGHTER YOU.</span>
            <button className="bp-primary-action" onClick={persist}>
              <Save />
              {saved ? t("settings.saved") : t("settings.save")}
            </button>
            <button className="bp-line-button" onClick={restoreAllDefaults}>
              {t("settings.reset")}
            </button>
          </footer>
        </section>

        <aside className="bp-settings-rail">
          <button
            data-rail="account"
            className={rail === "account" ? "is-active" : ""}
            onClick={() => goRail("account")}
          >
            <UserRound />
            <span>{t("settings.rail.account")}</span>
          </button>
          <button
            data-rail="appearance"
            className={rail === "appearance" ? "is-active" : ""}
            onClick={() => goRail("appearance")}
          >
            <Monitor />
            <span>{t("settings.rail.appearance")}</span>
          </button>
          <button
            data-rail="data"
            className={rail === "data" ? "is-active" : ""}
            onClick={() => goRail("data")}
          >
            <Database />
            <span>{t("settings.rail.data")}</span>
          </button>
          <button
            data-rail="privacy"
            className={rail === "privacy" ? "is-active" : ""}
            onClick={() => goRail("privacy")}
          >
            <Shield />
            <span>{t("settings.rail.privacy")}</span>
          </button>
        </aside>
      </div>
    </section>
  );
}

function SettingsGroup({
  number,
  title,
  english,
  children,
}: {
  number: string;
  title: string;
  english: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bp-settings-group" data-mg-group={number}>
      <header>
        <b>{number}</b>
        <div>
          <h3 data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">{title}</h3>
          <span>{english}</span>
        </div>
      </header>
      <div className="bp-settings-group__body">{children}</div>
    </section>
  );
}

function SettingRow({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="bp-setting-row">
      <div>
        <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">{label}</strong>
        <small data-level="B" data-carrier="rail" data-enter="attach" data-family="F12" data-mg-behavior="reveal">{help}</small>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Segment({
  values,
  value,
  onChange,
}: {
  values: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bp-segment">
      {values.map((item) => (
        <button
          type="button"
          key={item.value}
          className={item.value === value ? "is-active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
