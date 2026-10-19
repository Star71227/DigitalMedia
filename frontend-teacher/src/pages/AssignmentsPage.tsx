/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Plus, RefreshCw } from "lucide-react";
import {
  assignmentApi,
  MAX_CODE_EXERCISES_PER_ASSIGNMENT,
  MAX_FILL_BLANKS_PER_ASSIGNMENT,
  MAX_OPEN_QUESTIONS_PER_ASSIGNMENT,
  type AssignmentClassOption,
  type AssignmentSubjectOption,
  type CodeExerciseCandidate,
  type CreateAssignmentInput,
  type FillBlankCandidate,
  type OpenQuestionCandidate,
  type TeacherAssignmentItem,
} from "../api/assignments";
import {
  QUESTION_TYPE_FILL_BLANK,
  QUESTION_TYPE_SINGLE_CHOICE,
  questionBankApi,
  type BankQuestion,
} from "../api/questionBank";
import { Metric, PageTitle, State, fmt, pct } from "../components/Ui";
import { navigate } from "../router";
import { ElasticMount } from "../components/effects/ElasticMount";
import { MagneticButton } from "../components/effects/MagneticButton";
import { RevealOnScroll } from "../components/effects/RevealOnScroll";
import { useFlipList } from "../components/effects/useFlipList";

const EMPTY_FORM = { classId: "", title: "", description: "", subject: "", questionCount: "5", dueAt: "" };

/** 填空题的「正确答案」可能用 | 分隔多个可接受写法（如 递增|升序|有序），拆成「/」展示更好读 */
function acceptedAnswersLabel(answer: string) {
  return String(answer || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" / ");
}

export function AssignmentsPage() {
  const [data, setData] = useState<TeacherAssignmentItem[]>();
  const [classes, setClasses] = useState<AssignmentClassOption[]>([]);
  const [subjects, setSubjects] = useState<AssignmentSubjectOption[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [codeOptions, setCodeOptions] = useState<CodeExerciseCandidate[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [codeLimit, setCodeLimit] = useState(MAX_CODE_EXERCISES_PER_ASSIGNMENT);
  const [fillOptions, setFillOptions] = useState<FillBlankCandidate[]>([]);
  const [fillLoading, setFillLoading] = useState(false);
  const [fillError, setFillError] = useState("");
  const [selectedFillIds, setSelectedFillIds] = useState<string[]>([]);
  const [openOptions, setOpenOptions] = useState<OpenQuestionCandidate[]>([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [openError, setOpenError] = useState("");
  const [selectedOpenIds, setSelectedOpenIds] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const { ref: listGridRef, record: recordList } = useFlipList<HTMLDivElement>();

  const load = useCallback(async () => {
    setError("");
    try {
      const [list, options] = await Promise.all([assignmentApi.list(), assignmentApi.options()]);
      /* 重载前捕获旧列表位置,新数据提交后 FLIP 平滑补位(首载时网格未挂载,自动跳过) */
      recordList();
      setData(list.data || []);
      setClasses(options.classes || []);
      setSubjects(options.subjects || []);
      setCodeLimit(
        options.maxCodeExercises && options.maxCodeExercises > 0
          ? options.maxCodeExercises
          : MAX_CODE_EXERCISES_PER_ASSIGNMENT,
      );
      setForm((current) => ({
        ...current,
        classId: current.classId || (options.classes?.[0] ? String(options.classes[0].id) : ""),
        subject: current.subject || (options.subjects?.[0] ? options.subjects[0].subject : ""),
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "作业列表加载失败");
    }
  }, [recordList]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadBankQuestions = useCallback(async (subject: string) => {
    if (!subject) {
      setBankQuestions([]);
      return;
    }
    setBankLoading(true);
    try {
      const result = await questionBankApi.questions({ subject, limit: 200 });
      setBankQuestions(result.data || []);
    } catch (failure) {
      setBankQuestions([]);
      setFormError(failure instanceof Error ? failure.message : "题库读取失败");
    } finally {
      setBankLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!creating || mode !== "manual" || !form.subject) return;
    void loadBankQuestions(form.subject);
  }, [creating, mode, form.subject, loadBankQuestions]);

  // 代码题候选按当前科目拉取；与「自动抽题 / 手动选题」无关，两种模式都能挂代码题
  const loadCodeExercises = useCallback(async (subject: string) => {
    if (!subject) {
      setCodeOptions([]);
      return;
    }
    setCodeLoading(true);
    setCodeError("");
    try {
      const result = await assignmentApi.codeExercises(subject);
      setCodeOptions(result.data || []);
    } catch (failure) {
      setCodeOptions([]);
      setCodeError(failure instanceof Error ? failure.message : "代码题候选加载失败");
    } finally {
      setCodeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!creating) return;
    void loadCodeExercises(form.subject);
  }, [creating, form.subject, loadCodeExercises]);

  // 填空题候选：复用题库接口按题型过滤（questionType=fill_blank），与模式无关，两种模式都能挂
  const loadFillBlanks = useCallback(async (subject: string) => {
    if (!subject) {
      setFillOptions([]);
      return;
    }
    setFillLoading(true);
    setFillError("");
    try {
      const result = await questionBankApi.fillBlanks(subject, 100);
      setFillOptions(result.data || []);
    } catch (failure) {
      setFillOptions([]);
      setFillError(failure instanceof Error ? failure.message : "填空题候选加载失败");
    } finally {
      setFillLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!creating) return;
    void loadFillBlanks(form.subject);
  }, [creating, form.subject, loadFillBlanks]);

  // 简答题候选：后端单独一张 open_question_bank，同样是「挂载」而不是抽题，两种模式都能挂
  const loadOpenQuestions = useCallback(async (subject: string) => {
    if (!subject) {
      setOpenOptions([]);
      return;
    }
    setOpenLoading(true);
    setOpenError("");
    try {
      const result = await assignmentApi.openQuestions(subject);
      setOpenOptions(result.data || []);
    } catch (failure) {
      setOpenOptions([]);
      setOpenError(failure instanceof Error ? failure.message : "简答题候选加载失败");
    } finally {
      setOpenLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!creating) return;
    void loadOpenQuestions(form.subject);
  }, [creating, form.subject, loadOpenQuestions]);

  const selectedSubject = subjects.find((item) => item.subject === form.subject);
  // 手动选题列表只列单选题：填空题有独立的选择区，混进 questionIds 会被后端按题型校验拒绝
  const selectableBankQuestions = bankQuestions.filter(
    (item) => (item.questionType || QUESTION_TYPE_SINGLE_CHOICE) !== QUESTION_TYPE_FILL_BLANK,
  );
  const myQuestionCount = selectableBankQuestions.filter((item) => item.mine).length;

  const toggleCodeExercise = (exerciseId: string) => {
    if (selectedCodeIds.includes(exerciseId)) {
      setSelectedCodeIds(selectedCodeIds.filter((id) => id !== exerciseId));
      setCodeError("");
      return;
    }
    if (selectedCodeIds.length >= codeLimit) {
      setCodeError(`一份作业最多挂 ${codeLimit} 道代码题，请先取消其它勾选。`);
      return;
    }
    setSelectedCodeIds([...selectedCodeIds, exerciseId]);
    setCodeError("");
  };

  const toggleFillBlank = (questionId: string) => {
    if (selectedFillIds.includes(questionId)) {
      setSelectedFillIds(selectedFillIds.filter((id) => id !== questionId));
      setFillError("");
      return;
    }
    if (selectedFillIds.length >= MAX_FILL_BLANKS_PER_ASSIGNMENT) {
      setFillError(`一份作业最多挂 ${MAX_FILL_BLANKS_PER_ASSIGNMENT} 道填空题，请先取消其它勾选。`);
      return;
    }
    setSelectedFillIds([...selectedFillIds, questionId]);
    setFillError("");
  };

  const toggleOpenQuestion = (openQuestionId: string) => {
    if (selectedOpenIds.includes(openQuestionId)) {
      setSelectedOpenIds(selectedOpenIds.filter((id) => id !== openQuestionId));
      setOpenError("");
      return;
    }
    if (selectedOpenIds.length >= MAX_OPEN_QUESTIONS_PER_ASSIGNMENT) {
      setOpenError(`一份作业最多挂 ${MAX_OPEN_QUESTIONS_PER_ASSIGNMENT} 道简答题，请先取消其它勾选。`);
      return;
    }
    setSelectedOpenIds([...selectedOpenIds, openQuestionId]);
    setOpenError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!form.classId) {
      setFormError("请选择要发布的班级。");
      return;
    }
    if (!title) {
      setFormError("请填写作业标题。");
      return;
    }
    if (Array.from(title).length > 160) {
      setFormError("作业标题不能超过160个字符。");
      return;
    }
    if (!form.subject) {
      setFormError("请选择科目。");
      return;
    }

    const codeExerciseIds = selectedCodeIds.slice(0, codeLimit);
    const fillBlankIds = selectedFillIds.slice(0, MAX_FILL_BLANKS_PER_ASSIGNMENT);
    const openQuestionIds = selectedOpenIds.slice(0, MAX_OPEN_QUESTIONS_PER_ASSIGNMENT);
    const payload: CreateAssignmentInput = {
      classId: Number(form.classId),
      title,
      description: form.description.trim() || undefined,
      subject: form.subject,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
      // 填空题、简答题和代码题一样是「挂」在作业上的，与自动抽题 / 手动选题无关
      fillBlankIds: fillBlankIds.length ? fillBlankIds : undefined,
      openQuestionIds: openQuestionIds.length ? openQuestionIds : undefined,
      codeExerciseIds: codeExerciseIds.length ? codeExerciseIds : undefined,
    };

    if (mode === "manual") {
      if (!selectedIds.length && !codeExerciseIds.length) {
        setFormError(
          fillBlankIds.length || openQuestionIds.length
            ? "手动选题模式下，填空题 / 简答题需要和单选题或代码题一起发布：请至少勾选一道单选题，或至少勾选一道代码题。"
            : "手动选题模式下请至少勾选一道单选题，或至少勾选一道代码题。",
        );
        return;
      }
      if (selectedIds.length) {
        payload.questionIds = selectedIds;
      } else {
        // 纯代码题作业：显式传 0，后端据此跳过自动抽题
        payload.questionCount = 0;
      }
    } else {
      const count = Number(form.questionCount);
      const min = codeExerciseIds.length ? 0 : 1;
      if (!Number.isInteger(count) || count < min || count > 50) {
        setFormError(
          codeExerciseIds.length
            ? "题目数量需为0至50之间的整数（填 0 表示只发代码题）。"
            : "题目数量需为1至50之间的整数。",
        );
        return;
      }
      payload.questionCount = count;
    }

    setBusy(true);
    setFormError("");
    try {
      await assignmentApi.create(payload);
      setForm({ ...EMPTY_FORM, classId: form.classId, subject: form.subject });
      setSelectedIds([]);
      setSelectedCodeIds([]);
      setSelectedFillIds([]);
      setSelectedOpenIds([]);
      setCreating(false);
      await load();
    } catch (failure) {
      setFormError(failure instanceof Error ? failure.message : "发布作业失败");
    } finally {
      setBusy(false);
    }
  };

  const list = data || [];
  const totalStudents = list.reduce((sum, item) => sum + item.studentCount, 0);
  const totalSubmitted = list.reduce((sum, item) => sum + item.submittedCount, 0);

  return (
    <>
      <PageTitle
        title="作业与测试"
        description="选择班级、科目与题量发布作业，也可以手动勾选题目（含你自己加进题库的题）；需要让学生动手写代码时，可以再挂上 CodeLab 代码题。学生提交后这里可以看到提交情况与统计结果。"
        action={
          <MagneticButton
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500"
            ripple
            onClick={() => {
              setCreating((value) => !value);
              setFormError("");
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {creating ? "收起发布表单" : "发布作业"}
          </MagneticButton>
        }
      />

      {creating && (
        <ElasticMount className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <form onSubmit={submit}>
            <h2 className="text-base font-semibold">发布新作业</h2>
            <p className="mt-1 text-sm text-slate-500">
              题目来自真实题库；自动抽题会优先使用你自己加的题，也可以手动勾选。
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={`inline-flex h-10 items-center rounded-md px-4 text-sm ${mode === "auto" ? "bg-brand-600 text-white" : "border border-slate-300"}`}
                onClick={() => setMode("auto")}
              >
                按科目自动抽题
              </button>
              <button
                type="button"
                className={`inline-flex h-10 items-center rounded-md px-4 text-sm ${mode === "manual" ? "bg-brand-600 text-white" : "border border-slate-300"}`}
                onClick={() => setMode("manual")}
              >
                手动选择题
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600">班级</span>
                <select
                  className="control mt-1 w-full"
                  value={form.classId}
                  onChange={(event) => setForm({ ...form, classId: event.target.value })}
                >
                  {!classes.length && <option value="">暂无可发布班级</option>}
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.className}（{item.subject} · {item.studentCount} 人）
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">科目（来自题库）</span>
                <select
                  className="control mt-1 w-full"
                  value={form.subject}
                  onChange={(event) => {
                    setForm({ ...form, subject: event.target.value });
                    setSelectedIds([]);
                    setSelectedCodeIds([]);
                    setCodeError("");
                    setSelectedFillIds([]);
                    setFillError("");
                    setSelectedOpenIds([]);
                    setOpenError("");
                  }}
                >
                  {!subjects.length && <option value="">题库暂无可选科目</option>}
                  {subjects.map((item) => (
                    <option key={item.subject} value={item.subject}>
                      {item.subject}（可用 {item.questionCount} 题
                      {item.ownCount ? ` · 我的 ${item.ownCount}` : ""}）
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">作业标题</span>
                <input
                  className="control mt-1 w-full"
                  value={form.title}
                  maxLength={160}
                  placeholder="例如：数据结构第 2 次作业"
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </label>
              {mode === "auto" ? (
                <label className="block text-sm">
                  <span className="text-slate-600">题目数量</span>
                  <input
                    className="control mt-1 w-full"
                    type="number"
                    min={selectedCodeIds.length ? 0 : 1}
                    max={50}
                    value={form.questionCount}
                    onChange={(event) => setForm({ ...form, questionCount: event.target.value })}
                  />
                  {selectedSubject && (
                    <span className="mt-1 block text-xs text-slate-500">
                      该科目当前可用 {selectedSubject.questionCount} 题
                      {selectedSubject.ownCount
                        ? `（其中你的题 ${selectedSubject.ownCount} 道，会优先抽取）`
                        : ""}
                    </span>
                  )}
                  {selectedCodeIds.length > 0 && (
                    <span className="mt-1 block text-xs text-brand-700">
                      已勾选 {selectedCodeIds.length} 道代码题：把数量填 0 就只发代码题，学生端只需提交代码。
                    </span>
                  )}
                </label>
              ) : (
                <div className="block text-sm">
                  <span className="text-slate-600">已选题目</span>
                  <div className="mt-1 flex h-11 items-center gap-3 rounded-md border border-slate-300 px-3 text-sm">
                    <span className="font-semibold">{selectedIds.length}</span>
                    <span className="text-slate-500">
                      道已选中（共 {selectableBankQuestions.length} 道可选
                      {myQuestionCount ? `，其中我的题 ${myQuestionCount} 道` : ""}）
                    </span>
                    {bankLoading && <RefreshCw size={14} className="animate-spin" aria-hidden="true" />}
                  </div>
                  {selectedIds.length === 0 && selectedCodeIds.length > 0 && (
                    <span className="mt-1 block text-xs text-brand-700">
                      不选单选题也发布：本次将是一份只含代码题的作业。
                    </span>
                  )}
                </div>
              )}
              <label className="block text-sm">
                <span className="text-slate-600">截止时间（可选）</span>
                <input
                  className="control mt-1 w-full"
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">作业说明（可选）</span>
                <input
                  className="control mt-1 w-full"
                  value={form.description}
                  maxLength={500}
                  placeholder="例如：覆盖线性表与树的基础题"
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </label>
            </div>

            {mode === "manual" && (
              <div className="mt-5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                  <strong>从题库勾选单选题</strong>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                      onClick={() => setSelectedIds(selectableBankQuestions.map((item) => item.questionId))}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                      onClick={() => setSelectedIds([])}
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                      onClick={() =>
                        setSelectedIds(
                          selectableBankQuestions.filter((item) => item.mine).map((item) => item.questionId),
                        )
                      }
                    >
                      只选我的题
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {bankLoading && <p className="p-3 text-sm text-slate-500">正在读取题库…</p>}
                  {!bankLoading && !selectableBankQuestions.length && (
                    <p className="p-3 text-sm text-slate-500">
                      该科目暂无单选题可选（填空题请在下面的填空题区勾选），也可先到「题库管理」新增自己的题。
                    </p>
                  )}
                  {selectableBankQuestions.map((question) => {
                    const checked = selectedIds.includes(question.questionId);
                    return (
                      <label
                        key={question.questionId}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm ${checked ? "bg-brand-50" : "hover:bg-slate-50"}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() =>
                            setSelectedIds((current) =>
                              checked
                                ? current.filter((id) => id !== question.questionId)
                                : [...current, question.questionId],
                            )
                          }
                        />
                        <span>
                          <span className="mr-2 text-xs text-slate-500">
                            {question.knowledgePoint || question.subject}
                            {question.difficulty ? ` · ${question.difficulty}` : ""}
                          </span>
                          {question.mine && (
                            <span className="mr-2 rounded-md bg-brand-100 px-1.5 py-0.5 text-xs text-brand-700">
                              我的
                            </span>
                          )}
                          <span>
                            {question.stem.length > 60 ? `${question.stem.slice(0, 60)}…` : question.stem}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">答案 {question.answer}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm">
                <strong>代码题（可选）</strong>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">
                    已选 <span className="font-semibold text-slate-700">{selectedCodeIds.length}</span>/
                    {codeLimit} 道
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                    onClick={() =>
                      setSelectedCodeIds(codeOptions.slice(0, codeLimit).map((item) => item.exerciseId))
                    }
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                    onClick={() => {
                      setSelectedCodeIds([]);
                      setCodeError("");
                    }}
                  >
                    清空
                  </button>
                </div>
              </div>
              <p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
                来自 CodeLab 题库，按科目筛选；代码题的科目需与上面的科目一致。只发代码题时把「题目数量」设为
                0 即可，学生端只需提交代码。
              </p>
              <div className="max-h-80 overflow-y-auto p-2">
                {codeLoading && <p className="p-3 text-sm text-slate-500">正在读取代码题…</p>}
                {!codeLoading && codeError && (
                  <p className="p-3 text-sm text-rose-700" role="alert">
                    {codeError}
                  </p>
                )}
                {!codeLoading && !codeError && !codeOptions.length && (
                  <p className="p-3 text-sm text-slate-500">该科目暂无已发布的代码题。</p>
                )}
                {codeOptions.map((item) => {
                  const checked = selectedCodeIds.includes(item.exerciseId);
                  return (
                    <label
                      key={item.exerciseId}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm ${checked ? "bg-brand-50" : "hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleCodeExercise(item.exerciseId)}
                      />
                      <span>
                        <span className="mr-2 text-xs text-slate-500">
                          {item.knowledgePoint || item.subject}
                          {item.difficulty ? ` · ${item.difficulty}` : ""}
                        </span>
                        <span className="mr-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {item.language}
                        </span>
                        <span className="font-medium">{item.title}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          用例 {item.caseCount} 道（隐藏 {item.hiddenCount}）
                        </span>
                        {item.description && (
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {item.description.length > 100
                              ? `${item.description.slice(0, 100)}…`
                              : item.description}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm">
                <strong>填空题（可选）</strong>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">
                    已选 <span className="font-semibold text-slate-700">{selectedFillIds.length}</span>/
                    {MAX_FILL_BLANKS_PER_ASSIGNMENT} 道
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                    onClick={() =>
                      setSelectedFillIds(
                        fillOptions.slice(0, MAX_FILL_BLANKS_PER_ASSIGNMENT).map((item) => item.questionId),
                      )
                    }
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                    onClick={() => {
                      setSelectedFillIds([]);
                      setFillError("");
                    }}
                  >
                    清空
                  </button>
                </div>
              </div>
              <p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
                来自题库里的填空题（题型
                fill_blank），按科目筛选；和代码题一样是「挂」在作业上的，自动抽题与手动选题两种模式下都能挂。学生按文本作答，正确答案里用
                | 分隔的多个答案都算对。
              </p>
              <div className="max-h-80 overflow-y-auto p-2">
                {fillLoading && <p className="p-3 text-sm text-slate-500">正在读取填空题…</p>}
                {!fillLoading && fillError && (
                  <p className="p-3 text-sm text-rose-700" role="alert">
                    {fillError}
                  </p>
                )}
                {!fillLoading && !fillError && !fillOptions.length && (
                  <p className="p-3 text-sm text-slate-500">该科目暂无填空题。</p>
                )}
                {fillOptions.map((item) => {
                  const checked = selectedFillIds.includes(item.questionId);
                  const stem = item.stem || "";
                  return (
                    <label
                      key={item.questionId}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm ${checked ? "bg-brand-50" : "hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleFillBlank(item.questionId)}
                      />
                      <span>
                        <span className="mr-2 text-xs text-slate-500">
                          {item.knowledgePoint || item.chapter || item.subject}
                          {item.difficulty ? ` · ${item.difficulty}` : ""}
                        </span>
                        <span className="mr-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          填空
                        </span>
                        <span>{stem.length > 60 ? `${stem.slice(0, 60)}…` : stem}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          答案 {acceptedAnswersLabel(item.answer)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-sm">
                <strong>简答题（可选）</strong>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">
                    已选 <span className="font-semibold text-slate-700">{selectedOpenIds.length}</span>/
                    {MAX_OPEN_QUESTIONS_PER_ASSIGNMENT} 道
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                    onClick={() =>
                      setSelectedOpenIds(
                        openOptions
                          .slice(0, MAX_OPEN_QUESTIONS_PER_ASSIGNMENT)
                          .map((item) => item.openQuestionId),
                      )
                    }
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs"
                    onClick={() => {
                      setSelectedOpenIds([]);
                      setOpenError("");
                    }}
                  >
                    清空
                  </button>
                </div>
              </div>
              <p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
                来自简答题题库，按科目筛选；两种模式下都能挂。简答题没有自动判分，学生提交后需要你在「查看提交与统计」里逐份查看，所以一份作业最多挂{" "}
                {MAX_OPEN_QUESTIONS_PER_ASSIGNMENT} 道。
              </p>
              <div className="max-h-80 overflow-y-auto p-2">
                {openLoading && <p className="p-3 text-sm text-slate-500">正在读取简答题…</p>}
                {!openLoading && openError && (
                  <p className="p-3 text-sm text-rose-700" role="alert">
                    {openError}
                  </p>
                )}
                {!openLoading && !openError && !openOptions.length && (
                  <p className="p-3 text-sm text-slate-500">该科目暂无简答题。</p>
                )}
                {openOptions.map((item) => {
                  const checked = selectedOpenIds.includes(item.openQuestionId);
                  return (
                    <label
                      key={item.openQuestionId}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm ${checked ? "bg-brand-50" : "hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleOpenQuestion(item.openQuestionId)}
                      />
                      <span>
                        <span className="mr-2 text-xs text-slate-500">
                          {[item.knowledgePoint || item.chapter || item.subject, item.difficulty]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="mr-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          简答
                        </span>
                        <span>{item.prompt.length > 80 ? `${item.prompt.slice(0, 80)}…` : item.prompt}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <span className="font-medium text-slate-700">本次作业题型：</span>
              <span className="rounded-md bg-white px-2 py-1">
                单选题 {mode === "auto" ? `自动抽 ${form.questionCount || 0} 道` : `${selectedIds.length} 道`}
              </span>
              <span className="rounded-md bg-white px-2 py-1">填空题 {selectedFillIds.length} 道</span>
              <span className="rounded-md bg-white px-2 py-1">简答题 {selectedOpenIds.length} 道</span>
              <span className="rounded-md bg-white px-2 py-1">代码题 {selectedCodeIds.length} 道</span>
              {mode === "manual" &&
                (selectedFillIds.length > 0 || selectedOpenIds.length > 0) &&
                !selectedIds.length &&
                !selectedCodeIds.length && (
                  <span className="text-amber-700">
                    手动选题模式下还需勾选至少一道单选题或一道代码题才能发布。
                  </span>
                )}
            </div>

            {formError && (
              <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                {formError}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {busy ? "正在发布…" : "发布并通知班级"}
              </button>
              <button
                type="button"
                disabled={busy}
                className="h-11 rounded-full border border-slate-300 px-4 text-sm"
                onClick={() => {
                  setCreating(false);
                  setFormError("");
                }}
              >
                取消
              </button>
            </div>
          </form>
        </ElasticMount>
      )}

      <State
        loading={!data && !error}
        error={error}
        empty={Boolean(data && data.length === 0)}
        onRetry={() => void load()}
      >
        {data && (
          <RevealOnScroll stagger={0.1}>
            <div className="mt-5 grid gap-4 md:grid-cols-3" data-reveal>
              <Metric
                label="作业总数"
                value={list.length}
                countUpTo={list.length}
                detail="本账号发布的作业与测试"
              />
              <Metric
                label="应交人次"
                value={totalStudents}
                countUpTo={totalStudents}
                detail="班级在册学生 × 作业"
              />
              <Metric
                label="已交人次"
                value={totalSubmitted}
                countUpTo={totalSubmitted}
                detail={
                  totalStudents
                    ? `提交率 ${pct(Math.round((totalSubmitted / totalStudents) * 100))}`
                    : "暂无应交人次"
                }
                tone="green"
              />
            </div>

            {data.length > 0 && (
              <div ref={listGridRef} className="mt-6 grid gap-4 md:grid-cols-2" data-reveal>
                {data.map((item) => {
                  const codeCount = item.codeExerciseCount ?? 0;
                  return (
                    <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base font-semibold">{item.title}</h2>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {item.status === "closed" ? "已关闭" : "进行中"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.className} · {item.subject} ·{" "}
                        {codeCount ? `单选题 ${item.questionCount} 道` : `共 ${item.questionCount} 题`}
                      </p>
                      {codeCount > 0 && (
                        <p className="mt-1 text-sm text-slate-600">
                          代码题 {codeCount} 道 · 已提交 {item.codeSubmittedCount ?? 0} 人次
                        </p>
                      )}
                      {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
                      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500">已提交</dt>
                          <dd className="mt-0.5 font-semibold">
                            {item.submittedCount}/{item.studentCount}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">平均分</dt>
                          <dd className="mt-0.5 font-semibold">
                            {item.averageScore === null ? "暂无数据" : `${item.averageScore} 分`}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">截止</dt>
                          <dd className="mt-0.5 font-semibold">{item.dueAt ? fmt(item.dueAt) : "未设置"}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex gap-3">
                        <button
                          type="button"
                          className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500"
                          onClick={() => navigate(`/assignments/${item.id}`)}
                        >
                          <ClipboardList size={16} aria-hidden="true" />
                          查看提交与统计
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </RevealOnScroll>
        )}
      </State>
    </>
  );
}
