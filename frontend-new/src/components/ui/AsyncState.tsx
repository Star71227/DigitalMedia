/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { ReactNode } from "react";
import { CircleAlert, Inbox, LockKeyhole, WifiOff } from "lucide-react";

type StateKind = "loading" | "empty" | "error" | "permission" | "unavailable";

interface AsyncStateProps {
  kind: StateKind;
  title: string;
  description: string;
  preserved?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const ICONS: Record<Exclude<StateKind, "loading">, ReactNode> = {
  empty: <Inbox aria-hidden="true" />,
  error: <CircleAlert aria-hidden="true" />,
  permission: <LockKeyhole aria-hidden="true" />,
  unavailable: <WifiOff aria-hidden="true" />,
};

export default function AsyncState({
  kind,
  title,
  description,
  preserved,
  action,
  className = "",
}: AsyncStateProps) {
  const isAlert = kind === "error" || kind === "permission" || kind === "unavailable";

  return (
    <section
      className={`lm-async-state lm-async-state--${kind} ${className}`.trim()}
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-busy={kind === "loading" ? "true" : undefined} data-level="A" data-carrier="plate" data-enter="persist" data-family="F04" data-mg-behavior="persist"
    >
      <div className="lm-async-state__icon">
        {kind === "loading" ? (
          <span className="lm-loading-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : (
          ICONS[kind]
        )}
      </div>
      <div className="lm-async-state__content">
        <h2>{title}</h2>
        <p>{description}</p>
        {preserved && <p className="lm-async-state__preserved">{preserved}</p>}
        {action && (
          <button type="button" className="lm-button lm-button--primary" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </section>
  );
}
