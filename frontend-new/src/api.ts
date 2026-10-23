/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type {
  AgentTaskDescriptions,
  ChatAnswer,
  ChatSession,
  ChatSessionListResponse,
  ChatSessionMessagesResponse,
  LearningPathResponse,
  LearningPathVersion,
} from "./types";

export interface AgentLogSummary {
  id: number | string;
  agent_label: string;
  task_label: string;
  status_label: string;
  input_summary: string;
  analysis_summary: string;
  output_summary: string;
  duration_ms: number;
  created_at: string;
}

export interface KnowledgeMasteryRecord {
  subject: string;
  knowledge_point: string;
  mastery: number;
  wrong_count: number;
  practice_count: number;
  last_updated?: string;
  /** 后端按别名表解析出的「知识图谱规范知识点名」，解析不到时为 null。 */
  knowledge_point_canonical?: string | null;
}

export interface WrongQuestionRecord {
  id: number | string;
  subject: string;
  knowledge_point: string;
  difficulty?: string;
  question_text: string;
  selected_answer?: string;
  correct_answer?: string;
  analysis?: string;
  error_reason?: string;
  feedback_suggestion?: string;
  recommended_action?: string;
  status?: string;
  updated_at?: string;
}

export interface CodeExercise {
  id?: number | string;
  exercise_id: string;
  subject: string;
  knowledge_point: string;
  title: string;
  description: string;
  language: string;
  difficulty: string;
  starter_code: string;
  sample_input: string;
  sample_output: string;
  /** 讲解含解法与答案：做题阶段不下发，正式提交后走 /solution 解锁。 */
  explanation?: string;
  tags?: string[] | string;
  /** 是否配置了隐藏用例（true 才是公开 + 隐藏的完整判题）。 */
  hidden_judge_available?: boolean;
  source?: string;
  /** Public run requires at least one configured public test case. */
  public_run_available: boolean;
  /** Formal submit requires a configured private judge with public and hidden tests. */
  submission_available: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CodeRunPayload {
  exerciseId: string;
  language: string;
  sourceCode: string;
  stdin?: string;
  runMode?: "custom" | "public";
}

export interface CodeRunResult {
  status:
    | "accepted"
    | "wrong_answer"
    | "compile_error"
    | "runtime_error"
    | "timeout"
    | "output_limit"
    | "internal_error"
    | string;
  stdout: string;
  stderr: string;
  compileOutput: string;
  time: string;
  memory: string;
  mode?: "run" | "submit" | string;
  executionMode?: string;
  /** public_and_hidden=完整判题；public_only=只按公开用例判定。 */
  judgedBy?: "public_and_hidden" | "public_only" | string;
  passedCount?: number;
  totalCount?: number;
  cases?: Array<{
    id: string;
    visibility: string;
    status: string;
    message?: string;
    durationMs: number;
    stdout?: string;
    stderr?: string;
  }>;
}

export function getCodeRunnerHealth(): Promise<{ available: boolean; reason: string; language: string }> {
  return apiRequest("/api/code/health");
}

export interface CodeSubmitPayload {
  exerciseId: string;
  language: string;
  sourceCode: string;
  idempotencyKey: string;
}

export interface CodeSubmission {
  id: number;
  exerciseId: string;
  language: string;
  mode: "run" | "submit";
  status: string;
  passedCount: number;
  totalCount: number;
  executionMode: string;
  result: CodeRunResult;
  createdAt?: string;
}

export interface CodeSubmitResult {
  submission: CodeSubmission;
  result: CodeRunResult;
  reused: boolean;
}

export interface CodeExplainPayload {
  exerciseId: string;
  sourceCode: string;
  stdout: string;
  stderr: string;
  compileOutput: string;
}

export interface CodeExplainResult {
  explanation: string;
}

const AUTH_TOKEN_KEY = "jizhi_auth_token";
const AUTH_USER_KEY = "jizhi_auth_user";
export const AUTH_UNAUTHORIZED_EVENT = "learnmate:student-unauthorized";

export interface AuthUser {
  id: number;
  studentId?: number;
  teacherId?: number;
  studentNo?: string | null;
  username: string;
  displayName: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export interface RegisterResult {
  success: true;
  message: string;
  user: { username: string; name: string; role: "STUDENT" };
}

export class ApiRequestError extends Error {
  status?: number;
  code?: string;
  requestId?: string;
  sessionId?: number;

  constructor(message: string, details: Partial<ApiRequestError> = {}) {
    super(message);
    this.name = "ApiRequestError";
    Object.assign(this, details);
  }
}

export interface LearningProfileDraft {
  majorAndGrade: { major: string; grade: string };
  currentCourse: string;
  priorKnowledge: string[];
  learningGoals: string[];
  explanationPreference: string;
  resourcePreferences: string[];
  paceAndTimeBudget: { pacePreference: string; weeklyTimeBudgetMinutes: number | null };
}

export type ProfileFieldKey = keyof LearningProfileDraft;

export interface ProfileFieldMeta {
  confidence?: number;
  evidence?: string;
  source?: string;
}

export interface CompleteLearningProfile extends LearningProfileDraft {
  knowledgeMastery: Array<{
    subject: string;
    knowledgePoint: string;
    mastery: number;
    wrongCount: number;
    practiceCount: number;
    updatedAt?: string;
  }>;
  errorPatterns: Array<{
    subject: string;
    knowledgePoint: string;
    errorType: string;
    occurrenceCount: number;
    confidence: number;
    evidence?: unknown;
    updatedAt?: string;
  }>;
}

export interface ProfileResponse {
  profile: CompleteLearningProfile;
  completeness: number;
  version: number;
  updatedAt: string | null;
  confirmedAt: string | null;
  fieldMeta: Record<string, ProfileFieldMeta>;
  evidenceSummary: Array<{ field: string; source?: string; confidence?: number; evidence?: string }>;
  latestChange: null | { version: number; reason: string; sourceType: string; createdAt: string };
}

export interface ProfileDialogueResponse {
  sessionId: string;
  status: "collecting" | "ready_for_confirmation" | "completed";
  assistantMessage: string;
  progress: number;
  missingFields: string[];
  currentDraft: LearningProfileDraft;
  fieldMeta: Record<string, ProfileFieldMeta>;
  profilePatch?: Partial<Record<ProfileFieldKey, { value: unknown; confidence: number; evidence: string }>>;
  modelAvailable?: boolean;
  messages?: Array<{ role: "assistant" | "user"; content: string; created_at?: string }>;
}

export interface QuizSubmissionResult {
  attemptId: number;
  score: number;
  correctCount: number;
  totalCount: number;
  questionResults: Array<{ questionId: string; isCorrect: boolean; correctAnswer: string; analysis: string }>;
  masteryChanges: Array<{
    knowledgePointId: string;
    knowledgePointName: string;
    before: number;
    after: number;
    delta: number;
    reason: string;
  }>;
  errorAttributions: Array<{
    knowledgePointId: string;
    knowledgePointName: string;
    errorType: string;
    label: string;
    confidence: number;
    evidence: string;
    suggestion: string;
  }>;
  profileUpdate: { previousVersion: number; currentVersion: number; changes: Array<Record<string, unknown>> };
  recommendations: Array<{
    resourceType: string;
    title: string;
    reason: string;
    priority: number;
    knowledgePointId: string;
    estimatedMinutes: number;
  }>;
}

export type QuizDifficulty = "basic" | "advanced" | "challenge";

export interface QuizPublicOption {
  key: string;
  content: string;
}

export interface QuizPublicQuestion {
  question_id: string;
  subject: string;
  chapter?: string | null;
  knowledge_point?: string | null;
  question_type?: string | null;
  difficulty?: string | null;
  stem: string;
  code_context?: string | null;
  options: QuizPublicOption[];
  hint?: string | null;
  ability_dimension?: string | null;
  tags?: string[];
}

export interface QuizSubmitAnswer {
  questionId: string;
  answer: string;
  durationSeconds: number;
}

export interface LearningEventSummary {
  type: string;
  text: string;
  time: string;
  eventType: string;
}

export interface StudentOverview {
  generatedAt: string;
  studentName: string;
  profile: {
    version: number;
    completeness: number;
    confirmedAt: string | null;
    currentCourse: string;
    overallMastery: number | null;
    weakPointCount: number;
    errorPatternCount: number;
  };
  courses: Array<{
    subject: string;
    mastery: number | null;
    practiceCount: number;
    wrongCount: number;
    knowledgePointCount: number;
  }>;
  quiz: {
    attemptCount: number;
    averageAccuracy: number | null;
    correctCount: number;
    answerCount: number;
    latestAt: string | null;
    recent: Array<{
      id: number;
      subject: string;
      score: number;
      correctCount: number;
      totalCount: number;
      submittedAt: string;
    }>;
  };
  path: null | { version: number; title: string; progress: number | null; stages: number };
  resources: {
    totalCount: number;
    completedCount: number;
    inProgressCount: number;
    latestAt: string | null;
    byType: ResourceTypeCounts;
  };
  codeLab: {
    submissionCount: number;
    successCount: number;
    successRate: number | null;
    latestAt: string | null;
  };
  recentActivities: Array<{ type: string; text: string; time: string }>;
}

export interface DailyCheckInSummary {
  todayCheckedIn: boolean;
  newlyCheckedIn?: boolean;
  currentStreak: number;
  totalCount: number;
  monthDays: Array<{ date: string; checked: boolean }>;
}

export interface StudyTimeSummary {
  days: Array<{ date: string; minutes: number }>;
}

export interface AssessmentConclusion {
  text: string;
  evidence: string[];
  knowledgePoint?: string | null;
  subject?: string | null;
}
export interface StudentAssessment {
  generatedAt: string;
  profileVersion: number;
  evidenceSufficient: boolean;
  evidenceCount: number;
  metrics: {
    overallMastery: number | null;
    pathProgress: number | null;
    completedResources: number;
    resourceCount: number;
    resourcesByType: ResourceTypeCounts;
    quiz: StudentOverview["quiz"];
    codeLab: StudentOverview["codeLab"];
  };
  mastery: Array<{
    subject: string;
    knowledgePoint: string;
    mastery: number | null;
    wrongCount: number;
    practiceCount: number;
    updatedAt?: string;
  }>;
  weaknesses: AssessmentConclusion[];
  errorPatterns: AssessmentConclusion[];
  strengths: AssessmentConclusion[];
  risks: AssessmentConclusion[];
  recommendations: AssessmentConclusion[];
  latestPersistedReport: null | { id: number; version: number; generatedAt: string };
  dataSources: string[];
}

export type LearningResourceType = "study_note" | "mind_map" | "pptx" | "quiz_pack" | "code_case";
export type ResourceReviewStatus = "approved" | "needs_revision" | "rejected";
export type ResourceProgressStatus =
  "not_started" | "opened" | "in_progress" | "completed" | "completed_unverified";
export type CodeCaseVerificationStatus = "verified" | "generated";

export type ResourceTypeCounts = Record<
  LearningResourceType,
  {
    generatedCount: number;
    completedCount: number;
    inProgressCount: number;
  }
>;

export interface QuizPackQuestion {
  questionId: string;
  questionType: string;
  stem: string;
  options: string[];
  scoringPoints?: string[];
  personalizedHint: string;
  knowledgePoints: string[];
  difficulty: "foundation" | "intermediate" | "advanced";
}

export interface QuizPackContent {
  title: string;
  difficultyDistribution: Record<"foundation" | "intermediate" | "advanced", number>;
  generationBasis: string[];
  questions: QuizPackQuestion[];
  evidenceStatus: "sufficient";
}

export interface CodeCaseContent {
  exerciseTitle?: string;
  caseBackground: string;
  learningObjectives: string[];
  language: string;
  starterCode: string;
  tasks: string[];
  inputDescription: string;
  outputDescription: string;
  testCases: Array<{ input: string; expectedOutput: string; description: string }>;
  boundaryConditions: string[];
  aiExplanation: string;
  commonErrors: string[];
  advancedChallenges: string[];
  verificationStatus: CodeCaseVerificationStatus;
  codeExerciseId: string | null;
  codeLabEntry?: { exerciseId: string; route: string } | null;
  sourceMode?: string;
  modelAvailable?: boolean;
  candidateCount?: number;
  selectedCandidateKey?: string;
  selectionReason?: string;
  knowledgeNotice?: string;
  qualitySummary?: {
    trusted: boolean;
    language: string;
    executionMode: string;
    publicTestCount: number;
    hiddenTestCount: number;
    boundaryCategories: string[];
    referenceAccepted: boolean;
    knownBugCaught: boolean;
    fixedOutputCaught: boolean;
    validatorVersion?: string;
    checkedAt?: string | null;
  };
}

export type LearningResourceContent = QuizPackContent | CodeCaseContent | Record<string, unknown>;

export interface LearningResourceReview {
  status: ResourceReviewStatus;
  score: number;
  summary: string;
  issues: Array<{
    severity?: string;
    category?: string;
    location?: string;
    message?: string;
    suggestedFix?: string;
  }>;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  totalScore?: number;
  passThreshold?: number;
  passed?: boolean;
  dimensions?: Array<{
    dimension: string;
    label: string;
    score: number;
    maxScore: number;
    status: string;
    evidence: Array<Record<string, unknown>>;
    issues: Array<Record<string, unknown>>;
    suggestions: string[];
  }>;
  ruleIssues?: Array<Record<string, unknown>>;
  modelIssues?: Array<Record<string, unknown>>;
  modelReviewExecuted?: boolean;
  modelReviewStatus?: string;
  reviewVersion?: string;
  reviewedAt?: string;
}

export type ResourceGenerationStage =
  | "queued"
  | "profile_analysis"
  | "learning_context_analysis"
  | "knowledge_retrieval"
  | "content_generation"
  | "deterministic_review"
  | "ai_review"
  | "rendering"
  | "persistence"
  | "path_linking"
  | "completed"
  | "failed";
export interface ResourceGenerationEvent {
  id?: number;
  eventType: "job" | "stage" | "review" | "resource" | "error" | "complete" | "heartbeat";
  stage: ResourceGenerationStage;
  status: string;
  label: string;
  message: string;
  agent: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string | null;
}
export interface ResourceGenerationJob {
  jobId: string;
  studentId: number;
  resourceType: LearningResourceType;
  resourceId: number | null;
  status: "queued" | "running" | "completed" | "failed";
  currentStage: ResourceGenerationStage;
  progressPercent: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
export interface ResourceGenerationSnapshot {
  job: ResourceGenerationJob;
  stages: ResourceGenerationEvent[];
  resource: LearningResource | null;
}

export interface LearningResourceProgress {
  status: ResourceProgressStatus;
  progressPercent: number;
  accumulatedSeconds: number;
  openedAt?: string | null;
  completedAt?: string | null;
  downloadedAt?: string | null;
}

export interface ResourceVersionSummary extends Record<string, unknown> {
  version: number;
  review: LearningResourceReview;
  contentFingerprint: string;
  generatorSource: string;
  modelName: string;
  promptVersion: string;
  createdAt: string;
}

export interface LearningResource {
  sourceMode?: string;
  knowledgeNotice?: string;
  id: number;
  version: number;
  resourceType: LearningResourceType;
  title: string;
  status: string;
  subject: string;
  knowledgePoint: string;
  stageKey: string;
  pathVersion: number;
  estimatedMinutes: number;
  generationRationale: string[];
  learningObjectives: string[];
  targetLearnerSummary: string;
  content: LearningResourceContent;
  review: LearningResourceReview;
  retrievalRunId?: number | null;
  citations?: KnowledgeCitation[];
  progress: LearningResourceProgress | null;
  createdAt: string;
}

export interface KnowledgeSource {
  title: string;
  author: string;
  publisher: string;
  license_name: string;
  version: string;
  source_type: string;
}
export interface KnowledgeCitation {
  label: string;
  chunkId: number;
  sourceKey: string;
  sourceTitle: string;
  chapter?: string;
  section?: string;
  license: string;
  version: string;
  excerpt: string;
  supportScore: number;
}
export interface GroundedAnswerResponse {
  sourceMode?: "rag_model" | "deterministic_fallback";
  generationId?: string;
  retrievalRunId: number;
  status: "grounded" | "insufficient";
  answer: string;
  claims: Array<{ text: string; chunkIds: number[] }>;
  citations: KnowledgeCitation[];
  confidence: "high" | "medium" | "low" | "insufficient";
  coverage: number;
}
export interface KnowledgeSubjectOverview {
  subject: string;
  sources: number;
  chunks: number;
  points: number;
}
export interface KnowledgeOverviewResponse {
  subjects: KnowledgeSubjectOverview[];
  total: { subjects: number; sources: number; chunks: number; points: number };
}

export interface AIAgentRuntimeMetric {
  capability: string;
  calls: number;
  successes: number;
  failures: number;
  lastDurationMs: number;
  averageDurationMs: number;
  lastUsedAt: string | null;
  lastError: string | null;
  model: string | null;
  provider: string | null;
}

export interface AIAgentDescriptor {
  key: string;
  name: string;
  label: string;
  purpose: string;
  modelRole: string;
  endpoints: string[];
  internal: boolean;
  enabled: boolean;
  model: string | null;
  provider: string;
  webSearchRequired?: boolean;
  webSearchAvailable?: boolean;
  runtime: AIAgentRuntimeMetric | null;
}

export interface AIModelHealth {
  enabled: boolean;
  available: boolean;
  provider: string;
  model: string;
  endpointHost: string;
  transport: string;
  credentialsComplete: boolean;
  reachable: boolean | null;
  ready: boolean;
  checkedAt: string;
  reason: string;
  httpStatus?: number;
  models?: string[];
  error?: string;
}

export interface AILearningStatus {
  status: string;
  ai: AIModelHealth;
  models: Record<string, string | null>;
  capabilities: Record<string, boolean>;
  agents: AIAgentDescriptor[];
  webSearch?: { enabled: boolean; available: boolean; provider: string; endpointHost?: string };
  evidencePolicy: string;
}

export interface AIAgentIntegrationStatus {
  ai: Omit<AIModelHealth, "reachable" | "ready" | "checkedAt" | "reason">;
  liveModel: AIModelHealth | null;
  models: Record<string, string | null>;
  agents: AIAgentDescriptor[];
  runtime: AIAgentRuntimeMetric[];
}

export interface PersonalKnowledgeDocument {
  id: number;
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  subject: string;
  chunkCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WrongQuestionAnalysis {
  analysisId: number;
  wrongQuestionId: number;
  recognizedText: string;
  subject: string;
  knowledgePoints: string[];
  errorReason: string;
  explanation: string;
  confidence: "high" | "medium" | "low" | "insufficient";
  citations: Array<Record<string, unknown>>;
  sourceMode: string;
  evidencePolicy: string;
  model: string | null;
}

export interface ReviewQueueItem {
  id: number;
  subject: string;
  knowledgePoint: string;
  sourceType: string;
  sourceId: string;
  intervalDays: number;
  repetitionCount: number;
  easeFactor: number;
  priority: number;
  dueAt: string;
  lastReviewedAt?: string | null;
  status: string;
}

export interface KnowledgeGraphResponse {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  resources: Array<Record<string, unknown>>;
}

export function fetchKnowledgeOverview(): Promise<KnowledgeOverviewResponse> {
  return apiRequest<KnowledgeOverviewResponse>("/api/knowledge/overview");
}
export function askKnowledgeBase(
  query: string,
  knowledgePoint?: string,
  subject = "数据结构",
): Promise<GroundedAnswerResponse> {
  return apiRequest<GroundedAnswerResponse>("/api/knowledge/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, subject, knowledgePoint }),
  });
}
export function getAILearningStatus(): Promise<AILearningStatus> {
  return apiRequest<AILearningStatus>("/api/ai-learning/status");
}
export function getAIAgentCatalog(): Promise<AIAgentIntegrationStatus> {
  return apiRequest<AIAgentIntegrationStatus>("/api/ai-learning/agents");
}
export function probeLocalModel(): Promise<AIAgentIntegrationStatus> {
  return apiRequest<AIAgentIntegrationStatus>("/api/ai-learning/model-health");
}
export function getAILearningOverview(): Promise<{ chain: string[]; counts: Record<string, number> }> {
  return apiRequest<{ chain: string[]; counts: Record<string, number> }>("/api/ai-learning/overview");
}
export function uploadPersonalKnowledge(input: {
  title: string;
  fileName?: string;
  mimeType?: string;
  subject: string;
  contentText: string;
}): Promise<{ document: PersonalKnowledgeDocument; duplicate: boolean }> {
  return apiRequest<{ document: PersonalKnowledgeDocument; duplicate: boolean }>(
    "/api/personal-knowledge/documents",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
}
export function listPersonalKnowledge(subject?: string): Promise<PersonalKnowledgeDocument[]> {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return apiRequest<PersonalKnowledgeDocument[]>(`/api/personal-knowledge/documents${query}`);
}
export function deletePersonalKnowledge(documentId: number): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/api/personal-knowledge/documents/${documentId}`, {
    method: "DELETE",
  });
}
export function getKnowledgeGraph(subject?: string): Promise<KnowledgeGraphResponse> {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return apiRequest<KnowledgeGraphResponse>(`/api/knowledge/graph${query}`);
}
export function analyzeWrongQuestion(input: {
  subject: string;
  questionText?: string;
  imageDataUrl?: string;
  studentAnswer?: string;
  correctAnswer?: string;
}): Promise<WrongQuestionAnalysis> {
  return apiRequest<WrongQuestionAnalysis>("/api/wrong-questions/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
export interface PersonalizedQuizResult {
  requestedCount?: number;
  generatedCount?: number;
  sourceNotice?: string;
  quizId: string;
  mode: string;
  generationBasis: {
    pathVersion: number;
    wrongQuestionCount: number;
    chatContextCount: number;
    personalDocumentCount: number;
  };
  sources: Array<{ id: number; title: string; url: string }>;
  questions: QuizPublicQuestion[];
}
export function generatePersonalizedQuiz(input: {
  subject?: string;
  knowledgePoint?: string;
  questionCount?: number;
  difficulty?: string;
  allowCourseOnly?: boolean;
}): Promise<PersonalizedQuizResult> {
  return apiRequest<PersonalizedQuizResult>("/api/quiz/personalized/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 学生自测组卷（题库直出）：单选 + 填空混合，判分走 /api/quiz/submit */
export interface QuizPaperQuestion {
  question_id: string;
  subject: string;
  chapter?: string | null;
  knowledge_point?: string | null;
  question_type?: string;
  difficulty?: string | null;
  stem: string;
  code_context?: string;
  options: Array<{ key: string; content: string }>;
  hint?: string;
  /** 仅在 reveal=1 的练习模式下返回：正确答案与解析 */
  answer?: string;
  analysis?: string;
}

export interface QuizPaper {
  subject: string;
  choiceCount: number;
  blankCount: number;
  available?: { single_choice: number; fill_blank: number };
  reveal?: boolean;
  questions: QuizPaperQuestion[];
}

export async function getQuizPaper(input: {
  subject: string;
  choice?: number;
  blank?: number;
  /** true = 边答边批改：连答案与解析一起返回 */
  reveal?: boolean;
}): Promise<QuizPaper> {
  const query = new URLSearchParams({
    subject: input.subject,
    choice: String(input.choice ?? 6),
    blank: String(input.blank ?? 4),
  });
  if (input.reveal) query.set("reveal", "1");
  return apiRequest<QuizPaper>(`/api/quiz/paper?${query.toString()}`);
}
export function getReviewQueue(includeFuture = false): Promise<ReviewQueueItem[]> {
  return apiRequest<ReviewQueueItem[]>(`/api/review/queue${includeFuture ? "?includeFuture=true" : ""}`);
}
export function submitReviewResult(
  itemId: number,
  quality: number,
): Promise<{ intervalDays: number; repetitionCount: number; easeFactor: number; dueAt: string }> {
  return apiRequest<{ intervalDays: number; repetitionCount: number; easeFactor: number; dueAt: string }>(
    `/api/review/queue/${itemId}/result`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quality }) },
  );
}

export function getAuthToken() {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) || "null") as AuthUser | null;
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const result = await apiRequest<LoginResult>(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    },
    false,
  );
  if (result.user.role !== "STUDENT" || !result.user.studentId) {
    clearAuth();
    throw new Error("请使用学生账号登录学生端");
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
  }
  return result;
}

export function registerStudent(input: {
  username: string;
  name: string;
  password: string;
  confirmPassword: string;
}): Promise<RegisterResult> {
  return apiRequest<RegisterResult>(
    "/api/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    false,
  );
}

/** 修改密码：需要当前密码；成功后旧密码立即失效 */
export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ success: boolean; message: string; username: string }> {
  return apiRequest<{ success: boolean; message: string; username: string }>("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 注销账号：需要密码 + 输入「注销」确认；注销后账号不可再登录 */
export function deactivateAccount(input: {
  password: string;
  confirm: string;
}): Promise<{ success: boolean; message: string; username: string }> {
  return apiRequest<{ success: boolean; message: string; username: string }>("/api/auth/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getCurrentUser(): Promise<AuthUser> {
  const result = await apiRequest<{ user: AuthUser }>("/api/auth/me");
  const user = result.user;
  if (user.role !== "STUDENT" || !user.studentId) {
    clearAuth();
    throw new Error("当前账号无学生端访问权限");
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
  return user;
}

export async function fetchApiData<T>(path: string): Promise<T[]> {
  const urls = buildApiCandidates(path);
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, withAuthHeaders({ headers: { Accept: "application/json" } }));
      handleUnauthorizedResponse(response);

      if (!response.ok) {
        throw new Error(`请求失败：${response.status}`);
      }

      const payload = await response.json();
      if (Array.isArray(payload)) {
        return payload as T[];
      }

      if (Array.isArray(payload?.data)) {
        return payload.data as T[];
      }

      return [];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("接口请求失败");
}

export async function getCodeExercises(
  params: {
    subject?: string;
    knowledgePoint?: string;
    difficulty?: string;
  } = {},
): Promise<CodeExercise[]> {
  const query = buildQueryString({
    subject: params.subject,
    knowledgePoint: params.knowledgePoint,
    difficulty: params.difficulty,
  });

  return fetchApiData<CodeExercise>(`/api/code/exercises${query}`);
}

export async function getCodeExerciseDetail(id: string): Promise<CodeExercise | null> {
  if (!id) return null;

  return fetchApiPayload<CodeExercise>(`/api/code/exercises/${encodeURIComponent(id)}`);
}

export async function getCodeSubmissions(
  params: {
    exerciseId?: string;
    mode?: "run" | "submit";
    limit?: number;
  } = {},
): Promise<CodeSubmission[]> {
  const query = buildQueryString({
    exerciseId: params.exerciseId,
    mode: params.mode,
    limit: params.limit ? String(params.limit) : undefined,
  });

  return fetchApiData<CodeSubmission>(`/api/code/submissions${query}`);
}

export interface CodeSolution {
  exerciseId: string;
  unlocked: boolean;
  explanation: string;
  referenceSolution: string;
  latestStatus?: string;
}

/** 只有正式提交过的学生才能拿到讲解与参考答案，未解锁时后端返回 403。 */
export async function getCodeSolution(exerciseId: string): Promise<CodeSolution> {
  return fetchApiPayload<CodeSolution>(`/api/code/exercises/${encodeURIComponent(exerciseId)}/solution`);
}

export async function runCode(payload: CodeRunPayload): Promise<CodeRunResult> {
  return fetchApiPayload<CodeRunResult>("/api/code/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function explainCodeRun(payload: CodeExplainPayload): Promise<CodeExplainResult> {
  return fetchApiPayload<CodeExplainResult>("/api/code/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getAgentTaskDescriptions(question: string): Promise<AgentTaskDescriptions> {
  const descriptions = await fetchApiPayload<AgentTaskDescriptions>("/api/agent-task-descriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!isAgentTaskDescriptions(descriptions)) {
    throw new Error("智能体任务描述返回结构无效");
  }

  return descriptions;
}

export async function getLearningPath(): Promise<LearningPathResponse> {
  return apiRequest<LearningPathResponse>("/api/path/me");
}

export interface MyClassSummary {
  classId: number;
  className: string;
  subject: string;
  description?: string | null;
  teacherName: string;
  teacherUsername: string;
  joinedAt?: string | null;
}

export interface MyClassesResponse {
  data: MyClassSummary[];
}

// 注意：apiRequest 会自动解包响应体里的 data 字段，所以这里显式还原成 { data: [...] } 形状。
export async function getMyClasses(): Promise<MyClassesResponse> {
  const rows = await apiRequest<MyClassSummary[]>("/api/student/classes");
  return { data: Array.isArray(rows) ? rows : [] };
}

export interface ClassDirectoryItem {
  classId: number;
  className: string;
  subject: string;
  description?: string | null;
  teacherName: string;
  teacherUsername: string;
  memberCount: number;
  myStatus: "none" | "pending" | "member";
}

export interface ClassDirectoryResponse {
  data: ClassDirectoryItem[];
}

export interface ClassJoinRequest {
  requestId: number;
  classId: number;
  className: string;
  subject: string;
  teacherName: string;
  studentName: string;
  studentUsername: string;
  studentNo: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  message?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface ClassJoinRequestsResponse {
  data: ClassJoinRequest[];
}

export async function getClassDirectory(keyword = ""): Promise<ClassDirectoryResponse> {
  const trimmed = keyword.trim();
  const query = trimmed ? `?keyword=${encodeURIComponent(trimmed)}` : "";
  const rows = await apiRequest<ClassDirectoryItem[]>(`/api/student/class-directory${query}`);
  return { data: Array.isArray(rows) ? rows : [] };
}

export async function getMyClassRequests(): Promise<ClassJoinRequestsResponse> {
  const rows = await apiRequest<ClassJoinRequest[]>("/api/student/class-requests");
  return { data: Array.isArray(rows) ? rows : [] };
}

export async function createClassJoinRequest(
  classId: number,
  message = "",
): Promise<{ request: ClassJoinRequest }> {
  return apiRequest<{ request: ClassJoinRequest }>("/api/student/class-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classId, message }),
  });
}

export async function cancelClassJoinRequest(requestId: number): Promise<{ request: ClassJoinRequest }> {
  return apiRequest<{ request: ClassJoinRequest }>(`/api/student/class-requests/${requestId}`, {
    method: "DELETE",
  });
}

/** 学生自己退出班级 */
export function leaveClass(classId: number): Promise<{ classId: number; className: string; left: boolean }> {
  return apiRequest<{ classId: number; className: string; left: boolean }>(
    `/api/student/classes/${classId}`,
    {
      method: "DELETE",
    },
  );
}

export async function generateLearningPath(): Promise<LearningPathResponse> {
  return apiRequest<LearningPathResponse>("/api/path/generate", { method: "POST" });
}

export async function getLearningPathVersions(): Promise<LearningPathVersion[]> {
  const response = await apiRequest<{ data: LearningPathVersion[] } | LearningPathVersion[]>(
    "/api/path/versions",
  );
  return Array.isArray(response) ? response : response.data;
}

export function getStudentOverview(): Promise<StudentOverview> {
  return apiRequest<StudentOverview>("/api/student/overview");
}

export function getDailyCheckIn(): Promise<DailyCheckInSummary> {
  return apiRequest<DailyCheckInSummary>("/api/check-in/status");
}

export function postDailyCheckIn(): Promise<DailyCheckInSummary> {
  return apiRequest<DailyCheckInSummary>("/api/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function getDailyStudyTime(days = 30): Promise<StudyTimeSummary> {
  return apiRequest<StudyTimeSummary>(`/api/study-time?days=${days}`);
}

export function postFocusSession(minutes: number): Promise<{ recorded: boolean }> {
  return apiRequest<{ recorded: boolean }>("/api/study-time/focus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minutes }),
  });
}

export function getLearningProfile(): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>("/api/profile/me");
}

export function startProfileDialogue(): Promise<ProfileDialogueResponse> {
  return apiRequest<ProfileDialogueResponse>("/api/profile/dialogue/start", { method: "POST" });
}

export function sendProfileDialogueMessage(
  sessionId: string,
  message: string,
): Promise<ProfileDialogueResponse> {
  return apiRequest<ProfileDialogueResponse>("/api/profile/dialogue/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
}

export async function submitCode(payload: CodeSubmitPayload): Promise<CodeSubmitResult> {
  return fetchApiPayload<CodeSubmitResult>("/api/code/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": payload.idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

export function confirmProfileDialogue(
  sessionId: string,
  confirmedProfile: LearningProfileDraft,
): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>("/api/profile/dialogue/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, confirmedProfile }),
  });
}

export function getProfileHistory(): Promise<ProfileHistoryItem[]> {
  return apiRequest<ProfileHistoryItem[]>("/api/profile/history");
}

export function getStudentAssessment(): Promise<StudentAssessment> {
  return apiRequest<StudentAssessment>("/api/student/assessment");
}

export function getQuizQuestions(params: {
  subject: string;
  difficulty?: QuizDifficulty;
  limit?: number;
  knowledgePoint?: string;
}): Promise<QuizPublicQuestion[]> {
  const query = new URLSearchParams();
  query.set("subject", params.subject);
  if (params.difficulty) query.set("difficulty", params.difficulty);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.knowledgePoint) query.set("knowledgePoint", params.knowledgePoint);
  return apiRequest<QuizPublicQuestion[]>(`/api/quiz/questions?${query}`);
}

export function requestQuizHint(input: {
  question: string;
  code?: string;
  options: string[];
}): Promise<{ hint: string }> {
  return apiRequest<{ hint: string }>("/api/quiz-hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function submitQuizAttempt(input: {
  idempotencyKey: string;
  subject: string;
  startedAt: string;
  submittedAt: string;
  answers: QuizSubmitAnswer[];
}): Promise<QuizSubmissionResult> {
  return apiRequest<QuizSubmissionResult>("/api/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function describeApiError(reason: unknown, fallback: string): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "网络连接已断开。已加载的内容仍会保留，恢复网络后可以重试。";
  }
  if (reason instanceof ApiRequestError) {
    if (reason.status === 401) return "登录状态已失效，请重新登录后继续。";
    if (reason.status === 403) return "当前学生账号没有访问这项内容的权限。";
    if (reason.status === 429) return "请求过于频繁，请稍后再试。";
    if (reason.code === "CODE_EXECUTION_UNAVAILABLE") {
      return "在线判题环境尚未启动，请在本机运行“启用CodeLab在线判题.bat”后重试；已输入的代码不会丢失。";
    }
    if (reason.code === "AI_SERVICE_UNAVAILABLE") {
      return "AI 助手当前不可用，请检查 AI 服务配置或稍后重试。";
    }
    if (reason.code === "AI_RESPONSE_QUALITY_FAILED") {
      return "AI 已返回内容，但暂未通过质量检查，请稍后重试。";
    }
    if (reason.code === "CODE_PRIVATE_TESTS_NOT_CONFIGURED") {
      return "该练习暂未配置正式判题数据，目前只能运行公开测试；请改用已验证的 CodeLab 练习后再正式提交。";
    }
    if (reason.status && reason.status >= 500) return `${fallback}，服务暂时不可用，请稍后重试。`;
    const unsafe = /appid|token|provider|database|sql|socket|stack|request id/i.test(reason.message);
    return unsafe ? fallback : reason.message || fallback;
  }
  if (reason instanceof TypeError) {
    return "暂时无法连接学习服务。已输入的内容不会丢失，请检查网络后重试。";
  }
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

export function updateWrongQuestionStatus(
  id: number | string,
  status: "待复习" | "已掌握",
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/api/wrong-questions/${encodeURIComponent(String(id))}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function listLearningResources(
  params: Record<string, string | number | undefined> = {},
): Promise<LearningResource[]> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") query.set(k, String(v));
  });
  return apiRequest<LearningResource[]>(`/api/resources${query.size ? `?${query}` : ""}`);
}
export async function generateLearningResource(input: {
  resourceType: LearningResourceType;
  subject: string;
  knowledgePoint: string;
  stageKey: string;
  pathVersion: number;
  regenerate?: boolean;
}): Promise<LearningResource> {
  const result = await apiRequest<{ resource: LearningResource }>("/api/resources/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return result.resource;
}
export async function createLearningResourceJob(input: {
  resourceType: LearningResourceType;
  subject: string;
  knowledgePoint: string;
  stageKey: string;
  pathVersion: number;
  regenerate?: boolean;
}): Promise<{ jobId: string; status: string }> {
  return apiRequest<{ jobId: string; status: string }>("/api/resources/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, async: true }),
  });
}
export function getResourceGenerationJob(jobId: string): Promise<ResourceGenerationSnapshot> {
  return apiRequest<ResourceGenerationSnapshot>(`/api/resources/jobs/${encodeURIComponent(jobId)}`);
}
export function getLatestResourceGenerationJob(
  resourceType?: LearningResourceType,
  activeOnly = false,
): Promise<ResourceGenerationSnapshot | null> {
  const query = new URLSearchParams();
  if (resourceType) query.set("resourceType", resourceType);
  if (activeOnly) query.set("activeOnly", "true");
  return apiRequest<{ data: ResourceGenerationSnapshot | null }>(`/api/resources/jobs/latest?${query}`).then(
    (result) => result.data ?? (result as unknown as ResourceGenerationSnapshot | null),
  );
}
export function getResourceGenerationEventsUrl(jobId: string, after = 0): string {
  return buildApiCandidates(
    `/api/resources/jobs/${encodeURIComponent(jobId)}/events${after ? `?after=${after}` : ""}`,
  )[0];
}
export async function getLearningResource(id: number, version?: number): Promise<LearningResource> {
  const suffix = version ? `/versions/${version}` : "";
  const result = await apiRequest<{ resource: LearningResource }>(`/api/resources/${id}${suffix}`);
  return result.resource;
}
export async function getResourceVersions(id: number): Promise<ResourceVersionSummary[]> {
  return apiRequest<ResourceVersionSummary[]>(`/api/resources/${id}/versions`);
}
export async function openLearningResource(id: number): Promise<LearningResource> {
  const r = await apiRequest<{ resource: LearningResource }>(`/api/resources/${id}/open`, { method: "POST" });
  return r.resource;
}
export async function updateLearningResourceProgress(
  id: number,
  progressPercent: number,
): Promise<LearningResource> {
  const r = await apiRequest<{ resource: LearningResource }>(`/api/resources/${id}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progressPercent }),
  });
  return r.resource;
}
export async function completeLearningResource(id: number): Promise<LearningResource> {
  const r = await apiRequest<{ resource: LearningResource }>(`/api/resources/${id}/complete`, {
    method: "POST",
  });
  return r.resource;
}
export async function submitLearningResourceQuiz(input: {
  resourceId: number;
  version: number;
  subject: string;
  answers: Array<{ questionId: string; answer: string; durationSeconds: number }>;
}): Promise<QuizSubmissionResult> {
  return apiRequest<QuizSubmissionResult>("/api/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idempotencyKey: `resource-${input.resourceId}-v${input.version}-${Date.now()}`,
      subject: input.subject,
      startedAt: new Date(Date.now() - 60000).toISOString(),
      submittedAt: new Date().toISOString(),
      answers: input.answers,
    }),
  });
}
export async function downloadLearningResource(id: number, version?: number): Promise<void> {
  const path = `/api/resources/${id}${version ? `/versions/${version}` : ""}/download`;
  let last: unknown;
  for (const url of buildApiCandidates(path)) {
    try {
      const response = await fetch(url, withAuthHeaders());
      handleUnauthorizedResponse(response);
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error || `下载失败：${response.status}`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const name = match ? decodeURIComponent(match[1]) : "寻笺课件.pptx";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("下载失败");
}

/**
 * 导出成 PPTist 本地编辑器可导入的 JSON。
 * 内容仍是 LearnMate 的模型生成的，这里只做格式转换；下载后到本地 PPTist（默认 127.0.0.1:5217）
 * 导入即可继续编辑并导出 PPTX —— PPTist 网页自带的一键 AI 生成没有后端，不要指望它出内容。
 */
export async function downloadPptistJson(id: number, version?: number): Promise<void> {
  const path = `/api/resources/${id}${version ? `/versions/${version}` : ""}/pptist-json`;
  let last: unknown;
  for (const url of buildApiCandidates(path)) {
    try {
      const response = await fetch(url, withAuthHeaders());
      handleUnauthorizedResponse(response);
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error || `导出失败：${response.status}`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const name = match ? decodeURIComponent(match[1]) : "LearnMate课件-pptist.json";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("导出失败");
}

/**
 * 导出成本地「思绪思维导图」(simple-mind-map, 默认 127.0.0.1:5317) 可导入的 JSON。
 * 与 PPTist 导出一样只是格式转换：结点文字、备注、重点/易错标签与配色都由 LearnMate 侧给出。
 */
export async function downloadMindMapJson(id: number, version?: number): Promise<void> {
  const path = `/api/resources/${id}${version ? `/versions/${version}` : ""}/mindmap-json`;
  let last: unknown;
  for (const url of buildApiCandidates(path)) {
    try {
      const response = await fetch(url, withAuthHeaders());
      handleUnauthorizedResponse(response);
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error || `导出失败：${response.status}`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const name = match ? decodeURIComponent(match[1]) : "LearnMate思维导图.json";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("导出失败");
}

export async function downloadPresentation(id: number, document: { title: string }): Promise<void> {
  const [url] = buildApiCandidates(`/api/resources/${id}/presentation/export`);
  const response = await fetch(
    url,
    withAuthHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    }),
  );
  handleUnauthorizedResponse(response);
  if (!response.ok)
    throw new Error((await response.json().catch(() => ({}))).error || `导出失败：${response.status}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${document.title}.pptx`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function listChatSessions(page = 1): Promise<ChatSessionListResponse> {
  return apiRequest<ChatSessionListResponse>(`/api/chat/sessions?status=active&page=${page}&limit=50`);
}

export interface ProfileHistoryItem {
  version: number;
  snapshot: CompleteLearningProfile;
  reason: string;
  evidence: Record<string, unknown>;
  sourceType: string;
  createdAt: string;
}

export async function createChatSession(title?: string): Promise<ChatSession> {
  const result = await apiRequest<{ session: ChatSession }>("/api/chat/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
  return result.session;
}

export function getChatSessionMessages(
  sessionId: number,
  signal?: AbortSignal,
  beforeId?: number,
): Promise<ChatSessionMessagesResponse> {
  const cursor = beforeId ? `&beforeId=${beforeId}` : "";
  return apiRequest<ChatSessionMessagesResponse>(
    `/api/chat/sessions/${sessionId}/messages?limit=100${cursor}`,
    { signal },
  );
}

export async function renameChatSession(sessionId: number, title: string): Promise<ChatSession> {
  const result = await apiRequest<{ session: ChatSession }>(`/api/chat/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return result.session;
}

export async function archiveChatSession(sessionId: number): Promise<ChatSession> {
  const result = await apiRequest<{ session: ChatSession }>(`/api/chat/sessions/${sessionId}`, {
    method: "DELETE",
  });
  return result.session;
}

export async function streamChatMessage(
  sessionId: number,
  message: string,
  wrongQuestion: Parameters<typeof sendChatMessage>[2],
  onEvent: (event: { type: string; text?: string; message?: string }) => void,
  signal?: AbortSignal,
): Promise<ChatAnswer & { sessionId: number }> {
  const response = await fetch(
    buildApiCandidates("/api/chat")[0],
    withAuthHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ sessionId, message, wrongQuestion, stream: true }),
      signal,
    }),
  );
  handleUnauthorizedResponse(response);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiRequestError(error.message || "助手请求失败", {
      status: response.status,
      code: error.error,
      sessionId,
    });
  }
  if (!response.body) throw new Error("浏览器没有收到回答数据流");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    result: (ChatAnswer & { sessionId: number }) | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error")
      throw new ApiRequestError(event.message, { status: event.status, code: event.code, sessionId });
    if (event.type === "done") result = event.answer;
    else onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(consume);
      if (done) break;
    }
    consume(buffer);
    if (!result) throw new Error("连接中断，回答尚未完成。请重新加载会话确认后再试。");
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function sendChatMessage(
  sessionId: number,
  message: string,
  wrongQuestion?: {
    subject: string;
    questionText?: string;
    imageDataUrl?: string;
    studentAnswer?: string;
    correctAnswer?: string;
  },
): Promise<ChatAnswer & { sessionId: number }> {
  return apiRequest<ChatAnswer & { sessionId: number }>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message, wrongQuestion }),
  });
}

function buildApiCandidates(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Vite injects `import.meta.env` in normal builds. Lightweight local preview
  // bundles may leave `env` undefined, so use the same-origin API in that case.
  const configuredBase = (import.meta.env?.VITE_API_BASE_URL || "").replace(/\/$/, "");

  if (!configuredBase) return [normalizedPath];
  if (configuredBase.endsWith("/api") && (normalizedPath === "/api" || normalizedPath.startsWith("/api/"))) {
    return [`${configuredBase}${normalizedPath.slice(4)}`];
  }
  return [`${configuredBase}${normalizedPath}`];
}

export async function apiRequest<T>(path: string, init?: RequestInit, authenticated = true): Promise<T> {
  const urls = buildApiCandidates(path);
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      const requestInit = authenticated ? withAuthHeaders(init) : init;
      const response = await fetch(url, requestInit ?? { headers: { Accept: "application/json" } });
      if (authenticated) handleUnauthorizedResponse(response);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const errorCode =
          typeof body?.code === "string"
            ? body.code
            : typeof body?.error === "string" && /^[A-Z0-9_]+$/.test(body.error)
              ? body.error
              : undefined;
        const message =
          typeof body?.message === "string"
            ? body.message
            : typeof body?.error === "string" && !errorCode
              ? body.error
              : `请求失败（${response.status}）`;
        throw new ApiRequestError(message, {
          status: response.status,
          code: errorCode,
          requestId: typeof body?.requestId === "string" ? body.requestId : undefined,
          sessionId: Number.isInteger(body?.sessionId) ? Number(body.sessionId) : undefined,
        });
      }

      const payload = await response.json();
      return (payload?.data ?? payload) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("接口请求失败");
}

const fetchApiPayload = apiRequest;

function withAuthHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return { ...(init || {}), headers };
}

function handleUnauthorizedResponse(response: Response) {
  if (response.status !== 401 || typeof window === "undefined") return;
  clearAuth();
  window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
}

function isAgentTaskDescriptions(value: unknown): value is AgentTaskDescriptions {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return ["coordinator", "theoryAgent", "codeAgent", "reviewAgent"].every(
    (field) => typeof candidate[field] === "string" && candidate[field].trim().length > 0,
  );
}

function buildQueryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const value = query.toString();
  return value ? `?${value}` : "";
}

export interface AssignmentSummary {
  id: number;
  title: string;
  description: string;
  subject: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
  className: string;
  teacherName: string;
  questionCount: number;
  /** 作业里挂载的 CodeLab 代码题数量。 */
  codeExerciseCount?: number;
  /** 我已经提交过的代码题数量。 */
  codeSubmittedCount?: number;
  /** 其中已经全部用例通过的代码题数量。 */
  codeAcceptedCount?: number;
  submitted: boolean;
  score: number | null;
  correctCount: number | null;
  totalCount: number | null;
  submittedAt: string | null;
}

export interface AssignmentQuestion extends QuizPublicQuestion {
  orderIndex: number;
}

export interface AssignmentResultItem {
  questionId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  analysis: string;
}

export interface AssignmentDetail {
  assignment: {
    id: number;
    title: string;
    description: string;
    subject: string;
    status: string;
    dueAt: string | null;
    className: string;
    teacherName: string;
    questionCount: number;
    /** 作业里挂载的 CodeLab 代码题数量（纯代码题作业的 questionCount 为 0）。 */
    codeExerciseCount?: number;
  };
  questions: AssignmentQuestion[];
  mySubmission: null | {
    attemptId: number;
    score: number;
    correctCount: number;
    totalCount: number;
    submittedAt: string;
    results: AssignmentResultItem[];
  };
  /** 作业内挂载的代码题；不含答案，隐藏用例只给数量。 */
  codeExercises?: AssignmentCodeExercise[];
}

/** 我在某道代码题上最近一次正式提交的记录。 */
export interface AssignmentCodeSubmission {
  submissionId: number | string;
  /** accepted / wrong_answer / compile_error / runtime_error / runner_unavailable 等。 */
  status?: string;
  accepted?: boolean;
  passedCount?: number;
  totalCount?: number;
  executionMode?: string;
  sourceCode?: string;
  submittedAt?: string | null;
}

/** 判题结果里的单个用例（后端可选下发）。 */
export interface AssignmentCodeCase {
  id?: number | string;
  index?: number;
  name?: string;
  title?: string;
  /** public=样例用例；hidden=隐藏用例（不返回具体数据）。 */
  visibility?: string;
  status?: string;
  message?: string;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
}

export interface AssignmentCodeRunResult {
  status: string;
  passedCount?: number;
  totalCount?: number;
  tests?: AssignmentCodeCase[];
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  executionMode?: string;
  message?: string;
}

export interface AssignmentCodeExercise {
  exerciseId: string;
  orderIndex?: number;
  subject?: string;
  knowledgePoint?: string;
  title?: string;
  description?: string;
  language?: string;
  difficulty?: string;
  starterCode?: string;
  sampleInput?: string;
  sampleOutput?: string;
  /** 用例总数（含隐藏）。 */
  caseCount?: number;
  /** 其中隐藏用例数量。 */
  hiddenCount?: number;
  mySubmission?: AssignmentCodeSubmission | null;
  mySubmissionCount?: number;
}

export interface AssignmentCodeSubmitResult {
  assignmentId: number;
  exerciseId: string;
  accepted: boolean;
  result: AssignmentCodeRunResult;
  submission: AssignmentCodeSubmission | null;
}

/** 教师发布给我的作业与测试（只包含当前班级的作业）。注意 apiRequest 已解包顶层 data。 */
export function getMyAssignments(): Promise<AssignmentSummary[]> {
  return apiRequest<AssignmentSummary[]>("/api/assignments");
}

/** 作业详情：题目不含答案，已提交时附带本人的批改结果。 */
export function getAssignmentDetail(assignmentId: number): Promise<AssignmentDetail> {
  return apiRequest<AssignmentDetail>(`/api/assignments/${assignmentId}`);
}

/** 整卷提交作业；同一份作业后端只会记录一次作答（重复提交返回首次结果）。 */
export function submitAssignment(
  assignmentId: number,
  input: { startedAt?: string; submittedAt?: string; answers: QuizSubmitAnswer[] },
): Promise<QuizSubmissionResult> {
  return apiRequest<QuizSubmissionResult>(`/api/assignments/${assignmentId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** 提交作业内的单道代码题，由后台自动判题；同一道题可以反复提交。 */
export function submitAssignmentCode(
  assignmentId: number,
  exerciseId: string,
  input: { language: string; sourceCode: string },
): Promise<AssignmentCodeSubmitResult> {
  return apiRequest<AssignmentCodeSubmitResult>(
    `/api/assignments/${assignmentId}/code/${encodeURIComponent(exerciseId)}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}
