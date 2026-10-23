/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Bot,
  ChevronRight,
  ClipboardCheck,
  Home,
  LogOut,
  Menu,
  Network,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { labelProps } from "./motion/Motion";
import { usePageEnter } from "./motion/usePageEnter";
import LogoReveal from "../components/LogoReveal";
import { useAppSettings } from "../appSettings";
import { DockNav } from "../components/effects/DockNav";

interface BlueprintShellProps {
  activeTab: string;
  studentName: string;
  onNavigate: (tab: string, payload?: unknown) => void;
  onLogout: () => void;
  children: ReactNode;
}

/* 导航文案走 i18n：设置里切到 English，整条导航立刻跟着变 */
function useNavigation() {
  const { t } = useAppSettings();
  return [
    { tab: "dashboard", label: t("nav.dashboard"), roman: "I", icon: Home },
    { tab: "path", label: t("nav.path"), roman: "II", icon: BookOpen },
    { tab: "mentor", label: t("nav.mentor"), roman: "III", icon: Bot },
    { tab: "knowledge", label: t("nav.knowledge"), roman: "IV", icon: Network },
    { tab: "quiz", label: t("nav.quiz"), roman: "V", icon: ClipboardCheck },
    { tab: "report", label: t("nav.report"), roman: "VI", icon: BarChart3 },
    { tab: "ranking", label: t("nav.ranking"), roman: "VII", icon: Users },
    { tab: "settings", label: t("nav.settings"), roman: "VIII", icon: Settings },
  ];
}

const pageArtwork: Record<string, string> = {
  dashboard: "/art/dashboard-wing.png",
  mentor: "/art/mentor-sacred-hands-v2.png",
  knowledge: "/art/knowledge-scan.png",
  quiz: "/art/path-birds-monochrome-v3.png",
  codelab: "/art/path-birds-monochrome-v3.png",
  report: "/art/report-glass-grid-v2.png",
  settings: "/art/settings-optics.png",
};

/* 侧边 HUD 上显示的页面代号：每个页面一套，像终端里的分区编号 */
const pageCodes: Record<string, string> = {
  dashboard: "SYS 01 · DASHBOARD",
  path: "SYS 02 · LEARNING PATH",
  mentor: "SYS 03 · AI MENTOR",
  knowledge: "SYS 04 · KNOWLEDGE MAP",
  quiz: "SYS 05 · ASSESSMENT",
  codelab: "SYS 05 · CODE LAB",
  report: "SYS 06 · REPORT",
  ranking: "SYS 07 · CLASS INFO",
  settings: "SYS 08 · SETTINGS",
};

/* 「SYS 01 · DASHBOARD」拆成编号与名称两段，HUD 里分两行排（都收在装饰框内） */
function codeOf(text: string) {
  return text.split("·")[0].trim();
}
function nameOf(text: string) {
  return text.split("·").slice(1).join("·").trim();
}

export default function BlueprintShell({
  activeTab,
  studentName,
  onNavigate,
  onLogout,
  children,
}: BlueprintShellProps) {
  usePageEnter(activeTab);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigation = useNavigation();
  const { t } = useAppSettings();
  /* DockNav 磁吸仅桌面端轨道布局(>=861px)启用,断点与 blueprint-v2.css 的 @media (min-width: 861px) 一致 */
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 861px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 861px)");
    const sync = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const navigate = (tab: string) => {
    onNavigate(tab);
    setMobileOpen(false);
  };

  return (
    <div className="bp-app-shell" data-page={activeTab}>
      <button
        type="button"
        className="bp-mobile-menu"
        onClick={() => setMobileOpen((value) => !value)}
        aria-label={mobileOpen ? "关闭导航" : "打开导航"}
      >
        {mobileOpen ? <X /> : <Menu />}
      </button>

      {mobileOpen && (
        <button className="bp-sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="关闭导航" />
      )}

      <aside className={mobileOpen ? "bp-sidebar is-open" : "bp-sidebar"}>
        <div className="bp-brand" aria-label={t("shell.brandAria")}>
          {/* 左上角标记：与开屏动画结尾同一个书页电路 logo（static = 不重播动画） */}
          <span className="bp-brand__mark" aria-hidden="true">
            <LogoReveal size={40} static bare />
          </span>
          <span className="bp-brand__word">
            寻<span>笺</span>
          </span>
          <small>ALWAYS LEARNING</small>
        </div>

        <label className="bp-search">
          <Search aria-hidden="true" />
          <input aria-label={t("shell.search")} placeholder={t("shell.search")} />
        </label>

        <DockNav enabled={isDesktop} childSelector="nav > button" className="bp-nav__dock">
          <nav className="bp-nav" aria-label={t("shell.navAria")}>
            {navigation.map((item) => {
              const Icon = item.icon;
              const selected = activeTab === item.tab || (item.tab === "quiz" && activeTab === "codelab");
              return (
                <button
                  key={item.tab}
                  type="button"
                  className={selected ? "bp-nav__item is-active" : "bp-nav__item"}
                  aria-current={selected ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  onClick={(event) => {
                    if (event.detail > 0) event.currentTarget.blur();
                    navigate(item.tab);
                  }}
                >
                  <span className="bp-nav__roman" {...labelProps("C", "none", "persist")} data-level="C" data-carrier="rail" data-enter="persist" data-family="F08" data-mg-behavior="persist">{item.roman}</span>
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </DockNav>

        <div className="bp-sidebar__footer">
          <div className="bp-class-name">数据结构 2 班</div>
          <button type="button" className="bp-profile-entry" onClick={() => navigate("analytics")}>
            <span className="bp-avatar">{studentName.slice(0, 1)}</span>
            <span>{studentName}</span>
            <ChevronRight aria-hidden="true" />
          </button>
          <button type="button" className="bp-logout" onClick={onLogout}>
            <LogOut aria-hidden="true" />
            {t("shell.logout")}
          </button>
          <p data-level="C" data-carrier="rail" data-enter="persist" data-family="F16" data-mg-behavior="persist">
            KEEP LEARNING
            <br />
            KEEP GROWING
          </p>
        </div>
      </aside>

      <main className="bp-main" id="main-content">
        <div className="bp-global-grid" aria-hidden="true" />
        <div className="bp-global-lines" aria-hidden="true" />
        {/* 左右空白带的技术界面：竖尺 + 斜纹 + 数据条 + 竖排标签，纯装饰 */}
        <div className="bp-side-hud" aria-hidden="true">
          <div className="bp-side-hud__rail is-left">
            {/* 代号拆两行：SYS 01 一行、页面英文名另一行，两行都在装饰框内，不会压到刻度尺竖线 */}
            <span className="bp-side-hud__code" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">
              <i />
              <b>{codeOf(pageCodes[activeTab] ?? "SYS · ONLINE")}</b>
              <em>{nameOf(pageCodes[activeTab] ?? "")}</em>
            </span>
            <span className="bp-side-hud__group">
              <b className="bp-side-hud__caption" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">PATH STEP</b>
              <span className="bp-side-hud__gauge">
                {Array.from({ length: 14 }, (_, index) => (
                  <i key={index} />
                ))}
              </span>
              <em className="bp-side-hud__mono" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">08 / 14</em>
            </span>
            <span className="bp-side-hud__group">
              <b className="bp-side-hud__caption" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">LOAD</b>
              <span className="bp-side-hud__bars">
                <i />
                <i />
                <i />
                <i />
              </span>
              <em className="bp-side-hud__mono" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">45 / 100</em>
            </span>
            <span className="bp-side-hud__stripe" />
            <span className="bp-side-hud__label" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">XUNJIAN / STUDENT TERMINAL</span>
            <span className="bp-side-hud__ticks" />
          </div>
          <div className="bp-side-hud__rail is-right">
            <span className="bp-side-hud__ticks" />
            <span className="bp-side-hud__label" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">LINK · STABLE</span>
            <span className="bp-side-hud__diamonds">
              <i />
              <i />
              <i />
            </span>
            <span className="bp-side-hud__code" data-level="C" data-carrier="rail" data-enter="persist" data-family="F09" data-mg-behavior="persist">IV · 04</span>
          </div>
        </div>
        {pageArtwork[activeTab] && (
          <div className="bp-page-art" aria-hidden="true">
            <img src={pageArtwork[activeTab]} alt="" />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
