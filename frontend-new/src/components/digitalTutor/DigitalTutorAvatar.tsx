/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { DigitalTutorState } from "../../types/digitalTutor";

interface AvatarProps {
  state: DigitalTutorState;
  mouthOpen: number;
  name: string;
  compact?: boolean;
  reducedMotion?: boolean;
}

export default function DigitalTutorAvatar({ state, mouthOpen, name, compact, reducedMotion }: AvatarProps) {
  const mouthHeight = 3 + mouthOpen * 12;
  const eyeClosed = state === "paused" || state === "disabled";

  return (
    <div
      className={`dt-avatar dt-avatar--${state}${compact ? " dt-avatar--compact" : ""}${reducedMotion ? " dt-reduced" : ""}`}
      role="img"
      aria-label={`${name}，当前状态：${state}`}
    >
      <div className="dt-orbit" aria-hidden="true">
        <span>01</span>
        <span>AI</span>
        <span>&lt;/&gt;</span>
      </div>
      <svg viewBox="0 0 240 260" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="dt-head" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#DEE4EE" />
            <stop offset="1" stopColor="#B7C2D4" />
          </linearGradient>
          <linearGradient id="dt-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0FA47F" />
            <stop offset="1" stopColor="#7EE2C8" />
          </linearGradient>
          <filter id="dt-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000000" floodOpacity=".12" />
          </filter>
        </defs>
        <g className="dt-character" filter="url(#dt-shadow)">
          <path d="M74 202c8-32 27-46 46-46s38 14 46 46l8 35H66z" fill="url(#dt-body)" />
          <path d="M97 164h46l-5 29-18 13-18-13z" fill="#CFE3F7" />
          <rect x="105" y="176" width="30" height="22" rx="7" fill="#101318" />
          <path d="M111 184h5m8 0h5m-18 6h18" stroke="#5EEAD4" strokeWidth="2" strokeLinecap="round" />
          <rect
            x="47"
            y="57"
            width="146"
            height="117"
            rx="58"
            fill="url(#dt-head)"
            stroke="#0FA47F"
            strokeWidth="4"
          />
          <path
            d="M68 65c19-25 84-36 109 2"
            fill="none"
            stroke="#3A4C73"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path d="M120 39V23m0 0 12-9m-12 9-12-9" stroke="#0FA47F" strokeWidth="5" strokeLinecap="round" />
          <circle cx="120" cy="21" r="6" fill="#7EE2C8" className="dt-antenna" />
          <g className="dt-eyes">
            {eyeClosed ? (
              <>
                <path d="M78 108h25" stroke="#3A4C73" strokeWidth="5" strokeLinecap="round" />
                <path d="M137 108h25" stroke="#3A4C73" strokeWidth="5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <ellipse cx="91" cy="108" rx="8" ry="12" fill="#22305A" />
                <ellipse cx="149" cy="108" rx="8" ry="12" fill="#22305A" />
                <circle cx="94" cy="104" r="2.5" fill="white" />
                <circle cx="152" cy="104" r="2.5" fill="white" />
              </>
            )}
          </g>
          <rect
            x={111 - mouthOpen * 5}
            y={137 - mouthOpen * 2}
            width={18 + mouthOpen * 10}
            height={mouthHeight}
            rx={Math.max(2, mouthHeight / 2)}
            fill="#2A2E57"
            className="dt-mouth"
          />
          <circle cx="65" cy="131" r="7" fill="#fda4af" opacity=".45" />
          <circle cx="175" cy="131" r="7" fill="#fda4af" opacity=".45" />
          <path
            d="M50 105h-9a8 8 0 0 0-8 8v16a8 8 0 0 0 8 8h9m140-32h9a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8h-9"
            fill="none"
            stroke="#0FA47F"
            strokeWidth="5"
          />
          <path
            className="dt-arm dt-arm--left"
            d="M73 195 49 218"
            stroke="#0FA47F"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            className="dt-arm dt-arm--right"
            d="m167 195 24 23"
            stroke="#7EE2C8"
            strokeWidth="16"
            strokeLinecap="round"
          />
        </g>
        <path d="M36 237h168l11 18H25z" fill="#D8D5CE" />
        <path d="M82 244h76" stroke="#0FA47F" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {state === "thinking" && (
        <div className="dt-thought" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
      {state === "listening" && (
        <div className="dt-listening-waves" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      )}
      {state === "encouraging" && (
        <div className="dt-sparkles" aria-hidden="true">
          <i>✦</i>
          <i>✦</i>
          <i>✦</i>
        </div>
      )}
    </div>
  );
}
