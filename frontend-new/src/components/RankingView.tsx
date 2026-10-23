/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Award, BarChart3, Clock3, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { apiRequest, describeApiError, getStoredUser } from "../api";

interface RankingItem {
  studentId: string;
  name: string;
  score: number;
  studyMinutes: number;
  pathProgress: number;
  mastery: number;
  streak: number;
  isCurrent?: boolean;
}

interface RankingResponse {
  className: string;
  updatedAt: string;
  myRank: number | null;
  total: number;
  items: RankingItem[];
}

const previewRows: RankingItem[] = [
  {
    studentId: "demo-01",
    name: "林清越",
    score: 965,
    studyMinutes: 782,
    pathProgress: 91,
    mastery: 88,
    streak: 12,
  },
  {
    studentId: "demo-02",
    name: "周景行",
    score: 928,
    studyMinutes: 744,
    pathProgress: 86,
    mastery: 85,
    streak: 9,
  },
  {
    studentId: "demo-me",
    name: "张三",
    score: 894,
    studyMinutes: 686,
    pathProgress: 78,
    mastery: 82,
    streak: 7,
    isCurrent: true,
  },
  {
    studentId: "demo-04",
    name: "陈知夏",
    score: 867,
    studyMinutes: 648,
    pathProgress: 76,
    mastery: 79,
    streak: 6,
  },
  {
    studentId: "demo-05",
    name: "苏予安",
    score: 842,
    studyMinutes: 615,
    pathProgress: 72,
    mastery: 77,
    streak: 5,
  },
];

export default function RankingView() {
  const [data, setData] = useState<RankingResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<RankingResponse>("/api/student/class-ranking")
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((reason) => {
        if (cancelled) return;
        setMessage(describeApiError(reason, "班级排名接口尚未接入，当前展示前端预览数据"));
        const currentName = getStoredUser()?.displayName || "张三";
        setData({
          className: "数据结构 2 班",
          updatedAt: new Date().toISOString(),
          myRank: 3,
          total: 36,
          items: previewRows.map((item) => (item.isCurrent ? { ...item, name: currentName } : item)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = useMemo(() => data?.items.find((item) => item.isCurrent), [data]);

  if (!data) return <div className="lm-ranking-loading">正在读取班级学习坐标…</div>;

  return (
    <div className="lm-ranking-page">
      <section className="lm-ranking-hero">
        <div>
          <span className="lm-section-kicker">
            <Trophy aria-hidden="true" /> 班级成长坐标
          </span>
          <h2>关注长期成长，而不是一次分数</h2>
          <p>排名综合学习路径完成度、知识掌握度、有效学习时长与连续学习记录。</p>
        </div>
        <div className="lm-ranking-orbit" aria-label={`当前排名第 ${data.myRank ?? "--"} 名`}>
          <small>MY RANK</small>
          <strong>{data.myRank ?? "--"}</strong>
          <span>/ {data.total}</span>
        </div>
      </section>

      {message && (
        <p className="lm-preview-notice">
          <Sparkles aria-hidden="true" />
          {message}
        </p>
      )}

      <section className="lm-ranking-metrics" aria-label="个人排名指标">
        <Metric
          icon={Award}
          label="综合成长值"
          value={current ? String(current.score) : "--"}
          meta="较上周 +38"
        />
        <Metric
          icon={BarChart3}
          label="知识掌握度"
          value={current ? `${current.mastery}%` : "--"}
          meta="班级均值 74%"
        />
        <Metric
          icon={Clock3}
          label="有效学习时长"
          value={current ? `${Math.round(current.studyMinutes / 60)}h` : "--"}
          meta="连续学习 7 天"
        />
        <Metric
          icon={ShieldCheck}
          label="路径完成度"
          value={current ? `${current.pathProgress}%` : "--"}
          meta="当前阶段 4 / 6"
        />
      </section>

      <section className="lm-ranking-board">
        <header>
          <div>
            <h2>{data.className}</h2>
            <p>阶段成长榜 · 每日依据真实学习证据更新</p>
          </div>
          <time>{new Date(data.updatedAt).toLocaleDateString("zh-CN")}</time>
        </header>
        <div className="lm-ranking-table" role="table" aria-label="班级成长排名">
          <div className="lm-ranking-row lm-ranking-row--head" role="row">
            <span>名次</span>
            <span>学习者</span>
            <span>综合成长</span>
            <span>路径进度</span>
            <span>知识掌握</span>
            <span>连续学习</span>
          </div>
          {data.items.map((item, index) => (
            <div
              key={item.studentId}
              className={`lm-ranking-row ${item.isCurrent ? "is-current" : ""}`}
              role="row"
            >
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <span>
                {item.name}
                {item.isCurrent && <small>我</small>}
              </span>
              <span>
                <b>{item.score}</b>
                <i style={{ inlineSize: `${Math.min(100, item.score / 10)}%` }} />
              </span>
              <span>{item.pathProgress}%</span>
              <span>{item.mastery}%</span>
              <span>
                {item.streak} 天 <ArrowUpRight aria-hidden="true" />
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  meta,
}: {
  icon: typeof Award;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <article>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </article>
  );
}
