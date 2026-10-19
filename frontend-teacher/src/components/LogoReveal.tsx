/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/** 书页电路 logo 的入场演绎：光爆展开 → 三条弧线描边自绘 → 端点/芯片弹入 → 扫光定版。
 *  几何与 public/logo.svg 一致；颜色走 CSS 变量（.lm-logo-reveal 内定义，随 data-theme 切换）。
 *  时长约 1.7s，prefers-reduced-motion 下直接呈现最终态。
 *  static：跳过动画直接呈现最终态（全屏入场遮罩覆盖期间的内嵌 logo 使用，动画不可见无需播放）。
 *  bare：只渲染 SVG 本体，不带光爆/圆环/扫光层（全屏开场 3D 书页的左右两页使用）。 */
export default function LogoReveal({
  size = 96,
  className = "",
  static: staticMode = false,
  bare = false,
}: {
  size?: number;
  className?: string;
  static?: boolean;
  bare?: boolean;
}) {
  return (
    <div
      className={`lm-logo-reveal${staticMode ? " lm-logo-reveal--static" : ""}${bare ? " lm-logo-reveal--bare" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {!bare && <span className="lm-logo-reveal__burst" />}
      {!bare && <span className="lm-logo-reveal__ring" />}
      <svg className="lm-logo-reveal__svg" viewBox="28 29 184 184" fill="none">
        <path
          className="lm-logo-reveal__arc lm-logo-reveal__arc--outer"
          d="M 36 79 C 68 107, 94 125, 120 141 C 146 125, 172 107, 204 79"
          strokeWidth="15"
          pathLength={100}
        />
        <path
          className="lm-logo-reveal__arc lm-logo-reveal__arc--mid"
          d="M 56 79 C 80 101, 100 115, 120 127 C 140 115, 160 101, 184 79"
          strokeWidth="11"
          pathLength={100}
        />
        <path
          className="lm-logo-reveal__arc lm-logo-reveal__arc--inner"
          d="M 76 79 C 92 95, 104 105, 120 113 C 136 105, 148 95, 164 79"
          strokeWidth="7"
          pathLength={100}
        />
        <g className="lm-logo-reveal__dots">
          <circle cx="36" cy="79" r="4.5" />
          <circle cx="56" cy="79" r="4.5" />
          <circle cx="76" cy="79" r="4.5" />
          <circle cx="164" cy="79" r="4.5" />
          <circle cx="184" cy="79" r="4.5" />
          <circle cx="204" cy="79" r="4.5" />
        </g>
        <g className="lm-logo-reveal__chip">
          <rect
            className="lm-logo-reveal__chip-body"
            x="111"
            y="148"
            width="18"
            height="18"
            rx="5"
            pathLength={100}
          />
          <g className="lm-logo-reveal__chip-pins" strokeWidth="4" strokeLinecap="round">
            <line x1="111" y1="157" x2="101" y2="157" />
            <line x1="129" y1="157" x2="139" y2="157" />
            <line x1="120" y1="148" x2="120" y2="138" />
            <line x1="120" y1="166" x2="120" y2="176" />
          </g>
          <circle className="lm-logo-reveal__chip-dot" cx="120" cy="157" r="4" />
        </g>
      </svg>
      {!bare && <span className="lm-logo-reveal__shimmer" />}
    </div>
  );
}
