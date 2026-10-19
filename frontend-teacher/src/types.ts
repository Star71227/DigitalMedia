/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
export type Role = "STUDENT" | "TEACHER" | "ADMIN";
export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  studentId?: number;
  teacherId?: number;
}
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}
export interface Risk {
  level: "high" | "medium" | "low";
  reasons: string[];
}
export interface StudentCard {
  studentId: number;
  username: string;
  displayName: string;
  classId: number;
  className: string;
  currentCourse?: string;
  profileVersion: number;
  pathVersion: number;
  pathProgress: number | null;
  recentQuizAccuracy: number | null;
  weakKnowledgePoints: Array<{ knowledgePoint: string; mastery: number }>;
  topErrorPatterns: Array<{ errorType: string; occurrenceCount: number }>;
  lastActivityAt?: string | null;
  risk: Risk;
}
export interface ClassItem {
  id: number;
  className: string;
  subject: string;
  description?: string;
  teacherName: string;
  studentCount: number;
}
export interface TeacherStudyAttendance {
  days: number;
  summary: {
    studentCount: number;
    checkedInStudentCount: number;
    checkInTotal: number;
    studyMinutesTotal: number;
  };
  daily: Array<{ date: string; checkInCount: number; studyMinutes: number }>;
  students: Array<{
    studentId: number;
    username: string;
    displayName: string;
    className: string;
    checkInDays: number;
    studyMinutes: number;
  }>;
}
export interface ReportItem {
  id: number;
  studentId: number;
  studentName?: string;
  reportVersion: number;
  reportType: string;
  rangeDays: number;
  status: string;
  checksumSha256?: string;
  fileSize?: number;
  createdAt: string;
  report?: {
    student?: { displayName: string; className?: string; username?: string; currentCourse?: string | null };
    riskAssessment?: { level: string; reasons?: string[]; score?: number | null };
    quizAnalysis?: {
      averageAccuracy: number | null;
      attemptCount?: number;
      answeredQuestionCount?: number;
      correctQuestionCount?: number;
      accuracyDistribution?: Array<{ label: string; count: number }>;
      recentAttempts?: Array<{
        subject?: string | null;
        submittedAt?: string | null;
        score?: number | null;
        totalCount: number;
        correctCount: number;
        accuracy: number | null;
      }>;
    };
    executiveSummary?: string;
    masteryAnalysis?: {
      averageMastery: number | null;
      knowledgePointCount?: number;
      masteredCount?: number;
      developingCount?: number;
      weakCount?: number;
      topMastery?: Array<{
        knowledgePoint: string;
        subject: string;
        mastery: number;
        wrongCount?: number;
        practiceCount?: number;
      }>;
    };
    errorProfile?: {
      patternCount?: number;
      typeBreakdown?: Array<{ errorType: string; occurrenceCount: number }>;
      topPatterns?: Array<{
        errorType: string;
        knowledgePoint: string;
        occurrenceCount: number;
        confidence?: number;
        lastSeenAt?: string | null;
      }>;
    };
    pathAnalysis?: {
      progress: number | null;
      currentVersion: number;
      stageCount?: number;
      completedStageCount?: number;
      stages?: Array<{
        key: string | null;
        title: string | null;
        subject?: string | null;
        durationMinutes?: number | null;
        completionType?: string | null;
        evidenceCount?: number;
        goals?: string[];
        knowledgePoints?: string[];
        progress: number;
        completedAt?: string | null;
        status: string;
      }>;
    };
    profileAnalysis?: { currentVersion: number; historyCount?: number };
    resourceAnalysis?: {
      completedCount: number;
      resourceCount?: number;
      inProgressCount?: number;
      typeBreakdown?: Array<{ type: string; total: number; completed: number; inProgress: number }>;
    };
    ragActivity?: { retrievalCount: number; citationAnswerCount?: number };
    evidence?: {
      answeredCount: number;
      correctCount: number;
      masteredCount?: number;
      weakCount?: number;
      developingCount?: number;
    };
    knowledgePoints?: Array<{ knowledgePoint: string; subject: string; mastery: number }>;
    actionPlan?: Array<{
      priority: number;
      knowledgePoint: string;
      mastery?: number | null;
      action: string;
      target: string;
      review: string;
    }>;
    dataQuality?: { note: string; gaps: string[] };
    dataSources?: string[];
    progressHighlights?: string[];
    weaknesses?: string[];
    recommendations?: string[];
    summary?: { activeRecords?: number };
    reportMeta?: { teacherId?: number; reportType?: string; reportVersion?: number; rangeDays?: number };
    generatedAt?: string;
  };
}
export interface ClassSummary {
  id: number;
  className: string;
  subject: string;
  description?: string | null;
  status?: string;
  teacherId?: number;
  studentCount: number;
}
export interface ClassMember {
  studentId: number;
  username: string;
  studentNo: string;
  displayName: string;
  joinedAt?: string | null;
}
export interface ClassJoinRequest {
  requestId: number;
  classId: number;
  className: string;
  subject: string;
  teacherId: number;
  teacherName: string;
  teacherUsername: string;
  studentId: number;
  studentName: string;
  studentUsername: string;
  studentNo: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  message?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}
export interface ClassCandidate {
  studentId: number;
  username: string;
  studentNo: string;
  displayName: string;
  inThisClass: boolean;
}
// These contracts follow the existing server response, including SQL column names.
export interface Aggregate {
  name: string;
  value: number;
  count: number;
}
export interface TrendPoint {
  date: string;
  accuracy: number | null;
  activeStudents: number;
}
export interface DashboardOverview {
  teacher: User & { classCount: number };
  summary: {
    managedStudentCount: number;
    activeStudentCount7d: number;
    averageQuizAccuracy: number | null;
    averagePathProgress: number | null;
    completedResourceCount: number;
    highRiskStudentCount: number;
  };
  recentActivity: StudentCard[];
  topWeaknesses: Aggregate[];
  errorPatternDistribution: Aggregate[];
}
export interface ClassAnalytics {
  class: { id: number; className: string; subject: string };
  summary: {
    studentCount: number;
    activeStudentCount: number;
    averageQuizAccuracy: number | null;
    averagePathProgress: number | null;
  };
  trends: Array<{ date: string; accuracy: number | null }>;
  radar: Array<{ knowledgePoint: string; mastery: number | null }>;
  weaknesses: Aggregate[];
  errorPatternDistribution: Aggregate[];
  masteryMatrix: Array<{
    studentId: number;
    displayName: string;
    values: Array<{ knowledgePoint: string; mastery: number; grade: string }>;
  }>;
  riskDistribution: Array<{ level: string; count: number }>;
}
export interface PathSnapshot {
  stages: Array<{ key: string; title: string; subject: string; knowledgePoints: string[] }>;
}
export interface PathVersion {
  version: number;
  title: string;
  change_reason: string;
  created_at: string;
  snapshot: PathSnapshot;
}
export interface StudentDetail {
  student: Pick<StudentCard, "studentId" | "displayName" | "classId" | "className" | "currentCourse">;
  profile: { currentVersion: number; snapshot: Record<string, unknown> | null };
  path: {
    currentVersion: number;
    progress: number | null;
    snapshot: PathSnapshot | null;
    versions: PathVersion[];
  };
  risk: Risk;
  mastery: Array<{ subject: string; knowledgePoint: string; mastery: number }>;
  errorPatterns: Array<{ errorType: string; knowledgePoint: string; occurrenceCount: number }>;
  quizTrend: QuizAttempt[];
  resources: Array<{
    id: number;
    title: string;
    resource_type: string;
    current_version: number;
    stage_key: string;
    path_version: number;
    status: string;
    progress_status: string | null;
    progress_percent: number | null;
  }>;
  retrievalActivity: Array<{
    id: number;
    subject: string;
    knowledge_point: string;
    query_text: string;
    retrieval_strategy: string;
    result_count: number;
    created_at: string;
  }>;
  recentActivity: Array<{ event_type: string; created_at: string; subject: string; knowledge_point: string }>;
  citationAnswerCount: number;
  recommendations: string[];
}
export interface QuizAttempt {
  id: number;
  student_id: number;
  display_name?: string;
  subject: string;
  correct_count: number;
  total_count: number;
  submitted_at: string;
}
export interface QuizAnalytics {
  summary: { attemptCount: number; participantCount: number; averageAccuracy: number | null };
  recentAttempts: QuizAttempt[];
  accuracyDistribution: Array<{ score_range: string; count: number }>;
  frequentWrongKnowledgePoints: Array<{ knowledge_point: string; wrong_count: number }>;
  /** 每个知识点的答题量与正确率（雷达图数据源），按答题量取前 8 个。 */
  knowledgePointStats?: Array<{
    knowledgePoint: string;
    answerCount: number;
    correctCount: number;
    accuracy: number | null;
  }>;
  /** 按题目难度统计的答题正确率（饼图旁的分档说明）。 */
  difficultyStats?: Array<{
    difficulty: string;
    answerCount: number;
    correctCount: number;
    accuracy: number | null;
  }>;
  /** 总体答题结果：总作答数、正确数、错误数。 */
  answerOutcome?: { total: number; correct: number; wrong: number };
  pagination: Pagination;
  codeLab: { available: boolean; message: string };
}
export interface AgentLog {
  id: number;
  agentName: string;
  taskType: string;
  status: string;
  duration: number;
  source: string;
  createdAt: string;
  inputSummary: string;
  outputSummary: string;
  errorSummary: string | null;
  relatedStudentId: number | null;
  relatedResourceId: number | null;
  relatedPathVersion: number | null;
}
export interface GeneratedResource {
  resource: {
    id: number;
    title: string;
    version: number;
    status: string;
    sourceMode?: string;
    review?: { modelReviewExecuted?: boolean; modelReviewStatus?: string };
  };
  audit: { requestedByTeacherId: number; teacherNoteRecorded: boolean };
}
