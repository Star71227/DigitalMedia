/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CountUp } from "./effects/CountUp";

/** 页面标题：与学生端 .lm-page-header 对齐（1.75rem / 700 / 28px 间距 / 描述 ≤65ch） */
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="teacher-page-title">
      <div className="min-w-0">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="teacher-page-actions">{action}</div>}
    </div>
  );
}

/** 数据状态：加载 / 错误 / 空共用同一张纸张容器，避免布局跳动 */
export function State({
  loading,
  error,
  empty,
  children,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  children: ReactNode;
  onRetry?: () => void;
}) {
  if (loading)
    return (
      <div
        className="grid min-h-[240px] place-items-center rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2.5">
          <Loader2 size={18} className="animate-spin text-brand-500" aria-hidden="true" />
          正在加载…
        </div>
      </div>
    );
  if (error)
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700" role="alert">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div>
            <strong className="font-semibold">数据没能加载出来</strong>
            <p className="mt-1 leading-6">{error}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry || (() => window.location.reload())}
          className="mt-4 h-11 rounded-full border border-rose-300 bg-white px-5 font-medium transition-colors duration-200 hover:bg-rose-100"
        >
          重试
        </button>
      </div>
    );
  if (empty)
    return (
      <div className="teacher-empty grid min-h-[240px] place-items-center rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
        <div>
          <Inbox className="mx-auto mb-3 text-slate-400" size={22} aria-hidden="true" />
          <p className="font-medium text-slate-700">暂无数据</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">当前范围内还没有可展示的记录</p>
        </div>
      </div>
    );
  return children;
}

/** 指标卡：语义色软底图标 + 等宽数字，去掉顶部彩条 */
export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
  countUpTo,
  countUpSuffix = "",
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: LucideIcon;
  tone?: "blue" | "green" | "amber" | "slate";
  /** 传入后数值用乱码落定动画展示(v12 动效,可选,不传则原样渲染 value) */
  countUpTo?: number;
  countUpSuffix?: string;
}) {
  const tones = {
    blue: { chip: "bg-brand-50 text-brand-700", dot: "bg-brand-500" },
    green: { chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    amber: { chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
    slate: { chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  }[tone];
  return (
    <div className={`teacher-metric teacher-metric--${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="teacher-metric-label">
          <span className={`h-1.5 w-1.5 rounded-full ${tones.dot}`} aria-hidden="true" />
          {label}
        </div>
        {Icon && (
          <span className={`teacher-metric-icon ${tones.chip}`}>
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="teacher-metric-value">
        {countUpTo !== undefined ? <CountUp to={countUpTo} suffix={countUpSuffix} mode="scramble" /> : value}
      </div>
      {detail && <div className="teacher-metric-detail">{detail}</div>}
    </div>
  );
}

export function pct(value: number | null | undefined) {
  return value === null || value === undefined ? "暂无数据" : `${Math.round(value * 10) / 10}%`;
}
export function fmt(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "暂无记录";
}
