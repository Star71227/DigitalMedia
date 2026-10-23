/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Search, UserMinus, UserPlus } from "lucide-react";
import { teacherApi } from "../api/teacher";
import { PageTitle, State } from "../components/Ui";
import { navigate } from "../router";
import type { ClassCandidate, ClassMember, ClassSummary } from "../types";

export function ClassStudentsPage({ classId }: { classId: number }) {
  const [classInfo, setClassInfo] = useState<ClassSummary | undefined>();
  const [members, setMembers] = useState<ClassMember[] | undefined>();
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<ClassCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [hint, setHint] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await teacherApi.classStudents(classId);
      setClassInfo(result.class);
      setMembers(result.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "班级成员读取失败");
      setMembers([]);
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const search = async () => {
    const value = keyword.trim();
    setActionError("");
    if (Array.from(value).length < 2) {
      setCandidates([]);
      setHint("请输入至少 2 个字符的用户名、学号或姓名");
      return;
    }
    setSearching(true);
    setHint("");
    try {
      const result = await teacherApi.searchStudents(value, classId);
      setCandidates(result.data);
      if (!result.data.length) setHint("没有匹配的学生账号。学生需要先到学生端自助注册。");
    } catch (requestError) {
      setCandidates([]);
      setHint(requestError instanceof Error ? requestError.message : "搜索学生失败");
    } finally {
      setSearching(false);
    }
  };

  const add = async (candidate: ClassCandidate) => {
    setBusyId(candidate.studentId);
    setActionError("");
    try {
      await teacherApi.addClassStudent(classId, { studentId: candidate.studentId });
      await load();
      setCandidates((current) =>
        current.map((item) =>
          item.studentId === candidate.studentId ? { ...item, inThisClass: true } : item,
        ),
      );
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "加入班级失败");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (member: ClassMember) => {
    setBusyId(member.studentId);
    setActionError("");
    try {
      await teacherApi.removeClassStudent(classId, member.studentId);
      await load();
      setCandidates((current) =>
        current.map((item) => (item.studentId === member.studentId ? { ...item, inThisClass: false } : item)),
      );
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "移出班级失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageTitle
        title={classInfo ? `${classInfo.className} · 成员管理` : "班级成员管理"}
        description={
          classInfo
            ? `${classInfo.subject} · 当前 ${classInfo.studentCount} 名学生`
            : "把学生加入班级后，教师端看板、测验与学情分析会自动统计他们"
        }
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/classes")}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              返回班级列表
            </button>
            <button
              type="button"
              onClick={() => navigate(`/classes/${classId}/analytics`)}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
            >
              <BarChart3 size={16} aria-hidden="true" />
              查看班级学情
            </button>
          </div>
        }
      />

      {actionError && (
        <div
          className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">添加学生</h2>
        <p className="mt-1 text-sm text-slate-500">
          按用户名、学号或姓名搜索学生账号（至少 2 个字符）。学生需要先在学生端自助注册。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            placeholder="例如 zhangsan 或 张同学"
            maxLength={100}
            className="h-11 min-w-[240px] flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={() => void search()}
            disabled={searching}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-60"
          >
            <Search size={16} aria-hidden="true" />
            {searching ? "搜索中…" : "搜索学生"}
          </button>
        </div>
        {hint && <p className="mt-3 text-sm text-slate-500">{hint}</p>}
        {candidates.length > 0 && (
          <ul className="mt-4 border-t border-slate-100">
            {candidates.map((candidate) => (
              <li
                key={candidate.studentId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3"
              >
                <div className="text-sm">
                  <span className="font-medium text-slate-900">{candidate.displayName}</span>
                  <span className="ml-2 text-slate-500">
                    {candidate.username} · {candidate.studentNo}
                  </span>
                </div>
                {candidate.inThisClass ? (
                  <span className="text-xs text-emerald-700">已在班级中</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void add(candidate)}
                    disabled={busyId === candidate.studentId}
                    className="inline-flex h-11 items-center gap-2 rounded-md border border-brand-300 bg-brand-50 px-4 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-60"
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    加入班级
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">班级成员</h2>
        <State loading={!members && !error} error={error} onRetry={() => void load()}>
          {(members || []).length ? (
            <ul className="mt-4">
              {(members || []).map((member) => (
                <li
                  key={member.studentId}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0"
                >
                  <div className="text-sm">
                    <span className="font-medium text-slate-900">{member.displayName}</span>
                    <span className="ml-2 text-slate-500">
                      {member.username} · {member.studentNo}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/students/${member.studentId}`)}
                      className="h-11 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      查看学情
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(member)}
                      disabled={busyId === member.studentId}
                      className="inline-flex h-11 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      <UserMinus size={16} aria-hidden="true" />
                      移出班级
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              还没有学生加入这个班级。用上面的搜索把学生加进来，教师端看板就会立刻出现他们的数据。
            </p>
          )}
        </State>
      </section>
    </>
  );
}
