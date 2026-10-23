/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
interface CodeCase {
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
  verificationStatus: "verified" | "generated";
  codeExerciseId: string | null;
  codeLabEntry?: { exerciseId: string; route: string } | null;
  candidateCount?: number;
  selectionReason?: string;
  knowledgeNotice?: string;
  qualitySummary?: {
    trusted: boolean;
    executionMode: string;
    publicTestCount: number;
    hiddenTestCount: number;
    boundaryCategories: string[];
    referenceAccepted: boolean;
    knownBugCaught: boolean;
    fixedOutputCaught: boolean;
  };
}

export default function CodeCasePreview({
  content,
  onOpenCodeLab,
}: {
  content: CodeCase;
  onOpenCodeLab?: () => void;
}) {
  const verified = content.verificationStatus === "verified";
  const quality = content.qualitySummary;

  const openCodeLab = () => {
    const route =
      content.codeLabEntry?.route ||
      (content.codeExerciseId ? `/student/codelab/${encodeURIComponent(content.codeExerciseId)}` : "");
    if (route && typeof window !== "undefined") {
      window.history.pushState(null, "", route);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    onOpenCodeLab?.();
  };

  return (
    <div className="space-y-4">
      <section
        className={`rounded-lg border p-4 ${verified ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"}`}
      >
        <strong className={verified ? "text-emerald-900" : "text-amber-900"}>
          {verified ? "配套编程练习已准备好" : "编程练习内容待完善"}
        </strong>
        <p className="mt-2 text-sm leading-7 text-slate-700">{content.caseBackground}</p>
        {verified && quality && (
          <p className="mt-2 text-xs font-semibold text-emerald-800">
            已准备 {quality.publicTestCount + quality.hiddenTestCount} 组测试 · 覆盖{" "}
            {quality.boundaryCategories.length} 类边界情况
          </p>
        )}
        {content.knowledgeNotice && <p className="mt-2 text-xs text-slate-600">{content.knowledgeNotice}</p>}
        {!verified && (
          <p className="mt-2 text-xs font-semibold text-amber-800">该内容暂不计入本阶段完成进度。</p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-950">学习目标与任务</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
            {[...content.learningObjectives, ...content.tasks].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-950">输入输出说明</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">输入：{content.inputDescription}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">输出：{content.outputDescription}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-950">初始代码 · {content.language}</h3>
        <pre className="mt-3 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
          <code>{content.starterCode}</code>
        </pre>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-950">样例测试</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="p-2 font-semibold">说明</th>
                <th className="p-2 font-semibold">输入</th>
                <th className="p-2 font-semibold">预期输出</th>
              </tr>
            </thead>
            <tbody>
              {content.testCases.map((item, index) => (
                <tr key={`${item.description}-${index}`} className="border-t border-slate-100 align-top">
                  <td className="p-2 leading-6">{item.description}</td>
                  <td className="whitespace-pre-wrap p-2 font-mono text-xs">{item.input || "空"}</td>
                  <td className="whitespace-pre-wrap p-2 font-mono text-xs">
                    {item.expectedOutput || "待验证"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["边界条件", content.boundaryConditions],
          ["常见错误", content.commonErrors],
          ["进阶挑战", content.advancedChallenges],
        ].map(([title, items]) => (
          <div key={String(title)} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold text-slate-950">{title}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
              {(items as string[]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-950">代码讲解</h3>
        <p className="mt-2 text-sm leading-7 text-slate-700">{content.aiExplanation}</p>
      </section>

      {verified && (onOpenCodeLab || content.codeLabEntry || content.codeExerciseId) && (
        <button
          onClick={openCodeLab}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          进入 CodeLab
        </button>
      )}
    </div>
  );
}
