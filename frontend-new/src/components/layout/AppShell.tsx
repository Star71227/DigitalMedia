/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { getMyAssignments } from "../../api";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Brain,
  ChevronDown,
  ClipboardList,
  Code2,
  Compass,
  FileText,
  GitBranch,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Trophy,
  User,
  X,
} from "lucide-react";
import ThemeToggle from "../ThemeToggle";

interface NavigationItem {
  id: string;
  label: string;
  roman: string;
  /** 顶部栏短标签；缺省时用 label。 */
  short?: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

interface NavigationSection {
  title?: string;
  items: NavigationItem[];
}

interface AppShellProps {
  activeTab: string;
  studentName: string;
  onNavigate: (tab: string, prefillData?: unknown) => void;
  onLogout: () => void;
  children: ReactNode;
}

const NAVIGATION: NavigationSection[] = [
  {
    items: [
      {
        id: "dashboard",
        label: "首页",
        roman: "I",
        description: "聚合今日任务、学习进度与下一步行动。",
        icon: Home,
      },
      {
        id: "path",
        label: "路径",
        roman: "II",
        description: "由学习画像、图谱掌握度与目标共同生成个性化学习链路。",
        icon: Compass,
      },
      {
        id: "mentor",
        label: "助手",
        roman: "III",
        description: "围绕课程资料、知识图谱与当前路径进行专业模型问答。",
        icon: MessageSquare,
      },
      {
        id: "knowledge",
        label: "图谱",
        roman: "IV",
        description: "探索课程、章节与知识点之间的依赖和跨学科关联。",
        icon: GitBranch,
      },
      {
        id: "quiz",
        label: "检测",
        roman: "V",
        description: "通过真实题库与代码练习形成可验证的学习证据。",
        icon: Brain,
      },
      {
        id: "report",
        label: "报告",
        roman: "VI",
        description: "基于测验、错题、资源与代码练习生成学习评估。",
        icon: FileText,
      },
      {
        id: "ranking",
        label: "排名",
        roman: "VII",
        description: "查看班级学习进度、稳定性与阶段成长位置。",
        icon: Trophy,
      },
      {
        id: "settings",
        label: "设置",
        roman: "VIII",
        description: "管理学习偏好、显示方式与专业模型接口。",
        icon: Settings,
      },
    ],
  },
];

const PAGE_ART: Record<string, string> = {
  dashboard: "/art/dashboard-wing.png",
  path: "/art/path-paper-cranes.png",
  mentor: "/art/mentor-hands.png",
  knowledge: "/art/knowledge-scan.png",
  quiz: "/art/quiz-chess.png",
  report: "/art/report-archive.png",
  ranking: "/art/ranking-spectrum.png",
  settings: "/art/settings-optics.png",
};

/* 学习画像已移到右上角头像下拉里，不再作为侧栏导航项；
   但它的页面标题/描述仍要能查到，否则 currentPage 会退回「页面未找到」。 */
const ANALYTICS_PAGE = {
  id: "analytics",
  label: "学习画像",
  description: "查看学习基础、偏好、目标和真实学习证据。",
  icon: Award,
};

/* 学习路径同样从侧栏移出，改为从首页「学习路径」板块一键进入。 */
const PATH_PAGE = {
  id: "path",
  label: "学习路径",
  description: "查看当前学习阶段、完成条件和下一步安排。",
  icon: Compass,
};

/* 不在侧栏里、但仍是有效页面的条目 */
const OFF_NAVIGATION_PAGES = [ANALYTICS_PAGE, PATH_PAGE];

const ALL_NAVIGATION = NAVIGATION.flatMap((section) => section.items);
const NOT_FOUND_PAGE = {
  id: "not-found",
  label: "页面未找到",
  description: "这个地址不对应现有的学生学习页面。",
};

export default function AppShell({ activeTab, studentName, onNavigate, onLogout, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState(0);
  const [firstPendingAssignmentId, setFirstPendingAssignmentId] = useState<number | null>(null);

  // 待办作业数量：切换页面或作业提交后刷新，用于顶部提醒与导航徽标
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getMyAssignments()
        .then((items) => {
          if (cancelled) return;
          const pending = items.filter((item) => !item.submitted);
          setPendingAssignments(pending.length);
          setFirstPendingAssignmentId(pending.length ? pending[0].id : null);
        })
        .catch(() => {
          if (!cancelled) setPendingAssignments(0);
        });
    };
    refresh();
    window.addEventListener("learnmate:assignments-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("learnmate:assignments-changed", refresh);
    };
  }, [activeTab]);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const currentPage =
    ALL_NAVIGATION.find((item) => item.id === activeTab) ??
    OFF_NAVIGATION_PAGES.find((item) => item.id === activeTab) ??
    NOT_FOUND_PAGE;

  const closeDrawer = (restoreFocus = true) => {
    setDrawerOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  };

  useEffect(() => {
    setDrawerOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable: HTMLElement[] = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const handleDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) closeDrawer(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", handleDesktop);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", handleDesktop);
    };
  }, [drawerOpen]);

  const navigateFromDrawer = (tab: string) => {
    onNavigate(tab);
    closeDrawer();
  };

  return (
    <div className="lm-app-canvas lm-frame-with-sidebar" data-page={activeTab}>
      <a className="lm-skip-link" href="#main-content">
        跳到主要内容
      </a>

      {/* 桌面端侧边导航：默认收起为图标栏，悬浮展开（移动端隐藏，改用下方抽屉） */}
      <SidebarRail activeTab={activeTab} onNavigate={onNavigate} pendingAssignments={pendingAssignments} />

      <div className="lm-app-frame" aria-hidden={drawerOpen || undefined} inert={drawerOpen}>
        <header className="lm-topbar">
          <Brand compact />
          <ThemeToggle />
          <AccountMenu
            studentName={studentName}
            onProfile={() => onNavigate("analytics")}
            onLogout={onLogout}
          />
        </header>

        <div className="lm-app-column">
          <header className="lm-mobile-header">
            <button
              ref={menuButtonRef}
              type="button"
              className="lm-icon-button"
              aria-label="打开导航菜单"
              aria-expanded={drawerOpen}
              aria-controls="mobile-navigation-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden="true" />
            </button>
            <span className="lm-mobile-header__title">{currentPage.label}</span>
            <span className="lm-mobile-header__mark" aria-hidden="true">
              <img src="/logo-white.svg" alt="" />
            </span>
            <ThemeToggle />
          </header>

          <main id="main-content" className="lm-main" tabIndex={-1}>
            {PAGE_ART[activeTab] && (
              <div className="lm-editorial-art" aria-hidden="true">
                <img src={PAGE_ART[activeTab]} alt="" />
              </div>
            )}
            <PageHeader
              pageId={currentPage.id}
              title={currentPage.label}
              description={currentPage.description}
            />
            <section className="lm-page-content" aria-label={`${currentPage.label}内容`}>
              {pendingAssignments > 0 && activeTab !== "assignment" && (
                <div
                  className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                  role="status"
                >
                  <ClipboardList className="lm-navigation__icon" strokeWidth={1.8} aria-hidden="true" />
                  <span>
                    老师发布了作业：你有 <strong>{pendingAssignments}</strong>{" "}
                    份待完成，提交后老师可以看到你的作答与统计。
                  </span>
                  <button
                    type="button"
                    className="lm-button lm-button--primary"
                    onClick={() => onNavigate("assignment", firstPendingAssignmentId ?? undefined)}
                  >
                    去完成作业
                  </button>
                </div>
              )}
              {children}
            </section>
          </main>
        </div>
      </div>

      <button
        type="button"
        className={`lm-drawer-backdrop ${drawerOpen ? "is-open" : ""}`}
        aria-label="关闭导航菜单"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
        tabIndex={-1}
        onClick={() => closeDrawer()}
      />
      <aside
        ref={drawerRef}
        id="mobile-navigation-drawer"
        className={`lm-mobile-drawer ${drawerOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="学生端导航菜单"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div className="lm-mobile-drawer__header">
          <Brand compact />
          <button
            ref={closeButtonRef}
            type="button"
            className="lm-icon-button"
            aria-label="关闭导航菜单"
            onClick={() => closeDrawer()}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="lm-mobile-drawer__scroll">
          <Navigation
            activeTab={activeTab}
            onNavigate={navigateFromDrawer}
            pendingAssignments={pendingAssignments}
          />
        </div>
        <AccountActions
          studentName={studentName}
          onProfile={() => navigateFromDrawer("analytics")}
          onLogout={onLogout}
        />
      </aside>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lm-brand ${compact ? "lm-brand--compact" : ""}`}>
      <span className="lm-brand__mark" aria-hidden="true">
        <img src="/logo-white.svg" alt="" />
      </span>
      <span className="lm-brand__copy">
        <strong>寻笺</strong>
        {!compact && <span>学生学习工作台</span>}
      </span>
    </div>
  );
}

function Navigation({
  activeTab,
  onNavigate,
  pendingAssignments,
}: {
  activeTab: string;
  onNavigate: (tab: string) => void;
  pendingAssignments: number;
}) {
  return (
    <nav className="lm-navigation" aria-label="学习功能">
      {NAVIGATION.map((section, sectionIndex) => (
        <div className="lm-navigation__section" key={section.title ?? `primary-${sectionIndex}`}>
          {section.title && <p className="lm-navigation__label">{section.title}</p>}
          <div className="lm-navigation__items">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeTab;
              return (
                <button
                  type="button"
                  key={item.id}
                  className={`lm-navigation__item ${active ? "is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className="lm-nav-roman" aria-hidden="true">
                    {item.roman}
                  </span>
                  <Icon className="lm-navigation__icon" strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.id === "assignment" && pendingAssignments > 0 && (
                    <span
                      className="lm-nav-badge lm-nav-badge--drawer"
                      aria-label={`${pendingAssignments} 份待完成作业`}
                    >
                      {pendingAssignments > 99 ? "99+" : pendingAssignments}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** 桌面端侧边导航：默认只显示图标，鼠标悬浮整条侧栏时展开显示文字+图标。 */
function SidebarRail({
  activeTab,
  onNavigate,
  pendingAssignments,
}: {
  activeTab: string;
  onNavigate: (tab: string) => void;
  pendingAssignments: number;
}) {
  // 鼠标点击导航项后按钮会保留焦点，而侧栏用 :focus-within 保持展开，导致点完不收；
  // 因此鼠标点击（detail > 0）后主动释放焦点，键盘激活（detail === 0）保持焦点以便继续 Tab。
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const viaMouse = event.detail > 0;
    onNavigate(id);
    if (viaMouse) event.currentTarget.blur();
  };

  return (
    <aside className="lm-sidebar" aria-label="学生端侧边导航">
      <Brand compact />
      <div className="lm-sidebar__nav">
        <nav className="lm-navigation" aria-label="学习功能">
          {NAVIGATION.map((section, sectionIndex) => (
            <div className="lm-sidebar__section" key={section.title ?? `primary-${sectionIndex}`}>
              {section.title && <p className="lm-navigation__label">{section.title}</p>}
              <div className="lm-navigation__items">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeTab;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`lm-navigation__item ${active ? "is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      aria-label={active ? `${item.label}（当前页）` : item.label}
                      title={item.label}
                      onClick={(event) => handleClick(event, item.id)}
                    >
                      <span className="lm-nav-roman" aria-hidden="true">
                        {item.roman}
                      </span>
                      <Icon className="lm-navigation__icon" strokeWidth={1.8} aria-hidden="true" />
                      <span>{item.label}</span>
                      {item.id === "assignment" && pendingAssignments > 0 && (
                        <span className="lm-nav-badge" aria-label={`${pendingAssignments} 份待完成作业`}>
                          {pendingAssignments > 99 ? "99+" : pendingAssignments}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
      <div className="lm-sidebar__foot">
        <ShieldCheck aria-hidden="true" />
        <p>寻笺 · 学习工作台</p>
      </div>
    </aside>
  );
}

function AccountMenu({
  studentName,
  onProfile,
  onLogout,
}: {
  studentName: string;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="lm-account">
      <button
        ref={triggerRef}
        type="button"
        className="lm-account__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="lm-account__avatar" aria-hidden="true">
          {studentName.charAt(0)}
        </span>
        <span className="lm-account__name" title={studentName}>
          {studentName}
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div id="account-menu" role="menu" className="lm-menu lm-account__menu">
          <button
            type="button"
            role="menuitem"
            className="lm-menu__item"
            onClick={() => {
              setOpen(false);
              onProfile();
            }}
          >
            <User aria-hidden="true" />
            <span>学习画像</span>
          </button>
          <div className="lm-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="lm-menu__item lm-menu__logout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut aria-hidden="true" />
            <span>退出登录</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AccountActions({
  studentName,
  onProfile,
  onLogout,
}: {
  studentName: string;
  onProfile: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="lm-account-actions">
      <button type="button" className="lm-account-actions__profile" onClick={onProfile}>
        <User aria-hidden="true" />
        <span>
          <small>学生账号</small>
          <strong title={studentName}>{studentName}</strong>
        </span>
      </button>
      <button type="button" className="lm-account-actions__logout" onClick={onLogout}>
        <LogOut aria-hidden="true" />
        <span>退出登录</span>
      </button>
    </div>
  );
}

function PageHeader({
  pageId,
  title,
  description,
  primaryAction,
  secondaryActions = [],
}: {
  pageId: string;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode[];
}) {
  const page = ALL_NAVIGATION.find((item) => item.id === pageId);
  return (
    <header className="lm-page-header">
      <div>
        <p className="lm-page-header__folio">
          <span>{page?.roman ?? "—"}</span> LEARNING ARCHIVE
        </p>
        <h1>{title}</h1>
        <p className="lm-page-header__description">{description}</p>
      </div>
      {(primaryAction || secondaryActions.length > 0) && (
        <div className="lm-page-header__actions">
          {secondaryActions.slice(0, 2)}
          {primaryAction}
        </div>
      )}
    </header>
  );
}
