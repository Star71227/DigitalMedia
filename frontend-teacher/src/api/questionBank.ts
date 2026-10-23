/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { api } from "./client";

export interface BankQuestionOption {
  key: string;
  content: string;
}

export interface BankQuestion {
  questionId: string;
  subject: string;
  chapter: string;
  knowledgePoint: string;
  difficulty: string;
  questionType: string;
  stem: string;
  codeContext: string;
  options: BankQuestionOption[];
  answer: string;
  analysis: string;
  mine: boolean;
  source: string;
  createdAt: string;
}

export interface BankSubject {
  subject: string;
  questionCount: number;
  ownCount: number;
}

/** 题库题型（后端 question_bank.question_type） */
export const QUESTION_TYPE_SINGLE_CHOICE = "single_choice";
export const QUESTION_TYPE_FILL_BLANK = "fill_blank";

export interface CreateQuestionInput {
  subject: string;
  stem: string;
  options: string[];
  answer: string;
  knowledgePoint?: string;
  chapter?: string;
  difficulty?: string;
  analysis?: string;
  codeContext?: string;
}

function qs(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export const questionBankApi = {
  subjects: () => api<{ subjects: BankSubject[]; difficulties: string[] }>("/teacher/question-bank/subjects"),
  questions: (params: Record<string, unknown> = {}) =>
    api<{ data: BankQuestion[]; limit: number }>(`/teacher/question-bank/questions${qs(params)}`),
  /**
   * 填空题候选：组卷时用。填空题没有独立的候选接口，直接复用题库接口加题型过滤，
   * 这样自动抽题（只抽单选）与手动挂填空题互不影响。
   */
  fillBlanks: (subject: string, limit = 100) =>
    api<{ data: BankQuestion[]; limit: number }>(
      `/teacher/question-bank/questions${qs({ subject, questionType: QUESTION_TYPE_FILL_BLANK, limit })}`,
    ),
  create: (body: CreateQuestionInput) =>
    api<{ question: BankQuestion }>("/teacher/question-bank/questions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  remove: (questionId: string) =>
    api<{ questionId: string; deleted: boolean }>(
      `/teacher/question-bank/questions/${encodeURIComponent(questionId)}`,
      { method: "DELETE" },
    ),
};
