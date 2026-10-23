/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { lazy, Suspense, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireTeacher } from "./auth/RequireTeacher";
import ChunkErrorBoundary from "./components/ChunkErrorBoundary";
import { Layout } from "./components/Layout";
import { navigate } from "./router";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import LogoIntro from "./components/LogoIntro";
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const StudentsPage = lazy(() =>
  import("./pages/StudentsPage").then((module) => ({ default: module.StudentsPage })),
);
const StudentDetailPage = lazy(() =>
  import("./pages/StudentDetailPage").then((module) => ({ default: module.StudentDetailPage })),
);
const ClassesPage = lazy(() =>
  import("./pages/ClassesPage").then((module) => ({ default: module.ClassesPage })),
);
const ClassStudentsPage = lazy(() =>
  import("./pages/ClassStudentsPage").then((module) => ({ default: module.ClassStudentsPage })),
);
const ClassRequestsPage = lazy(() =>
  import("./pages/ClassRequestsPage").then((module) => ({ default: module.ClassRequestsPage })),
);
const ClassAnalyticsPage = lazy(() =>
  import("./pages/ClassAnalyticsPage").then((module) => ({ default: module.ClassAnalyticsPage })),
);
const ResourcesPage = lazy(() =>
  import("./pages/ResourcesPage").then((module) => ({ default: module.ResourcesPage })),
);
const QuizAnalyticsPage = lazy(() =>
  import("./pages/QuizAnalyticsPage").then((module) => ({ default: module.QuizAnalyticsPage })),
);
const AssignmentsPage = lazy(() =>
  import("./pages/AssignmentsPage").then((module) => ({ default: module.AssignmentsPage })),
);
const AssignmentDetailPage = lazy(() =>
  import("./pages/AssignmentDetailPage").then((module) => ({ default: module.AssignmentDetailPage })),
);
const QuestionBankPage = lazy(() =>
  import("./pages/QuestionBankPage").then((module) => ({ default: module.QuestionBankPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })),
);
const ReportDetailPage = lazy(() =>
  import("./pages/ReportsPage").then((module) => ({ default: module.ReportDetailPage })),
);
const AgentLogsPage = lazy(() =>
  import("./pages/AgentLogsPage").then((module) => ({ default: module.AgentLogsPage })),
);
export default function App() {
  // 登录成功后、进入正式页面前播全屏 logo 开场（reduced-motion 跳过；不再是每次打开都播）
  const [introVisible, setIntroVisible] = useState(false);
  return (
    <>
      <AuthProvider>
        <Routes
          introLocked={introVisible}
          onLoginSuccess={() => {
            try {
              if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setIntroVisible(true);
            } catch {
              /* 忽略 */
            }
          }}
        />
      </AuthProvider>
      {introVisible && (
        <LogoIntro
          subtitle="寻笺 · 教师工作台"
          /* 登录页有 .lm-login-hero__mark，登录后是侧栏 .teacher-brand-monogram：
             两个都写进选择器，落在哪个页面上都能准确贴合 */
          dockTarget=".lm-login-hero__mark .lm-logo-reveal, .teacher-brand-monogram .lm-logo-reveal"
          onDone={() => setIntroVisible(false)}
        />
      )}
    </>
  );
}
function Routes({
  introLocked = false,
  onLoginSuccess,
}: {
  introLocked?: boolean;
  onLoginSuccess?: () => void;
}) {
  const [path, setPath] = useState(window.location.pathname),
    { user, loading } = useAuth();
  useEffect(() => {
    const change = () => setPath(window.location.pathname);
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  useEffect(() => {
    if (!loading && path === "/")
      navigate(user && ["TEACHER", "ADMIN"].includes(user.role) ? "/dashboard" : "/login", true);
    if (!loading && path === "/login" && user && ["TEACHER", "ADMIN"].includes(user.role))
      navigate("/dashboard", true);
    if (!loading && path === "/register" && user && ["TEACHER", "ADMIN"].includes(user.role))
      navigate("/dashboard", true);
  }, [loading, path, user]);
  if (path === "/") return null;
  if (path === "/login") return <LoginPage introLocked={introLocked} onLoginSuccess={onLoginSuccess} />;
  if (path === "/register") return <RegisterPage />;
  let page: React.ReactNode;
  if (path === "/class-requests") page = <ClassRequestsPage />;
  else if (path === "/dashboard") page = <DashboardPage />;
  else if (path === "/students") page = <StudentsPage />;
  else if (/^\/students\/\d+$/.test(path))
    page = <StudentDetailPage studentId={Number(path.split("/")[2])} />;
  else if (path === "/classes") page = <ClassesPage />;
  else if (/^\/classes\/\d+\/analytics$/.test(path))
    page = <ClassAnalyticsPage classId={Number(path.split("/")[2])} />;
  else if (/^\/classes\/\d+\/students$/.test(path))
    page = <ClassStudentsPage classId={Number(path.split("/")[2])} />;
  else if (path === "/resources") page = <ResourcesPage />;
  else if (path === "/quizzes") page = <QuizAnalyticsPage />;
  else if (path === "/assignments") page = <AssignmentsPage />;
  else if (path === "/question-bank") page = <QuestionBankPage />;
  else if (/^\/assignments\/\d+$/.test(path))
    page = <AssignmentDetailPage assignmentId={Number(path.split("/")[2])} />;
  else if (path === "/reports") page = <ReportsPage />;
  else if (/^\/reports\/\d+$/.test(path)) page = <ReportDetailPage reportId={Number(path.split("/")[2])} />;
  else if (path === "/agent-logs") page = <AgentLogsPage />;
  else page = <div className="rounded-2xl border bg-white p-10 text-center">页面不存在</div>;
  return (
    <RequireTeacher>
      <Layout path={path}>
        <ChunkErrorBoundary resetKey={path}>
          <Suspense
            fallback={
              <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">
                正在加载页面…
              </div>
            }
          >
            {page}
          </Suspense>
        </ChunkErrorBoundary>
      </Layout>
    </RequireTeacher>
  );
}
