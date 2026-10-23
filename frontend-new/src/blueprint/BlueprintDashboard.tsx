/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookCheck,
  CalendarCheck,
  ClipboardCheck,
  Code2,
  Map,
  Play,
  TimerReset,
} from "lucide-react";
import {
  getDailyCheckIn,
  getDailyStudyTime,
  getLearningPath,
  getMyClasses,
  getStudentOverview,
  postDailyCheckIn,
  type DailyCheckInSummary,
  type MyClassSummary,
  type StudentOverview,
  type StudyTimeSummary,
} from "../api";
import type { LearningPathResponse } from "../types";
import { labelProps } from "./motion/Motion";
import { BlueprintHeader, BlueprintMotif, TreeRingGraphic } from "./BlueprintDecorations";
import { dailyFortune, fortuneDateKey } from "./fortune";
import { CountUp } from "../components/effects/CountUp";
import { RevealOnScroll } from "../components/effects/RevealOnScroll";

interface Props {
  onNavigateToTab: (tab: string, data?: unknown) => void;
}

export default function BlueprintDashboard({ onNavigateToTab }: Props) {
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [studyTime, setStudyTime] = useState<StudyTimeSummary | null>(null);
  const [checkIn, setCheckIn] = useState<DailyCheckInSummary | null>(null);
  const [classes, setClasses] = useState<MyClassSummary[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);

  /* 打卡 = 抽签：成功返回的签到摘要会带上今天的记录，签运卡随之揭晓、日历当天标红 */
  const handleCheckIn = useCallback(async () => {
    setCheckingIn(true);
    try {
      const summary = await postDailyCheckIn();
      setCheckIn(summary);
    } catch {
      /* 打卡失败时保持未揭晓状态，按钮可再点 */
    } finally {
      setCheckingIn(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      getStudentOverview(),
      getLearningPath(),
      getDailyStudyTime(7),
      getDailyCheckIn(),
      getMyClasses(),
    ]).then((results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") setOverview(results[0].value);
      if (results[1].status === "fulfilled") setPath(results[1].value);
      if (results[2].status === "fulfilled") setStudyTime(results[2].value);
      if (results[3].status === "fulfilled") setCheckIn(results[3].value);
      if (results[4].status === "fulfilled") setClasses(results[4].value.data);
    });
    return () => {
      active = false;
    };
  }, []);

  const activeStage = useMemo(
    () =>
      path?.stages.find((stage) => stage.status === "active") ||
      path?.stages.find((stage) => stage.status !== "completed") ||
      path?.stages[0],
    [path],
  );
  const todayMinutes = studyTime?.days.at(-1)?.minutes ?? 0;
  const mastery = overview?.profile.overallMastery ?? 0;
  const course = activeStage?.subject || overview?.profile.currentCourse || "尚未选择课程";
  const currentFocus = activeStage?.knowledgePoints?.slice(0, 2).join("、");

  return (
    <section className="bp-page bp-dashboard">
      <BlueprintMotif variant="branch" />
      <BlueprintHeader title="学习首页" english="STUDENT DASHBOARD" />

      <RevealOnScroll className="lm-reveal-contents" stagger={0.06} y={0}>
        <div className="bp-dashboard__topline">
          <div className="bp-dashboard__greeting">
            <h2>
              早上好，<span>{overview?.studentName || "同学"}</span>
            </h2>
            <p>持续的努力，会让复杂的问题变得清晰。</p>
            <ClassStrip classes={classes} />
          </div>
          <FortuneCard
            name={overview?.studentName || "同学"}
            checkIn={checkIn}
            checkingIn={checkingIn}
            onCheckIn={() => void handleCheckIn()}
          />
        </div>

        <div className="bp-dashboard__hero">
          <div className="bp-dashboard__rings">
            <TreeRingGraphic />
            <div className="bp-ring-stat is-top">
              <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F05" data-mg-behavior="reveal">
                <CountUp to={todayMinutes} duration={0.32} />
              </strong>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">
                分钟
                <br />
                今日学习时长
              </span>
            </div>
            <div className="bp-ring-stat is-left">
              <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F05" data-mg-behavior="reveal">
                <CountUp to={Math.round(mastery)} duration={0.32} />%
              </strong>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">
                正确率
                <br />
                <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">ACCURACY</small>
              </span>
            </div>
            <div className="bp-ring-stat is-right">
              <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F05" data-mg-behavior="reveal">
                <CountUp to={checkIn?.currentStreak ?? 0} duration={0.32} />
              </strong>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F07" data-mg-behavior="persist">
                天<br />
                连续学习
              </span>
            </div>
          </div>

          <article className="bp-current-course">
            <div className="bp-kicker" data-level="B" data-carrier="rail" data-enter="persist" data-family="F03" data-mg-behavior="persist" data-mg-container="">
              <b className="mg-kicker-word" {...labelProps("A", "plate", "reveal")} data-level="A" data-carrier="plate" data-enter="attach" data-family="F03" data-mg-behavior="reveal">当前学习课程</b> <span data-level="B" data-carrier="rail" data-enter="attach" data-family="F03" data-mg-behavior="reveal">CURRENT COURSE</span>
              <i data-mg-rail aria-hidden="true" />
            </div>
            <h3>{course}</h3>
            <p>
              {currentFocus
                ? `本阶段重点：${currentFocus}。完成当前任务后继续下一步。`
                : "从今天的第一个知识点开始，完成后会自动保存进度。"}
            </p>
            <div className="bp-course-progress" data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist" data-mg-container="">
              <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">{activeStage?.title || "专属学习路径"}</strong>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">
                本章进度 <b {...labelProps("B", "tab", "attach")} data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">{Math.round(activeStage?.progress ?? path?.progress ?? 0)}%</b>
              </span>
            </div>
            <div className="bp-progress" data-mg-progress data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist" data-mg-container="">
              <i style={{ width: `${activeStage?.progress ?? path?.progress ?? 0}%` }} />
            </div>
            <button type="button" className="bp-primary-action" onClick={() => onNavigateToTab("path")}>
              继续学习{" "}
              <span className="bp-arrow-chip" aria-hidden="true" {...labelProps("B", "ring", "attach")} data-level="B" data-carrier="ring" data-enter="attach" data-family="F02" data-mg-behavior="reveal">
                <ArrowRight />
              </span>
            </button>
          </article>
        </div>

        <section className="bp-action-strip" aria-label="今日行动">
          <header>
            <strong data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">今日行动</strong>
            <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">TODAY&apos;S ACTIONS</span>
            <i />
          </header>
          <button type="button" onClick={() => onNavigateToTab("path")}>
            <b data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">01</b>
            <span className="bp-action-icon">
              <Play />
            </span>
            <span>继续学习 {activeStage?.title || "当前路径"}</span>
            <span className="bp-arrow-chip" aria-hidden="true" {...labelProps("B", "ring", "attach")} data-level="B" data-carrier="ring" data-enter="attach" data-family="F02" data-mg-behavior="reveal">
              <ArrowRight />
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigateToTab("quiz", { subject: course, knowledgePoint: activeStage?.knowledgePoints?.[0] })
            }
          >
            <b data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">02</b>
            <span className="bp-action-icon">
              <ClipboardCheck />
            </span>
            <span>完成针对性章节测验</span>
            <span className="bp-arrow-chip" aria-hidden="true" {...labelProps("B", "ring", "attach")} data-level="B" data-carrier="ring" data-enter="attach" data-family="F02" data-mg-behavior="reveal">
              <ArrowRight />
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateToTab("resource", { subject: course, title: activeStage?.title })}
          >
            <b data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">03</b>
            <span className="bp-action-icon">
              <Map />
            </span>
            <span>生成讲义与思维导图</span>
            <span className="bp-arrow-chip" aria-hidden="true" {...labelProps("B", "ring", "attach")} data-level="B" data-carrier="ring" data-enter="attach" data-family="F02" data-mg-behavior="reveal">
              <ArrowRight />
            </span>
          </button>
        </section>

        <section className="bp-student-basics" aria-label="学习基本信息">
          <header>
            <strong data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">学习基本信息</strong>
            <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">STUDY SNAPSHOT</span>
          </header>
          <button type="button" onClick={() => onNavigateToTab("analytics")}>
            <i>
              <BookCheck />
            </i>
            <span>
              资料完整度<small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">PROFILE</small>
            </span>
            <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">
              <CountUp to={Math.round((overview?.profile.completeness ?? 0) * 100)} duration={0.32} />%
            </strong>
          </button>
          <button type="button" onClick={() => onNavigateToTab("report")}>
            <i>
              <TimerReset />
            </i>
            <span>
              今日学习<small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">FOCUS</small>
            </span>
            <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">
              <CountUp to={todayMinutes} duration={0.32} />
              <em> 分钟</em>
            </strong>
          </button>
          <button type="button" onClick={() => onNavigateToTab("quiz")}>
            <i>
              <ClipboardCheck />
            </i>
            <span>
              已完成检测<small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">ASSESSMENT</small>
            </span>
            <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">
              <CountUp to={overview?.quiz.attemptCount ?? 0} duration={0.32} />
              <em> 次</em>
            </strong>
          </button>
          <button type="button" onClick={() => onNavigateToTab("codelab")}>
            <i>
              <Code2 />
            </i>
            <span>
              编程实战<small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">CODE LAB</small>
            </span>
            <strong data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist">
              <CountUp to={overview?.codeLab.successCount ?? 0} duration={0.32} />
              <em> 项</em>
            </strong>
          </button>
        </section>
      </RevealOnScroll>
    </section>
  );
}

/* 问候语下方的班级信息：所属班级、科目、加入时间，以及「任课教师」身份标签 */
function ClassStrip({ classes }: { classes: MyClassSummary[] }) {
  const metaOf = (item: MyClassSummary) =>
    [item.subject, joinedLabel(item.joinedAt)].filter((part) => part).join(" · ");

  if (classes.length === 0) {
    return (
      <div className="bp-class-strip">
        <span className="bp-class-strip__label" data-level="A" data-carrier="plate" data-enter="attach" data-family="F01" data-mg-behavior="reveal">我的班级</span>
        <p className="bp-class-strip__empty" data-level="B" data-carrier="rail" data-enter="persist" data-family="F01" data-mg-behavior="persist">暂未加入班级 · 输入班级号即可加入</p>
      </div>
    );
  }

  return (
    <div className="bp-class-strip">
      <span className="bp-class-strip__label" data-level="A" data-carrier="plate" data-enter="attach" data-family="F01" data-mg-behavior="reveal">我的班级</span>
      <div className="bp-class-strip__list">
        {classes.map((item) => (
          <span key={item.classId} className="bp-class-strip__chip">
            <b data-level="A" data-carrier="plate" data-enter="attach" data-family="F01" data-mg-behavior="reveal">{item.className}</b>
            <i data-level="B" data-carrier="rail" data-enter="persist" data-family="F01" data-mg-behavior="persist">{metaOf(item)}</i>
            <span className="bp-class-strip__people">
              {teacherLabel(item.teacherName) && (
                <em className="is-teacher" data-level="B" data-carrier="rail" data-enter="persist" data-family="F01" data-mg-behavior="persist">{teacherLabel(item.teacherName)}</em>
              )}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* 任课教师标注：名字本身已带「教师 / 老师」后缀时不再重复拼角色词 */
function teacherLabel(teacherName?: string | null) {
  const name = (teacherName ?? "").trim();
  if (!name) return "";
  return /(老师|教师)$/.test(name) ? name : `教师 ${name}`;
}

function joinedLabel(joinedAt?: string | null) {
  if (!joinedAt) return "";
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day} 加入`;
}

/* 今日签运：仿黄历签卡。宜/忌按「姓名 + 日期」确定性抽取，同一天不变签。 */
const CALENDAR_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

// 月历周一起始，1 号前需要补的空格数
function calendarLeadingBlanks(firstDateKey: string) {
  const [year, month] = firstDateKey.split("-").map(Number);
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

function monthLabelOf(firstDateKey: string) {
  const [year, month] = (firstDateKey || "").split("-").map(Number);
  if (!year || !month) return "";
  return `${year} 年 ${month} 月`;
}

function FortuneCard({
  name,
  checkIn,
  checkingIn,
  onCheckIn,
}: {
  name: string;
  checkIn: DailyCheckInSummary | null;
  checkingIn: boolean;
  onCheckIn: () => void;
}) {
  const fortune = useMemo(() => dailyFortune(name, fortuneDateKey()), [name]);
  const total = checkIn?.totalCount ?? 0;
  const streak = checkIn?.currentStreak ?? 0;
  const days = checkIn?.monthDays ?? [];
  const today = fortuneDateKey();
  const monthTitle = monthLabelOf(days[0]?.date ?? "");
  const monthDone = days.filter((day) => day.checked).length;
  const leadingBlanks = days.length ? calendarLeadingBlanks(days[0]?.date ?? "") : 0;
  /* 签运不提前展示：当天打卡之后才揭晓抽签结果，日期也在打卡瞬间标红 */
  const revealed = Boolean(checkIn?.todayCheckedIn);
  const ominous = fortune.level.tone === "ominous";

  return (
    <aside
      className={`bp-fortune${revealed ? "" : " is-locked"}${ominous ? " is-ominous" : ""}`}
      aria-label="今日签运"
    >
      {/* 角落暗纹：吉签用「吉」，凶签用「凶」 */}
      <span className="bp-fortune__watermark" aria-hidden="true">
        {ominous ? "凶" : "吉"}
      </span>
      <div className="bp-fortune__head">
        <p className="bp-fortune__title">
          <span>{name}</span> 的运势
        </p>
        <p className="bp-fortune__level">
          <i aria-hidden="true">§</i>
          {revealed ? fortune.level.name : "待抽签"}
          <i aria-hidden="true">§</i>
        </p>
        <p className="bp-fortune__motto">{revealed ? fortune.level.motto : "打卡后为你揭晓今日的宜与忌。"}</p>
        {!revealed && (
          <button type="button" className="bp-fortune__draw" onClick={onCheckIn} disabled={checkingIn}>
            <CalendarCheck aria-hidden="true" />
            {checkingIn ? "抽签中…" : "立即打卡抽签"}
          </button>
        )}
      </div>
      <div className="bp-fortune__grid">
        {fortune.good.map((good, index) => {
          const bad = fortune.bad[index];
          return (
            <Fragment key={good.title}>
              <p className="bp-fortune__item is-good">
                <b>
                  <i className="bp-fortune__mark" aria-hidden="true">
                    宜
                  </i>
                  {good.title}
                </b>
                <span>{good.note}</span>
              </p>
              {bad && (
                <p className="bp-fortune__item is-bad">
                  <b>
                    <i className="bp-fortune__mark" aria-hidden="true">
                      忌
                    </i>
                    {bad.title}
                  </b>
                  <span>{bad.note}</span>
                </p>
              )}
            </Fragment>
          );
        })}
      </div>
      {days.length > 0 && (
        <div className="bp-fortune__calendar">
          <p className="bp-fortune__cal-title">
            {Number((days[0]?.date ?? "").slice(5, 7))} 月 · 打卡 <b>{monthDone}</b> 天
          </p>
          <div className="bp-fortune__cal-week" aria-hidden="true">
            {CALENDAR_WEEKDAYS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="bp-fortune__cal-days" aria-label={`${monthTitle}打卡日历，已打卡日期以朱红标注`}>
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <span key={`blank-${index}`} className="bp-fortune__cal-day is-blank" aria-hidden="true" />
            ))}
            {days.map((day) => {
              const className = `bp-fortune__cal-day${day.checked ? " is-done" : ""}${day.date === today ? " is-today" : ""}${day.date > today ? " is-future" : ""}`;
              return (
                <span
                  key={day.date}
                  className={className}
                  title={day.checked ? `${day.date} 已打卡` : day.date}
                >
                  {Number(day.date.slice(8))}
                </span>
              );
            })}
          </div>
        </div>
      )}
      <p className="bp-fortune__checkin">
        你已经在寻笺累计打卡 <b>{total}</b> 次
        <em>{total > 0 ? ` · 连续 ${streak} 天` : " · 今天签到就从第一次开始"}</em>
      </p>
    </aside>
  );
}
