/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
export interface UserProfile {
  name: string;
  proficiency: number; // overall percentage (0-100)
  totalHours: number;
  completionRate: number; // percentage
  knowledgeCoverage: number; // percentage
  streak: number; // in days
  testsTaken: number;
  pendingTasks: number;
  weakPointsCount: number;
  extraPoints?: number; // extra challenge points
}

export interface Course {
  id: string;
  name: string;
  code: string;
  proficiency: number; // (0-100)
  totalHours: number;
  completionRate: number; // percentage
  color: string;
}

export interface WeakPoint {
  id: string;
  name: string;
  level: "High" | "Medium" | "Low";
  count: number; // number of times answered incorrectly
  course: string;
  remediationProgress: number; // 0-100
}

export interface QuizQuestion {
  id: string;
  domain: string;
  question: string;
  code?: string;
  options: string[];
  answerIndex: number; // 0-3 for A,B,C,D
  explanation: string;
  hint: string;
}

export interface QuizSettings {
  domain: string;
  numQuestions: number;
  difficulty: "basic" | "advanced" | "challenge";
}

export interface QuizState {
  settings: QuizSettings;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  userAnswers: { [key: number]: number }; // questionIndex -> answerIndex
  markedQuestions: number[]; // indices
  isCompleted: boolean;
  score: number;
  timer: number; // in seconds
  currentAbilityEstimate: number; // ability score, e.g. +1.45
}

export interface AgentCollaboration {
  agentName: string;
  status: "idle" | "working" | "completed" | "failed";
  message: string;
}

export interface AgentTaskDescriptions {
  coordinator: string;
  theoryAgent: string;
  codeAgent: string;
  reviewAgent: string;
}

export type ChatSourceMode = "rag_model" | "model_only" | "deterministic_fallback" | "clarification";

export interface ChatCitation {
  label: string;
  chunkId: number | null;
  sourceKey?: string | null;
  sourceTitle: string;
  chapter?: string | null;
  section?: string | null;
  license?: string | null;
  version?: string | null;
  excerpt: string;
  supportScore?: number | null;
}

export interface ChatCodeBlock {
  language?: string;
  code: string;
}

export interface ChatProfileSuggestion {
  dimension: string;
  suggestedValue: string[];
  evidence: string;
  reason: string;
}

export interface ChatTraceStep {
  name: string;
  status: string;
  detail?: string;
}

export interface ChatTrace {
  summary?: string;
  collapsed?: boolean;
  steps: ChatTraceStep[];
}

export interface ChatQualityIssue {
  code?: string;
  message: string;
}

export interface ChatQuality {
  passed: boolean;
  characterCount?: number;
  sectionCount?: number;
  codeBlockCount?: number;
  exampleCount?: number;
  misconceptionCount?: number;
  practiceCount?: number;
  issues?: ChatQualityIssue[];
}

export interface ChatAnswer {
  messageId?: string;
  answerMarkdown: string;
  sourceMode: ChatSourceMode;
  subject?: string | null;
  knowledgePoint?: string | null;
  knowledgeNotice?: string | null;
  citations: ChatCitation[];
  codeBlocks?: ChatCodeBlock[];
  followups: string[];
  profileSuggestions: ChatProfileSuggestion[];
  trace?: ChatTrace | null;
  quality?: ChatQuality | null;
  modelAvailable?: boolean;
}

export interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  status: "completed" | "failed" | "pending";
  createdAt: string | null;
  messageId?: string;
  answer?: ChatAnswer;
  errorCode?: string;
}

export interface ChatSession {
  id: number;
  title: string;
  status: "active" | "archived";
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
}

export interface ChatSessionListResponse {
  sessions: ChatSession[];
  pagination: { page: number; limit: number; hasMore: boolean };
}

export interface ChatSessionMessagesResponse {
  session: ChatSession;
  messages: ChatMessage[];
  pagination: { limit: number; hasMore: boolean; nextBeforeId: number | null };
}

export interface ResourceGenerationInput {
  subject: string;
  topic: string;
  resourceType: "LectureNotes" | "Homework" | "CaseStudy" | "CheatSheet";
  difficulty: "Elementary" | "Intermediate" | "Advanced";
}

export interface GeneratedResource {
  id: string;
  subject: string;
  topic: string;
  resourceType: string;
  difficulty: string;
  content: string;
  createdDate: string;
}

export interface PathStage {
  key: string;
  title: string;
  subject: string;
  durationMinutes: number;
  progress: number; // 0-100
  status: "completed" | "active" | "locked";
  goals: string[];
  knowledgePoints: string[];
  questionIds: string[];
  codeExerciseIds: string[];
  completion: { type: "quiz" | "codelab" | "resource"; ids: string[] };
  dependsOn: string[];
  completedAt?: string | null;
  resources: string[];
}

export interface LearningPathResponse {
  version: number;
  title: string;
  progress: number;
  changeReason: string;
  sourceType: string;
  createdAt: string;
  stages: PathStage[];
}

export interface LearningPathVersion {
  version: number;
  title: string;
  changeReason: string;
  sourceType: string;
  createdAt: string;
  stages: Array<Record<string, unknown>>;
  diff: { added: string[]; removed: string[]; changed: string[]; reordered: boolean };
}

export interface ErrorRecord {
  id: string;
  title: string;
  course: string;
  question: string;
  code?: string;
  options: string[];
  userAnswer: number;
  correctAnswer: number;
  diagnosis: {
    rootCause: string;
    cognitiveTrap: string;
    learningPathAdjustment: string;
  };
  similarRecommendations: string[];
  remediated: boolean;
  timestamp: string;
}
