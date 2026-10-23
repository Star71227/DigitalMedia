import { Carrier } from "./motion/Motion";
/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, ShieldCheck, Trophy } from "lucide-react";
import { apiRequest, getStoredUser } from "../api";
import BlueprintClassPanel from "./BlueprintClassPanel";
import { BlueprintHeader, BlueprintMotif } from "./BlueprintDecorations";
import { CountUp } from "../components/effects/CountUp";
import "./blueprint-class-panel.css";

interface RankingItem {
  studentId: string;
  name: string;
  score: number;
  studyMinutes: number;
  pathProgress: number;
  mastery: number;
  streak: number;
  weeklyChange?: number | null;
  isCurrent?: boolean;
}

interface RankingResponse {
  className: string;
  updatedAt: string;
  myRank: number | null;
  total: number;
  items: RankingItem[];
}

const fallbackRows: RankingItem[] = [
  {
    studentId: "1",
    name: "李晨",
    score: 5120,
    studyMinutes: 810,
    pathProgress: 96,
    mastery: 93,
    streak: 12,
    weeklyChange: 1,
  },
  {
    studentId: "2",
    name: "王晓",
    score: 4890,
    studyMinutes: 760,
    pathProgress: 92,
    mastery: 91,
    streak: 10,
    weeklyChange: -1,
  },
  {
    studentId: "me",
    name: "张三",
    score: 4680,
    studyMinutes: 690,
    pathProgress: 88,
    mastery: 89,
    streak: 7,
    weeklyChange: 2,
    isCurrent: true,
  },
  {
    studentId: "4",
    name: "陈曦",
    score: 4510,
    studyMinutes: 645,
    pathProgress: 84,
    mastery: 86,
    streak: 6,
    weeklyChange: 0,
  },
  {
    studentId: "5",
    name: "赵敏",
    score: 4380,
    studyMinutes: 610,
    pathProgress: 81,
    mastery: 83,
    streak: 5,
    weeklyChange: 1,
  },
  {
    studentId: "6",
    name: "周洋",
    score: 4210,
    studyMinutes: 580,
    pathProgress: 78,
    mastery: 80,
    streak: 4,
    weeklyChange: -1,
  },
];

export default function BlueprintRankingView({
  onNavigateToTab,
}: { onNavigateToTab?: (tab: string, prefill?: unknown) => void } = {}) {
  const [data, setData] = useState<RankingResponse | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<RankingResponse>("/api/student/class-ranking")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason) => {
        if (!active) return;
        setNotice("班级数据正在同步，先为你保留本周排序参考。");
        const name = getStoredUser()?.displayName || "张三";
        setData({
          className: "数据结构 2 班",
          updatedAt: new Date().toISOString(),
          myRank: 3,
          total: 36,
          items: fallbackRows.map((item) => (item.isCurrent ? { ...item, name } : item)),
        });
      });
    return () => {
      active = false;
    };
  }, []);

  const current = useMemo(() => data?.items.find((item) => item.isCurrent), [data]);

  return (
    <section className="bp-page bp-ranking-page">
      <BlueprintMotif variant="squares" />
      <BlueprintHeader title="班级信息" english="CLASS INFORMATION" />
      <div className="bp-ranking-hero">
        <div>
          <span>DATA BUILDS A BETTER WORLD.</span>
          <h2>
            班级信息<i>◆</i>
          </h2>
          <p>{data?.className || "正在读取班级"} · 本周</p>
          <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">这里汇总你的班级归属、入班申请与本周排名</small>
        </div>
        <div className="bp-ranking-techfield" aria-hidden="true">
          {/* trace 描线入场:orbit 的 dasharray 3 8 是设计纹理,不在描线目标内 */}
          <div>
            <svg viewBox="0 0 720 250" preserveAspectRatio="xMidYMid meet">
              <path className="bp-ranking-techfield__orbit mg-draw-fade" pathLength="1" d="M70 176 C182 28 382 22 610 128" />
              <path className="bp-ranking-techfield__trace mg-draw" pathLength="1" d="M28 205 H168 L226 148 H382 L438 92 H676" />
              <circle cx="168" cy="205" r="7" />
              <circle cx="226" cy="148" r="7" />
              <circle cx="438" cy="92" r="7" />
              <rect x="374" y="140" width="16" height="16" />
              <rect x="602" y="119" width="18" height="18" />
            </svg>
          </div>
          <span>GROWTH VECTOR · CLASS 02</span>
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      {notice && <p className="bp-preview-notice">{notice}</p>}

      <div className="bp-ranking-layout">
        <div className="bp-ranking-main">
          <section className="bp-ranking-summary">
            <Carrier shape="rail" className="mg-ranking-rail" />
            <div>
              <ArrowUp />
              <span>
                我的位置
                <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
                  {data?.myRank != null ? <CountUp to={data.myRank} mode="scramble" /> : "—"}
                  <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">名</small>
                </strong>
              </span>
              <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">全班 {data?.total ?? 0} 人</small>
            </div>
            <div>
              <CalendarDays />
              <span>
                连续学习
                <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
                  <CountUp to={current?.streak ?? 0} mode="scramble" />
                  <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">天</small>
                </strong>
              </span>
              <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">保持专注</small>
            </div>
            <div>
              <Trophy />
              <span>
                班级前
                <strong data-level="A" data-carrier="disc" data-enter="attach" data-family="F15" data-mg-behavior="reveal">
                  {data?.myRank && data.total ? (
                    <CountUp to={Math.max(1, Math.round((data.myRank / data.total) * 100))} mode="scramble" />
                  ) : (
                    "—"
                  )}
                  <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">%</small>
                </strong>
              </span>
              <small data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">成长坐标</small>
            </div>
            <p>
              好的学习
              <br />
              从每一次坚持开始。
            </p>
          </section>

          <section className="bp-ranking-table" role="table" aria-label="班级学习排名">
            <div className="bp-ranking-row is-head" role="row">
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">排名</span>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">学生</span>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">学习积分</span>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">章节进度</span>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">正确率</span>
              <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">本周变化</span>
            </div>
            {data?.items.map((item, index) => (
              <div
                className={item.isCurrent ? "bp-ranking-row is-current" : "bp-ranking-row"}
                style={{ "--i": index } as React.CSSProperties}
                role="row"
                key={item.studentId}
              >
                <span className={index < 3 ? `bp-rank-medal is-${index + 1}` : ""} data-level="A" data-carrier="disc" data-enter="attach" data-family="F15" data-mg-behavior="reveal">{index + 1}</span>
                <span>
                  <i>{item.name.slice(0, 1)}</i>
                  <strong data-level="A" data-carrier="plate" data-enter="attach" data-family="F15" data-mg-behavior="reveal">{item.name}</strong>
                </span>
                <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">
                  <strong>{item.score}</strong>
                </span>
                <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">
                  <i className="bp-rank-progress" data-level="B" data-carrier="rail" data-enter="persist" data-family="F05" data-mg-behavior="persist" data-mg-container="">
                    <b style={{ width: `${item.pathProgress}%` }} />
                  </i>
                  {item.pathProgress}%
                </span>
                <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist">{item.mastery}%</span>
                <span
                  className={
                    (item.weeklyChange ?? 0) < 0 ? "is-down" : (item.weeklyChange ?? 0) > 0 ? "is-up" : ""
                  } data-level="B" data-carrier="rail" data-enter="persist" data-family="F15" data-mg-behavior="persist"
                >
                  {(item.weeklyChange ?? 0) < 0 ? (
                    <ArrowDown />
                  ) : (item.weeklyChange ?? 0) > 0 ? (
                    <ArrowUp />
                  ) : null}
                  {item.weeklyChange ? Math.abs(item.weeklyChange) : "—"}
                </span>
              </div>
            ))}
          </section>

          <footer className="bp-ranking-footer">
            <span data-level="C" data-carrier="rail" data-enter="persist" data-family="F16" data-mg-behavior="persist">
              SMALL STEPS
              <br />
              BIG CHANGES.
            </span>
            <span data-level="C" data-carrier="rail" data-enter="persist" data-family="F16" data-mg-behavior="persist">
              <ShieldCheck /> 排名仅用于观察个人成长趋势
            </span>
          </footer>
        </div>

        <BlueprintClassPanel
          rankingClassName={data?.className}
          myRank={data?.myRank ?? null}
          total={data?.total ?? 0}
          onOpenAssignment={(assignmentId) => onNavigateToTab?.("assignment", assignmentId)}
        />
      </div>
    </section>
  );
}
