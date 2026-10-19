/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { UserProfile, Course, WeakPoint } from "./types";

// Views
import Portal from "./components/Portal";
import RegisterPage from "./components/RegisterPage";
import FocusTimer from "./components/FocusTimer";
import ChunkErrorBoundary from "./components/ChunkErrorBoundary";
import { ScrollProgressBar } from "./components/effects/ScrollProgressBar";
import { refreshScrollTriggers } from "./lib/gsap";
import AppShell from "./blueprint/BlueprintShell";
import AsyncState from "./components/ui/AsyncState";
import LogoIntro from "./components/LogoIntro";
import {
  apiRequest,
  AUTH_UNAUTHORIZED_EVENT,
  clearAuth,
  getAuthToken,
  getCurrentUser,
  login as loginRequest,
  postFocusSession,
  type AuthUser,
  type ProfileResponse,
} from "./api";

const Dashboard = lazy(() => import("./blueprint/BlueprintDashboard"));
const QuizView = lazy(() => import("./blueprint/BlueprintQuizView"));
const MentorView = lazy(() => import("./blueprint/MentorWorkspace"));
const ResourceView = lazy(() => import("./components/ResourceView"));
const PathView = lazy(() => import("./blueprint/BlueprintPathView"));
const ErrorView = lazy(() => import("./components/ErrorView"));
const KnowledgeGraph = lazy(() => import("./blueprint/BlueprintKnowledgeView"));
const ProfileView = lazy(() => import("./components/ProfileView"));
const StudentAssessmentView = lazy(() => import("./blueprint/BlueprintReportView"));
const AssignmentView = lazy(() => import("./components/AssignmentView"));
const RankingView = lazy(() => import("./blueprint/BlueprintRankingView"));
const SettingsView = lazy(() => import("./blueprint/BlueprintSettingsView"));

interface QuizPrefill {
  subject?: string;
  knowledgePoint?: string;
}
interface ResourcePrefill {
  resourceType?: string;
  title?: string;
  reason?: string;
  knowledgePointId?: string;
  subject?: string;
  stageKey?: string;
  pathVersion?: number;
}

const TAB_PATHS: Record<string, string> = {
  dashboard: "/student",
  mentor: "/student/mentor",
  resource: "/student/resources",
  knowledge: "/student/knowledge",
  path: "/student/path",
  quiz: "/student/quiz",
  codelab: "/student/codelab",
  errors: "/student/errors",
  analytics: "/student/profile",
  report: "/student/report",
  assignment: "/student/assignments",
  ranking: "/student/ranking",
  settings: "/student/settings",
};

function getInitialTabFromPath() {
  if (typeof window === "undefined") return "dashboard";

  const pathname = window.location.pathname.toLowerCase();
  // 根路径等同于学习首页：登录状态下打开站点根地址时不再落到「页面未找到」
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname === TAB_PATHS.codelab || pathname.startsWith(`${TAB_PATHS.codelab}/`)) {
    return "codelab";
  }
  if (pathname.startsWith(`${TAB_PATHS.assignment}/`)) {
    return "assignment";
  }

  const match = Object.entries(TAB_PATHS).find(([, path]) => path.toLowerCase() === pathname);
  return match ? match[0] : "not-found";
}

function getCurrentLocationPath() {
  if (typeof window === "undefined") return TAB_PATHS.dashboard;
  return `${window.location.pathname}${window.location.search}`;
}

function getQuizPrefillFromLocation(): QuizPrefill | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const subject = params.get("subject") || undefined;
  const knowledgePoint = params.get("knowledgePoint") || undefined;

  return subject || knowledgePoint ? { subject, knowledgePoint } : null;
}

function getAssignmentIdFromLocation(): number | null {
  if (typeof window === "undefined") return null;
  const matched = /^\/student\/assignments\/(\d+)$/.exec(window.location.pathname.toLowerCase());
  if (!matched) return null;
  const id = Number(matched[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function buildStudentUrl(tab: string, prefillData?: any) {
  const path = TAB_PATHS[tab] || TAB_PATHS.dashboard;
  if (tab === "assignment") {
    return typeof prefillData === "number" && prefillData > 0 ? `${path}/${prefillData}` : path;
  }
  /* 知识图谱是两页结构：
       /student/knowledge                               → 页面A 知识导图列表
       /student/knowledge?view=graph&subject=X&focus=Y  → 页面B 力导向知识网络
       subject 限定课程范围，focus 让网络图以该知识点/章节为中心展开 */
  if (tab === "knowledge") {
    const params = new URLSearchParams();
    const view = typeof prefillData === "object" ? prefillData?.view : undefined;
    const subject = typeof prefillData === "object" ? prefillData?.subject : undefined;
    const focus = typeof prefillData === "object" ? prefillData?.focus : undefined;
    if (view) params.set("view", String(view));
    if (subject) params.set("subject", String(subject));
    if (focus) params.set("focus", String(focus));
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }
  if (tab !== "quiz") {
    return path;
  }

  const params = new URLSearchParams();
  const subject = typeof prefillData === "object" ? prefillData?.subject : undefined;
  const knowledgePoint =
    typeof prefillData === "object"
      ? prefillData?.knowledgePoint
      : typeof prefillData === "string"
        ? prefillData
        : undefined;

  if (subject) params.set("subject", subject);
  if (knowledgePoint) params.set("knowledgePoint", knowledgePoint);

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(() => Boolean(getAuthToken()));
  const [authView, setAuthView] = useState<"login" | "register">(() => getInitialAuthView());
  const [registrationUsername, setRegistrationUsername] = useState("");
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const isLoggedIn = Boolean(currentUser);
  const studentName = currentUser?.displayName || "同学";

  // Core Global States
  const [profile, setProfile] = useState<UserProfile>({
    name: "同学",
    proficiency: 0,
    totalHours: 0,
    completionRate: 0,
    knowledgeCoverage: 0,
    streak: 0,
    testsTaken: 0,
    pendingTasks: 0,
    weakPointsCount: 0,
    extraPoints: 0,
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);

  // Navigations
  const [activeTab, setActiveTab] = useState<string>(() => getInitialTabFromPath());
  const [currentPath, setCurrentPath] = useState<string>(() => getCurrentLocationPath());
  const [prefillPrompt, setPrefillPrompt] = useState<string | null>(null);
  const [quizPrefill, setQuizPrefill] = useState<QuizPrefill | null>(() => getQuizPrefillFromLocation());
  const [assignmentPrefill, setAssignmentPrefill] = useState<number | null>(() =>
    getAssignmentIdFromLocation(),
  );
  const [resourcePrefill, setResourcePrefill] = useState<ResourcePrefill | null>(null);

  // 登录成功后、进入正式页面前播全屏 logo 开场（reduced-motion 跳过；不再是每次打开都播）
  const [introVisible, setIntroVisible] = useState(false);

  const handleLogin = async (identifier: string, password: string) => {
    const result = await loginRequest(identifier, password);
    setCurrentUser(result.user);
    setAuthLoading(false);
    setProfile((prev) => ({ ...prev, name: result.user.displayName }));
    setActiveTab("dashboard");
    setCurrentPath(TAB_PATHS.dashboard);
    if (typeof window !== "undefined") window.history.replaceState(null, "", TAB_PATHS.dashboard);
    // 登录成功：播全屏 logo 开场作为进入正式页面的过渡（reduced-motion 跳过）
    try {
      if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setIntroVisible(true);
      }
    } catch {
      /* 忽略 */
    }
  };

  const showRegister = () => {
    setRegistrationComplete(false);
    setAuthView("register");
    if (typeof window !== "undefined") window.history.pushState(null, "", "/register");
  };

  const returnToLogin = (username = "", completed = false) => {
    setRegistrationUsername(username);
    setRegistrationComplete(completed);
    setAuthView("login");
    setActiveTab("dashboard");
    setCurrentPath(TAB_PATHS.dashboard);
    if (typeof window !== "undefined") window.history.pushState(null, "", TAB_PATHS.dashboard);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab("dashboard");
    setCurrentPath(TAB_PATHS.dashboard);
    setQuizPrefill(null);
    setPrefillPrompt(null);
    setResourcePrefill(null);

    if (typeof window !== "undefined") {
      clearAuth();
      window.history.pushState(null, "", TAB_PATHS.dashboard);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const leaveAuthenticatedShell = () => {
      clearAuth();
      if (cancelled) return;
      setCurrentUser(null);
      setAuthLoading(false);
      window.history.replaceState(null, "", TAB_PATHS.dashboard);
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, leaveAuthenticatedShell);
    if (!getAuthToken()) {
      setAuthLoading(false);
    } else {
      getCurrentUser()
        .then((user) => {
          if (!cancelled) setCurrentUser(user);
        })
        .catch(leaveAuthenticatedShell)
        .finally(() => {
          if (!cancelled) setAuthLoading(false);
        });
    }
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, leaveAuthenticatedShell);
    };
  }, []);

  // 地址栏规范化：根路径登录后自动改为 /student，刷新也不会再出现未找到
  useEffect(() => {
    if (!isLoggedIn || typeof window === "undefined") return;
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === "/" || pathname === "") {
      window.history.replaceState(null, "", TAB_PATHS.dashboard);
      setCurrentPath(TAB_PATHS.dashboard);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    setProfile((prev) => ({ ...prev, name: studentName }));
  }, [studentName]);

  /* 切页后刷新滚动触发器的测量:懒加载页面晚挂载的 data-reveal
     由各页面自己的 RevealOnScroll 接管,这里只负责刷新既有 ScrollTrigger */
  useEffect(() => {
    if (typeof window === "undefined") return;
    refreshScrollTriggers();
  }, [activeTab]);

  useEffect(() => {
    if (!currentUser) return;
    apiRequest<ProfileResponse>("/api/profile/me")
      .then((data) => {
        const mastery = data.profile.knowledgeMastery;
        const average = mastery.length
          ? Math.round(mastery.reduce((sum, item) => sum + item.mastery, 0) / mastery.length)
          : 0;
        setProfile((prev) => ({
          ...prev,
          name: currentUser.displayName,
          proficiency: average,
          knowledgeCoverage: average,
          weakPointsCount: mastery.filter((item) => item.mastery < 60).length,
          testsTaken: mastery.reduce((sum, item) => sum + item.practiceCount, 0),
        }));
        setWeakPoints(
          mastery
            .filter((item) => item.mastery < 60)
            .map((item, index) => ({
              id: `api-${index}`,
              name: item.knowledgePoint,
              level: item.mastery < 40 ? "High" : "Medium",
              count: item.wrongCount,
              course: item.subject,
              remediationProgress: item.mastery,
            })),
        );
        const bySubject = new Map<string, typeof mastery>();
        mastery.forEach((item) => {
          const subject = item.subject.trim() || "未分类课程";
          bySubject.set(subject, [...(bySubject.get(subject) || []), item]);
        });
        setCourses(
          Array.from(bySubject.entries()).map(([subject, records], index) => ({
            id: `subject-${encodeURIComponent(subject)}`,
            name: subject,
            code: `COURSE-${index + 1}`,
            proficiency: Math.round(records.reduce((sum, item) => sum + item.mastery, 0) / records.length),
            totalHours: 0,
            completionRate: 0,
            color: ["blue", "sky", "emerald", "rose"][index % 4],
          })),
        );
      })
      .catch(() => undefined);
  }, [currentUser]);

  useEffect(() => {
    const handlePopState = () => {
      setAuthView(getInitialAuthView());
      setActiveTab(getInitialTabFromPath());
      setCurrentPath(getCurrentLocationPath());
      setQuizPrefill(getQuizPrefillFromLocation());
      setAssignmentPrefill(getAssignmentIdFromLocation());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Deep-linking navigation across tabs with optional prefilled prompts
  const handleNavigateToTab = (tab: string, prefillData?: any) => {
    setActiveTab(tab);
    if (prefillData && typeof prefillData === "string") {
      setPrefillPrompt(prefillData);
    }
    if (tab === "quiz") {
      if (prefillData && typeof prefillData === "object") {
        setQuizPrefill({
          subject: prefillData.subject,
          knowledgePoint: prefillData.knowledgePoint,
        });
      } else if (typeof prefillData === "string") {
        setQuizPrefill({ knowledgePoint: prefillData });
      } else {
        setQuizPrefill(null);
      }
    }
    if (tab === "resource" && prefillData && typeof prefillData === "object") {
      setResourcePrefill(prefillData);
    }
    if (tab === "assignment") {
      setAssignmentPrefill(typeof prefillData === "number" && prefillData > 0 ? prefillData : null);
    }
    if (typeof window !== "undefined") {
      const nextUrl = buildStudentUrl(tab, prefillData);
      window.history.pushState(null, "", nextUrl);
      setCurrentPath(nextUrl);
    }
  };

  const handleNavigateToCodeLabPath = (exerciseId?: string) => {
    const nextUrl = exerciseId ? `${TAB_PATHS.codelab}/${encodeURIComponent(exerciseId)}` : TAB_PATHS.codelab;

    setActiveTab("codelab");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", nextUrl);
      setCurrentPath(nextUrl);
    }
  };

  // Handle study hour increments on completion of focus blocks
  const handleFocusComplete = (minutes: number) => {
    setProfile((prev) => ({
      ...prev,
      totalHours: Number((prev.totalHours + minutes / 60).toFixed(2)),
    }));
    // 静默上报专注时长（折线图数据源），失败不打断计时器
    void postFocusSession(minutes).catch(() => undefined);
  };

  let view: ReactNode;
  if (authLoading) {
    view = (
      <main className="lm-auth-loading" id="main-content">
        <AsyncState
          kind="loading"
          title="正在恢复登录状态"
          description="正在确认你的学生账号，完成后会回到上次访问的学习页面。"
        />
      </main>
    );
  } else if (!isLoggedIn) {
    view =
      authView === "register" ? (
        <RegisterPage onBackToLogin={returnToLogin} />
      ) : (
        <Portal
          onLogin={handleLogin}
          onRegister={showRegister}
          initialUsername={registrationUsername}
          registrationComplete={registrationComplete}
          introLocked={introVisible}
        />
      );
  } else {
    view = (
      <>
        <ScrollProgressBar />
        <AppShell
          activeTab={activeTab}
          studentName={studentName}
          onNavigate={handleNavigateToTab}
          onLogout={handleLogout}
        >
          <ChunkErrorBoundary resetKey={currentPath}>
            <div key={activeTab} className="lm-page-transition">
              <Suspense
                fallback={
                  <AsyncState
                    kind="loading"
                    title="正在打开学习页面"
                    description="工作台导航仍可使用，当前页面内容加载完成后会显示在这里。"
                  />
                }
              >
                {activeTab === "dashboard" && <Dashboard onNavigateToTab={handleNavigateToTab} />}

                {activeTab === "mentor" && (
                  <MentorView
                    initialPrompt={prefillPrompt}
                    onClearPrefill={() => setPrefillPrompt(null)}
                    onNavigateToProfile={() => handleNavigateToTab("analytics")}
                  />
                )}

                {(activeTab === "quiz" || activeTab === "codelab") && (
                  <QuizView
                    initialMode={activeTab === "codelab" ? "code" : "quiz"}
                    routePath={currentPath}
                    onNavigateToTab={handleNavigateToTab}
                    onNavigateToExercise={handleNavigateToCodeLabPath}
                    onNavigateToCodeList={() => handleNavigateToCodeLabPath()}
                    prefill={quizPrefill}
                  />
                )}

                {activeTab === "resource" && (
                  <ResourceView
                    onNavigateToTab={handleNavigateToTab}
                    initialRecommendation={resourcePrefill}
                  />
                )}

                {activeTab === "knowledge" &&
                  (() => {
                    const knowledgeParams = new URLSearchParams(currentPath.split("?")[1] || "");
                    return (
                      <KnowledgeGraph
                        courses={courses}
                        weakPoints={weakPoints}
                        onNavigateToTab={handleNavigateToTab}
                        subject={knowledgeParams.get("subject") || ""}
                        focus={knowledgeParams.get("focus") || ""}
                      />
                    );
                  })()}

                {activeTab === "path" && (
                  <PathView
                    courses={courses}
                    weakPoints={weakPoints}
                    onNavigateToTab={handleNavigateToTab}
                    onNavigateToExercise={handleNavigateToCodeLabPath}
                  />
                )}

                {activeTab === "analytics" && <ProfileView onNavigateToTab={handleNavigateToTab} />}

                {activeTab === "errors" && <ErrorView onNavigateToTab={handleNavigateToTab} />}

                {activeTab === "report" && <StudentAssessmentView onNavigateToTab={handleNavigateToTab} />}

                {activeTab === "ranking" && <RankingView onNavigateToTab={handleNavigateToTab} />}

                {activeTab === "settings" && (
                  <SettingsView onNavigateToTab={handleNavigateToTab} onLogout={handleLogout} />
                )}

                {activeTab === "assignment" && (
                  <AssignmentView
                    onNavigateToTab={handleNavigateToTab}
                    initialAssignmentId={assignmentPrefill}
                  />
                )}

                {activeTab === "not-found" && (
                  <AsyncState
                    kind="empty"
                    title="没有找到这个学习页面"
                    description="地址可能已失效，现有学习记录和登录状态都没有改变。"
                    preserved="你可以返回学习首页，再从导航进入需要的功能。"
                    action={{ label: "返回学习首页", onClick: () => handleNavigateToTab("dashboard") }}
                  />
                )}
              </Suspense>
            </div>
          </ChunkErrorBoundary>
        </AppShell>
        {activeTab !== "quiz" && activeTab !== "codelab" && activeTab !== "report" && (
          <FocusTimer onFocusComplete={handleFocusComplete} />
        )}
      </>
    );
  }

  return (
    <>
      {view}
      {introVisible && (
        <LogoIntro
          subtitle="智课研伴 · 学生学习工作台"
          /* 登录页有 .lm-login-hero__mark，登录后是侧栏 .bp-brand__mark：
             两个都写进选择器，落在哪个页面上都能准确贴合（querySelector 取文档中第一个命中的） */
          dockTarget=".lm-login-hero__mark .lm-logo-reveal, .bp-brand__mark .lm-logo-reveal"
          onDone={() => setIntroVisible(false)}
        />
      )}
    </>
  );
}

function getInitialAuthView(): "login" | "register" {
  if (typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/register")
    return "register";
  return "login";
}
