/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { apiRequest, type AILearningStatus } from "../api";

/**
 * Provider-neutral front-end contract for professional foundation models.
 *
 * The browser never stores or sends provider API keys. All calls terminate at
 * the LearnMate backend proxy, where model routing, credentials, audit and the
 * internal multi-agent orchestration remain private.
 */
export type ModelRole = "tutor" | "planner" | "quiz" | "vision" | "embedding";

export interface ProfessionalModelSlot {
  role: ModelRole;
  model: string;
  provider: "openai-compatible" | "managed-gateway";
  capabilities: Array<"reasoning" | "vision" | "streaming" | "embedding">;
}

export interface PersonalizedLearningContext {
  profileVersion: number;
  pathVersion?: number;
  stageKey?: string;
  subject: string;
  knowledgePoint?: string;
  goal?: string;
  weeklyTimeBudgetMinutes?: number;
}

export interface PersonalizedGenerationRequest {
  context: PersonalizedLearningContext;
  output: "learning_path" | "study_note" | "mind_map" | "quiz_pack" | "code_case";
  preferences?: {
    difficulty?: "基础" | "进阶" | "挑战";
    explanationStyle?: "图示优先" | "例题优先" | "推导优先";
  };
}

export interface PersonalizedGenerationResponse {
  jobId?: number;
  pathVersion?: number;
  resourceId?: number;
  status: "queued" | "generating" | "completed";
}

export const PROFESSIONAL_MODEL_ENDPOINTS = {
  status: "/api/ai-learning/status",
  path: "/api/path/generate",
  resource: "/api/resources/generate",
  tutor: "/api/chat",
  quiz: "/api/quiz/personalized/generate",
  graph: "/api/knowledge/graph",
} as const;

export function getProfessionalModelStatus() {
  return apiRequest<AILearningStatus>(PROFESSIONAL_MODEL_ENDPOINTS.status);
}

export function generateWithProfessionalModel(request: PersonalizedGenerationRequest) {
  if (request.output === "learning_path") {
    return apiRequest<PersonalizedGenerationResponse>(PROFESSIONAL_MODEL_ENDPOINTS.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: request.context, preferences: request.preferences }),
    });
  }

  return apiRequest<PersonalizedGenerationResponse>(PROFESSIONAL_MODEL_ENDPOINTS.resource, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resourceType: request.output,
      ...request.context,
      preferences: request.preferences,
    }),
  });
}
