/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { api } from "./client";

/** 一份作业最多可挂的 CodeLab 代码题数量（后端 normalizeCodeExerciseIds 同步校验） */
export const MAX_CODE_EXERCISES_PER_ASSIGNMENT = 10;

/** 一份作业最多可挂的填空题数量（后端 MAX_QUESTIONS_PER_ASSIGNMENT 同步校验，与单选共用上限） */
export const MAX_FILL_BLANKS_PER_ASSIGNMENT = 50;

/** 一份作业最多可挂的简答题数量（后端 MAX_OPEN_QUESTIONS_PER_ASSIGNMENT 同步校验） */
export const MAX_OPEN_QUESTIONS_PER_ASSIGNMENT = 10;

export interface AssignmentClassOption {
  id: number;
  className: string;
  subject: string;
  studentCount: number;
}

export interface AssignmentSubjectOption {
  subject: string;
  questionCount: number;
  ownCount?: number;
}

/** 发布作业时可选的 CodeLab 代码题（只含题面与用例数量，不含隐藏用例与参考题解） */
export interface CodeExerciseCandidate {
  exerciseId: string;
  subject: string;
  knowledgePoint: string;
  title: string;
  description: string;
  language: string;
  difficulty: string;
  /** 用例总数 */
  caseCount: number;
  /** 其中隐藏用例数 */
  hiddenCount: number;
}

/** 发布作业时可选的简答题（主观题，没有标准答案，只用于选题与查看学生作答） */
export interface OpenQuestionCandidate {
  openQuestionId: string;
  subject: string;
  chapter: string;
  knowledgePoint: string;
  difficulty: string;
  /** 题干 */
  prompt: string;
}

/**
 * 发布作业时可选的填空题。
 * 填空题不在作业接口里单独出题，而是复用题库接口
 * `GET /teacher/question-bank/questions?questionType=fill_blank`，
 * 因此这里只声明组卷需要的最小字段集（BankQuestion 的结构子集）。
 */
export interface FillBlankCandidate {
  questionId: string;
  subject: string;
  chapter: string;
  knowledgePoint: string;
  difficulty: string;
  /** 固定为 fill_blank */
  questionType: string;
  stem: string;
  /** 正确答案；可能是 `递增|升序|有序` 这种以 | 分隔的多个可接受答案 */
  answer: string;
  analysis: string;
}

export interface TeacherAssignmentItem {
  id: number;
  title: string;
  description: string;
  subject: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
  classId: number;
  className: string;
  questionCount: number;
  /** 挂在该作业下的代码题数量 */
  codeExerciseCount: number;
  /** 学生代码提交人次（按「题目 × 学生」去重） */
  codeSubmittedCount: number;
  studentCount: number;
  submittedCount: number;
  averageScore: number | null;
}

export interface TeacherAssignmentQuestion {
  question_id: string;
  orderIndex: number;
  subject: string;
  chapter?: string | null;
  knowledge_point?: string | null;
  question_type?: string;
  difficulty?: string | null;
  stem: string;
  code_context?: string;
  options: Array<{ key: string; content: string }>;
  answer: string;
  analysis: string;
  answerCount: number;
  correctCount: number;
  correctRate: number | null;
}

/** 某个学生在一道代码题上的最近一次判题结果 */
export interface TeacherCodeSubmission {
  submissionId: number;
  studentId: number;
  studentName: string;
  /** accepted / wrong_answer / compile_error / runtime_error / timeout / output_limit / internal_error 等 */
  status: string;
  /** true 表示全部用例通过 */
  accepted: boolean;
  passedCount: number;
  totalCount: number;
  /** docker / local */
  executionMode: string;
  /** 学生提交的语言与源码，教师端可展开查看 */
  language?: string;
  sourceCode?: string;
  /** 编译错误输出（有则展示） */
  compileOutput?: string;
  submittedAt: string | null;
}

export interface TeacherAssignmentCodeExercise extends CodeExerciseCandidate {
  orderIndex: number;
  /** 每个学生只保留最近一次提交 */
  submissions: TeacherCodeSubmission[];
  /** 该题已提交人数（按学生去重） */
  submittedCount: number;
  /** 该题通过人数（按学生去重） */
  acceptedCount: number;
}

/** 单人单题作答：同时覆盖单选与填空，用 questionType 区分 */
export interface TeacherStudentAnswer {
  questionId: string;
  /** single_choice 时下面两个字段是 A-D 字母；fill_blank 时是文本答案 */
  questionType: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

/** 某个学生对某道简答题的文本作答（主观题，不参与自动判分） */
export interface TeacherStudentOpenAnswer {
  openQuestionId: string;
  /** 学生的作答文本 */
  answer: string;
  submittedAt: string | null;
}

/** 作业里的一道简答题：题干 + 已作答人数 */
export interface TeacherAssignmentOpenQuestion {
  openQuestionId: string;
  orderIndex: number;
  subject: string;
  chapter: string;
  knowledgePoint: string;
  difficulty: string;
  prompt: string;
  /** 已提交文本作答的学生数 */
  answeredCount: number;
}

export interface TeacherAssignmentStudent {
  studentId: number;
  username: string;
  displayName: string;
  submitted: boolean;
  status: "submitted" | "pending";
  /** 只交了简答题（没有客观题作答记录）时可能为 null */
  score: number | null;
  correctCount: number | null;
  totalCount: number | null;
  submittedAt: string | null;
  /** 该学生提交的简答题数量；只交简答题的学生靠它判定为「已提交」 */
  openAnswerCount: number;
  /** 该学生的逐题客观题作答明细；未提交时为空数组 */
  answers?: TeacherStudentAnswer[];
  /** 该学生的简答题文本作答；没交简答题时为空数组 */
  openAnswers: TeacherStudentOpenAnswer[];
}

export interface TeacherAssignmentDetail {
  assignment: {
    id: number;
    title: string;
    description: string;
    subject: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
    classId: number;
    className: string;
    /** 客观题总数（单选 + 填空） */
    questionCount: number;
    /** 其中填空题数量 */
    fillBlankCount: number;
    /** 简答题数量 */
    openQuestionCount: number;
    codeExerciseCount: number;
  };
  questions: TeacherAssignmentQuestion[];
  /** 简答题：无自动判分，逐个展示题干与学生的文本作答 */
  openQuestions: TeacherAssignmentOpenQuestion[];
  codeExercises: TeacherAssignmentCodeExercise[];
  students: TeacherAssignmentStudent[];
  summary: {
    studentCount: number;
    submittedCount: number;
    pendingCount: number;
    averageScore: number | null;
    averageCorrectRate: number | null;
    pendingStudents: string[];
    /** 填空题数量 */
    fillBlankCount: number;
    /** 简答题数量 */
    openQuestionCount: number;
    /** 已交简答题的学生人数 */
    openAnsweredCount: number;
    codeExerciseCount: number;
    /** 各代码题「去重后提交人数」之和（人次） */
    codeSubmittedCount: number;
    /** 各代码题「去重后通过人数」之和（人次） */
    codeAcceptedCount: number;
  };
}

/**
 * 发布作业入参。
 * - 单选：手动模式用 questionIds，自动抽题用 questionCount；
 * - 填空：fillBlankIds；简答：openQuestionIds；代码题：codeExerciseIds。
 * 后三者与「自动 / 手动」模式无关，两种模式下都能挂。
 * 给 codeExerciseIds 且 questionCount 传 0 时，后端生成「纯代码题作业」。
 */
export interface CreateAssignmentInput {
  classId: number;
  title: string;
  description?: string;
  subject: string;
  dueAt?: string;
  questionCount?: number;
  questionIds?: string[];
  /** 填空题 id 列表（来自题库接口 questionType=fill_blank） */
  fillBlankIds?: string[];
  /** 简答题 id 列表（来自 /teacher/assignments/open-questions） */
  openQuestionIds?: string[];
  codeExerciseIds?: string[];
}

/** 发布成功后后端回显的作业摘要 */
export interface CreatedAssignment {
  id: number;
  classId: number;
  className: string;
  title: string;
  description: string;
  subject: string;
  status: string;
  dueAt: string | null;
  /** 客观题总数（单选 + 填空） */
  questionCount: number;
  singleChoiceCount?: number;
  fillBlankCount?: number;
  openQuestionCount?: number;
  codeExerciseCount: number;
}

/** 按科目拼查询串；subject 省略或传「全部」表示不筛科目 */
function subjectQuery(subject?: string) {
  const value = (subject || "").trim();
  return value && value !== "全部" ? `?subject=${encodeURIComponent(value)}` : "";
}

export const assignmentApi = {
  options: () =>
    api<{
      classes: AssignmentClassOption[];
      subjects: AssignmentSubjectOption[];
      maxQuestions: number;
      maxCodeExercises?: number;
    }>("/teacher/assignments/options"),
  list: () => api<{ data: TeacherAssignmentItem[] }>("/teacher/assignments"),
  /** 代码题候选列表；subject 省略或传「全部」表示不筛科目 */
  codeExercises: (subject?: string) =>
    api<{ data: CodeExerciseCandidate[] }>(`/teacher/assignments/code-exercises${subjectQuery(subject)}`),
  /** 简答题候选列表；subject 省略或传「全部」表示不筛科目 */
  openQuestions: (subject?: string) =>
    api<{ data: OpenQuestionCandidate[] }>(`/teacher/assignments/open-questions${subjectQuery(subject)}`),
  create: (body: CreateAssignmentInput) =>
    api<{ assignment: CreatedAssignment }>("/teacher/assignments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  detail: (id: number) => api<TeacherAssignmentDetail>(`/teacher/assignments/${id}`),
};
