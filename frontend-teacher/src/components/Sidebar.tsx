/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useState } from "react";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  Library,
  Menu,
  ScrollText,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { navigate } from "../router";
import { teacherApi } from "../api/teacher";
import LogoReveal from "./LogoReveal";
import { DockNav } from "./effects/DockNav";

/* 罗马数字与学生端一致（I…X，十个入口） */
const items = [
  ["/dashboard", "工作台", LayoutDashboard],
  ["/students", "学生管理", Users],
  ["/classes", "班级学情", BarChart3],
  ["/class-requests", "入班申请", UserRoundPlus],
  ["/quizzes", "测验分析", ClipboardCheck],
  ["/assignments", "作业管理", ClipboardList],
  ["/question-bank", "题库管理", Library],
  ["/reports", "学习报告", FileBarChart],
  // 运行日志页本来就在（/agent-logs 路由与 AgentLogsPage 都在），只是侧栏一直没有入口。
  // 多智能体的接力、审核与打回重写记录就展示在这个已有页面里，不另开新页。
  ["/agent-logs", "运行日志", ScrollText],
] as const;

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

export function Sidebar({ path }: { path: string }) {
  const [pendingRequests, setPendingRequests] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Dock 磁吸仅桌面端启用:移动端(≤900px,editorial 断点)横排导航禁用
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 901px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 901px)");
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      teacherApi
        .classRequests({ status: "pending" })
        .then((result) => {
          if (!cancelled) setPendingRequests(result.counts?.pending ?? result.data?.length ?? 0);
        })
        .catch(() => {
          if (!cancelled) setPendingRequests(0);
        });
    };
    refresh();
    window.addEventListener("learnmate:class-requests-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("learnmate:class-requests-changed", refresh);
    };
  }, [path]);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        document.querySelector<HTMLButtonElement>(".teacher-mobile-menu")?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen]);
  const activeHref = items.find(([href]) => path.startsWith(href))?.[0] ?? "";

  return (
    <>
      <button
        type="button"
        className="teacher-mobile-menu"
        aria-label={mobileOpen ? "关闭导航" : "打开导航"}
        aria-expanded={mobileOpen}
        aria-controls="teacher-navigation"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
      {mobileOpen && (
        <button
          type="button"
          className="teacher-sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="teacher-navigation"
        className={`teacher-sidebar ${mobileOpen ? "is-open" : ""}`}
        aria-label="教师端侧边导航"
      >
        <div className="teacher-brand">
          {/* 左上角标记：与开屏动画结尾同一个书页电路 logo（static = 不重播动画） */}
          <span className="teacher-brand-monogram" aria-hidden="true">
            <LogoReveal size={38} static bare />
          </span>
          <strong>
            智课<span>研伴</span>
          </strong>
          <small>TEACHER WORKSPACE</small>
        </div>
        <div className="teacher-sidebar-label">教学工作台</div>
        <DockNav enabled={isDesktop} childSelector="nav > button">
          <nav className="teacher-nav" aria-label="教师端主导航">
            {items.map(([href, label, Icon], index) => (
              <button
                key={href}
                type="button"
                className={`teacher-nav-item ${href === activeHref ? "is-active" : ""}`}
                title={label}
                aria-label={label}
                aria-current={href === activeHref ? "page" : undefined}
                onClick={() => {
                  navigate(href);
                  setMobileOpen(false);
                }}
              >
                <span className="teacher-nav-roman" aria-hidden="true">
                  {ROMANS[index]}
                </span>
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
                {href === "/class-requests" && pendingRequests > 0 && (
                  <b className="teacher-nav-badge" aria-label={`${pendingRequests} 条待审核入班申请`}>
                    {pendingRequests > 99 ? "99+" : pendingRequests}
                  </b>
                )}
              </button>
            ))}
          </nav>
        </DockNav>
        <div className="teacher-sidebar-foot">
          <span>智课研伴</span>
          <small>让每一次教学决策都有依据</small>
        </div>
      </aside>
    </>
  );
}
