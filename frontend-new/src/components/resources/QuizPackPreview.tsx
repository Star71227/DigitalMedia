/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React, { useMemo, useState } from "react";
import {
  describeApiError,
  submitLearningResourceQuiz,
  type LearningResource,
  type QuizSubmissionResult,
} from "../../api";

interface QuizQuestion {
  questionId: string;
  questionType: string;
  stem: string;
  options: string[];
  scoringPoints?: string[];
  personalizedHint: string;
  knowledgePoints: string[];
  difficulty: string;
}

interface QuizPack {
  title: string;
  difficultyDistribution: { foundation: number; intermediate: number; advanced: number };
  generationBasis: string[];
  questions: QuizQuestion[];
  evidenceStatus: string;
}

export default function QuizPackPreview({
  resource,
  content,
}: {
  resource: LearningResource;
  content: QuizPack;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizSubmissionResult | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const choiceQuestions = content.questions.filter((item) => item.options.length === 4);
  const resultByQuestionId = useMemo(
    () => new Map((result?.questionResults || []).map((item) => [item.questionId, item])),
    [result],
  );

  async function submit() {
    if (choiceQuestions.some((item) => answers[item.questionId] === undefined)) {
      setError("请完成全部选择题后再提交。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      setResult(
        await submitLearningResourceQuiz({
          resourceId: resource.id,
          version: resource.version,
          subject: resource.subject,
          answers: choiceQuestions.map((item) => ({
            questionId: item.questionId,
            answer: String.fromCharCode(65 + answers[item.questionId]),
            durationSeconds: 60,
          })),
        }),
      );
    } catch (caught) {
      setError(describeApiError(caught, "练习提交失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <strong className="text-slate-950">{content.title}</strong>
          <span className="text-xs font-semibold text-emerald-700">题库证据已确认</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          难度分布：基础 {content.difficultyDistribution.foundation} · 提高{" "}
          {content.difficultyDistribution.intermediate} · 综合 {content.difficultyDistribution.advanced}
        </p>
      </section>

      {content.questions.map((question, index) => {
        const submittedResult = resultByQuestionId.get(question.questionId);
        return (
          <article key={question.questionId} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 font-bold leading-7 text-slate-950">
                {index + 1}. {question.stem}
              </h3>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {question.options.length === 4 ? "选择题" : "思考题"} · {difficultyLabel(question.difficulty)}
              </span>
            </div>

            {question.options.length === 4 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {question.options.map((option, optionIndex) => (
                  <label
                    key={option}
                    className={`cursor-pointer rounded-lg border p-3 text-sm leading-6 ${answers[question.questionId] === optionIndex ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
                  >
                    <input
                      className="mr-2"
                      type="radio"
                      name={question.questionId}
                      checked={answers[question.questionId] === optionIndex}
                      onChange={() =>
                        setAnswers((current) => ({ ...current, [question.questionId]: optionIndex }))
                      }
                    />
                    {String.fromCharCode(65 + optionIndex)}. {option}
                  </label>
                ))}
              </div>
            ) : (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                {(question.scoringPoints || []).map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}

            <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-slate-700">
              提示：{question.personalizedHint}
            </p>
            {submittedResult && (
              <details className="mt-2 text-sm" open={submittedResult.isCorrect === false}>
                <summary className="cursor-pointer font-semibold text-slate-900">查看提交结果与解析</summary>
                <p className="mt-2 leading-6 text-slate-700">答案：{submittedResult.correctAnswer}</p>
                <p className="mt-1 leading-6 text-slate-700">{submittedResult.analysis}</p>
              </details>
            )}
          </article>
        );
      })}

      {choiceQuestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={submitting}
            onClick={() => void submit()}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "提交中..." : "提交选择题"}
          </button>
          {result && (
            <span className="text-sm font-semibold text-emerald-700">
              得分 {result.score}，答对 {result.correctCount}/{result.totalCount}
            </span>
          )}
        </div>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function difficultyLabel(value: string) {
  if (value === "foundation") return "基础";
  if (value === "intermediate") return "提高";
  if (value === "advanced") return "综合";
  return "练习";
}
