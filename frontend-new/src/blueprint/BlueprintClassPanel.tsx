/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DoorOpen,
  LogOut,
  RefreshCw,
  Search,
  Trophy,
  Users,
} from "lucide-react";
import {
  cancelClassJoinRequest,
  createClassJoinRequest,
  describeApiError,
  getClassDirectory,
  getMyAssignments,
  getMyClassRequests,
  getMyClasses,
  leaveClass,
  type AssignmentSummary,
  type ClassDirectoryItem,
  type ClassJoinRequest,
  type MyClassSummary,
} from "../api";

interface Props {
  /** 班级排名数据里的班级名/人数，用来和成员信息互相印证 */
  rankingClassName?: string;
  myRank?: number | null;
  total?: number;
  /** 点「去做作业 / 查看结果」时跳到作业页并定位到该次作业 */
  onOpenAssignment?: (assignmentId: number) => void;
}

type Busy = "" | "load" | "join" | `request:${number}` | `cancel:${number}` | `leave:${number}`;

function joinedLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dueLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 `;
}

/**
 * 班级排名页右侧的「班级信息」面板：
 * 我的班级（可退出）、待审核申请（可撤回）、加入班级（搜索班级目录后提交申请，等老师审核）。
 */
export default function BlueprintClassPanel({ rankingClassName, myRank, total, onOpenAssignment }: Props) {
  const [classes, setClasses] = useState<MyClassSummary[]>([]);
  const [requests, setRequests] = useState<ClassJoinRequest[]>([]);
  const [directory, setDirectory] = useState<ClassDirectoryItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentSummary[]>([]);
  const [showDirectory, setShowDirectory] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState<Busy>("load");
  const [notice, setNotice] = useState<{ kind: "ok" | "error" | "info"; text: string }>({
    kind: "info",
    text: "",
  });

  const loadAll = useCallback(async () => {
    setBusy("load");
    try {
      // 作业单独容错：拿不到作业不应该把班级信息整块打掉
      const [mine, myRequests, myAssignments] = await Promise.all([
        getMyClasses(),
        getMyClassRequests(),
        getMyAssignments().catch(() => [] as AssignmentSummary[]),
      ]);
      setClasses(mine.data);
      setRequests(myRequests.data.filter((item) => item.status === "pending"));
      setAssignments(myAssignments);
      setNotice({ kind: "info", text: "" });
    } catch (reason) {
      setNotice({ kind: "error", text: describeApiError(reason, "读取班级信息失败") });
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadDirectory = useCallback(async (value: string) => {
    setBusy("join");
    try {
      const result = await getClassDirectory(value);
      setDirectory(result.data);
      setNotice({ kind: "info", text: result.data.length ? "" : "没有找到匹配的班级" });
    } catch (reason) {
      setNotice({ kind: "error", text: describeApiError(reason, "读取班级列表失败") });
    } finally {
      setBusy("");
    }
  }, []);

  const myClassIds = useMemo(() => new Set(classes.map((item) => item.classId)), [classes]);
  const pendingClassIds = useMemo(() => new Set(requests.map((item) => item.classId)), [requests]);
  // 未交的排前面，其余按截止/发布时间倒序；列表最多展示 5 条，避免把班级信息面板拉太长
  const orderedAssignments = useMemo(() => {
    const weight = (item: AssignmentSummary) => (item.submitted ? 1 : 0);
    return [...assignments].sort((a, b) => {
      if (weight(a) !== weight(b)) return weight(a) - weight(b);
      const at = a.dueAt ? new Date(a.dueAt).getTime() : new Date(a.createdAt).getTime();
      const bt = b.dueAt ? new Date(b.dueAt).getTime() : new Date(b.createdAt).getTime();
      return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
    });
  }, [assignments]);
  const pendingAssignments = useMemo(() => assignments.filter((item) => !item.submitted), [assignments]);

  const submitRequest = async (item: ClassDirectoryItem) => {
    setBusy(`request:${item.classId}`);
    try {
      await createClassJoinRequest(item.classId, "学生端提交的入班申请");
      setNotice({ kind: "ok", text: `已向「${item.className}」提交入班申请，等待老师审核` });
      await loadAll();
    } catch (reason) {
      setNotice({ kind: "error", text: describeApiError(reason, "提交入班申请失败") });
    } finally {
      setBusy("");
    }
  };

  const withdraw = async (request: ClassJoinRequest) => {
    setBusy(`cancel:${request.requestId}`);
    try {
      await cancelClassJoinRequest(request.requestId);
      setNotice({ kind: "ok", text: `已撤回对「${request.className}」的入班申请` });
      await loadAll();
    } catch (reason) {
      setNotice({ kind: "error", text: describeApiError(reason, "撤回申请失败") });
    } finally {
      setBusy("");
    }
  };

  const quit = async (item: MyClassSummary) => {
    setBusy(`leave:${item.classId}`);
    try {
      await leaveClass(item.classId);
      setNotice({ kind: "ok", text: `已退出「${item.className}」，可以重新申请或加入其他班级` });
      await loadAll();
    } catch (reason) {
      setNotice({ kind: "error", text: describeApiError(reason, "退出班级失败") });
    } finally {
      setBusy("");
    }
  };

  return (
    <aside className="bp-class-panel" aria-label="班级信息">
      <header className="bp-class-panel__head">
        <div>
          <span>CLASS PROFILE</span>
          <h3>班级概况</h3>
        </div>
        <button
          type="button"
          className="bp-class-panel__refresh"
          onClick={() => void loadAll()}
          disabled={busy === "load"}
          aria-label="刷新班级信息"
        >
          <RefreshCw className={busy === "load" ? "is-spinning" : ""} />
        </button>
      </header>

      {rankingClassName ? (
        <p className="bp-class-panel__rank">
          <Trophy />
          <span>{rankingClassName}</span>
          {myRank != null ? (
            <b>
              第 {myRank} 名{total ? ` / ${total} 人` : ""}
            </b>
          ) : (
            <b>暂无排名</b>
          )}
        </p>
      ) : null}

      <section className="bp-class-panel__block">
        <h4>
          <Users />
          我的班级<em>{classes.length}</em>
        </h4>
        {classes.length ? (
          <ul className="bp-class-list">
            {classes.map((item) => (
              <li key={item.classId}>
                <div className="bp-class-list__main">
                  <strong>{item.className}</strong>
                  <small>
                    {[item.subject, `任课教师 ${item.teacherName}`, `${joinedLabel(item.joinedAt)} 加入`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <button
                  type="button"
                  className="bp-class-list__action is-danger"
                  disabled={busy === `leave:${item.classId}`}
                  onClick={() => void quit(item)}
                >
                  <LogOut />
                  {busy === `leave:${item.classId}` ? "退出中" : "退出班级"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bp-class-panel__empty">你还没有加入任何班级，可以从下方申请加入。</p>
        )}
      </section>

      {requests.length ? (
        <section className="bp-class-panel__block">
          <h4>
            <Clock3 />
            待审核申请<em>{requests.length}</em>
          </h4>
          <ul className="bp-class-list">
            {requests.map((item) => (
              <li key={item.requestId}>
                <div className="bp-class-list__main">
                  <strong>{item.className}</strong>
                  <small>
                    {[item.subject, `任课教师 ${item.teacherName}`, "等待老师审核"]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <button
                  type="button"
                  className="bp-class-list__action"
                  disabled={busy === `cancel:${item.requestId}`}
                  onClick={() => void withdraw(item)}
                >
                  {busy === `cancel:${item.requestId}` ? "撤回中" : "撤回申请"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="bp-class-panel__block">
        <h4>
          <DoorOpen />
          加入班级
        </h4>
        {showDirectory ? (
          <>
            <label className="bp-class-search">
              <Search aria-hidden="true" />
              <input
                value={keyword}
                placeholder="搜索班级名或老师姓名"
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void loadDirectory(keyword);
                  }
                }}
              />
              <button type="button" onClick={() => void loadDirectory(keyword)} disabled={busy === "join"}>
                {busy === "join" ? "查询中" : "搜索"}
              </button>
            </label>
            {directory.length ? (
              <ul className="bp-class-list">
                {directory.map((item) => {
                  const isMember = myClassIds.has(item.classId) || item.myStatus === "member";
                  const isPending = pendingClassIds.has(item.classId) || item.myStatus === "pending";
                  return (
                    <li key={item.classId}>
                      <div className="bp-class-list__main">
                        <strong>{item.className}</strong>
                        <small>
                          {[item.subject, `任课教师 ${item.teacherName}`, `${item.memberCount} 人`]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </div>
                      {isMember ? (
                        <span className="bp-class-list__state">
                          <CheckCircle2 />
                          已在班级
                        </span>
                      ) : isPending ? (
                        <span className="bp-class-list__state">
                          <Clock3 />
                          已申请
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="bp-class-list__action"
                          disabled={busy === `request:${item.classId}`}
                          onClick={() => void submitRequest(item)}
                        >
                          {busy === `request:${item.classId}` ? "提交中" : "申请加入"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="bp-class-panel__foot">
              <button
                type="button"
                className="bp-line-button"
                onClick={() => {
                  setShowDirectory(false);
                  setDirectory([]);
                  setKeyword("");
                }}
              >
                收起
              </button>
            </div>
          </>
        ) : (
          <div className="bp-class-panel__foot">
            <button
              type="button"
              className="bp-primary-action"
              onClick={() => {
                setShowDirectory(true);
                void loadDirectory("");
              }}
            >
              <DoorOpen />
              申请加入班级
            </button>
          </div>
        )}
      </section>

      {/*
        「我的作业」放在「加入班级」下面（老师发布 → 学生收作业 → 去做作业的入口）。
        这一块只占右侧班级信息面板的位置，不动左侧排行榜表格。
      */}
      <section className="bp-class-panel__block bp-class-panel__block--homework">
        <h4>
          <ClipboardList />
          我的作业
          {pendingAssignments.length ? (
            <em>{pendingAssignments.length} 待完成</em>
          ) : (
            <em>{assignments.length}</em>
          )}
        </h4>
        {assignments.length ? (
          <ul className="bp-homework-list">
            {orderedAssignments.slice(0, 5).map((item) => (
              <li key={item.id} className={item.submitted ? "is-done" : "is-pending"}>
                <div className="bp-homework-list__main">
                  <strong>{item.title}</strong>
                  <small>
                    {[
                      item.className,
                      item.teacherName ? `${item.teacherName} 布置` : "",
                      item.questionCount + item.codeExerciseCount > 0
                        ? `${item.questionCount + item.codeExerciseCount} 题`
                        : "",
                      item.dueAt ? `${dueLabel(item.dueAt)}截止` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </div>
                <div className="bp-homework-list__side">
                  {item.submitted ? (
                    <span className="bp-homework-state is-done">
                      <CheckCircle2 />
                      已交{item.score != null ? ` ${item.score} 分` : ""}
                    </span>
                  ) : (
                    <span className="bp-homework-state is-pending">
                      <Clock3 />
                      未交
                    </span>
                  )}
                  <button
                    type="button"
                    className="bp-class-list__action"
                    onClick={() => onOpenAssignment?.(item.id)}
                    disabled={!onOpenAssignment}
                  >
                    {item.submitted ? "查看结果" : "去做作业"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bp-class-panel__empty">
            {classes.length ? "老师还没有给你所在班级布置作业。" : "加入班级后，老师发布的作业会出现在这里。"}
          </p>
        )}
        {assignments.length > 5 ? (
          <div className="bp-class-panel__foot">
            <button
              type="button"
              className="bp-line-button"
              onClick={() => onOpenAssignment?.(orderedAssignments[0].id)}
              disabled={!onOpenAssignment}
            >
              查看全部 {assignments.length} 份作业
            </button>
          </div>
        ) : null}
      </section>

      {notice.text ? <p className={"bp-class-panel__notice is-" + notice.kind}>{notice.text}</p> : null}
    </aside>
  );
}
