/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type {
  DashboardOverview,
  TrendPoint,
  ClassAnalytics,
  StudentDetail,
  QuizAnalytics,
  AgentLog,
  GeneratedResource,
  TeacherStudyAttendance,
} from "../types";
import { api, download } from "./client";
import type {
  ClassCandidate,
  ClassItem,
  ClassJoinRequest,
  ClassMember,
  ClassSummary,
  Pagination,
  ReportItem,
  StudentCard,
} from "../types";
const qs = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
};
export const teacherApi = {
  dashboard: () => api<DashboardOverview>("/teacher/dashboard/overview"),
  trends: (range = "30d") =>
    api<{ range: string; data: TrendPoint[] }>(`/teacher/dashboard/trends${qs({ range })}`),
  studyAttendance: () => api<TeacherStudyAttendance>("/teacher/study-attendance?days=30"),
  classes: () => api<{ data: ClassItem[] }>("/teacher/classes"),
  classAnalytics: (id: number, range = "30d") =>
    api<ClassAnalytics>(`/teacher/classes/${id}/analytics${qs({ range })}`),
  students: (params: Record<string, unknown>) =>
    api<{ data: StudentCard[]; pagination: Pagination }>(`/teacher/students${qs(params)}`),
  studentDetail: (id: number) => api<StudentDetail>(`/teacher/students/${id}/detail`),
  generateResource: (studentId: number, body: Record<string, unknown>) =>
    api<GeneratedResource>(`/teacher/students/${studentId}/resources/generate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  quizAnalytics: (params: Record<string, unknown> = {}) =>
    api<QuizAnalytics>(`/teacher/quiz-analytics${qs(params)}`),
  agentLogs: (params: Record<string, unknown> = {}) =>
    api<{ data: AgentLog[]; pagination: Pagination }>(`/teacher/agent-logs${qs(params)}`),
  createClass: (body: Record<string, unknown>) =>
    api<{ class: ClassSummary }>("/teacher/classes", { method: "POST", body: JSON.stringify(body) }),
  classStudents: (id: number) =>
    api<{ class: ClassSummary; data: ClassMember[] }>(`/teacher/classes/${id}/students`),
  searchStudents: (keyword: string, classId?: number) =>
    api<{ data: ClassCandidate[]; hint?: string }>(`/teacher/students/search${qs({ keyword, classId })}`),
  addClassStudent: (id: number, body: Record<string, unknown>) =>
    api<{ class: ClassSummary; member: ClassMember }>(`/teacher/classes/${id}/students`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  removeClassStudent: (id: number, studentId: number) =>
    api<{ class: ClassSummary; removedStudentId: number }>(`/teacher/classes/${id}/students/${studentId}`, {
      method: "DELETE",
    }),
  classRequests: (params: Record<string, unknown> = {}) =>
    api<{ data: ClassJoinRequest[]; counts: Record<string, number> }>(`/teacher/class-requests${qs(params)}`),
  reviewClassRequest: (id: number, decision: "approve" | "reject", note: string) =>
    api<{ request: ClassJoinRequest }>(`/teacher/class-requests/${id}/${decision}`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  reports: (params: Record<string, unknown> = {}) =>
    api<{ data: ReportItem[]; pagination: Pagination }>(`/teacher/reports${qs(params)}`),
  report: (id: number) => api<ReportItem>(`/teacher/reports/${id}`),
  createReport: (studentId: number, body: Record<string, unknown>) =>
    api<ReportItem>(`/teacher/students/${studentId}/reports`, { method: "POST", body: JSON.stringify(body) }),
  downloadReport: (item: ReportItem) =>
    download(
      `/teacher/reports/${item.id}/download`,
      `${item.studentName || "学生"}-学习评估-v${item.reportVersion}.pdf`,
    ),
};
