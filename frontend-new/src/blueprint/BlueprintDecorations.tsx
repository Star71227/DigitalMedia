/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useAppSettings, weekdayLabel } from "../appSettings";

import { Carrier, labelProps } from "./motion/Motion";

export function BlueprintHeader({ title, english }: { title: string; english: string }) {
  const { settings } = useAppSettings();
  const now = new Date();
  const date = `${now.getFullYear()} / ${String(now.getMonth() + 1).padStart(2, "0")} / ${String(now.getDate()).padStart(2, "0")}`;
  const weekday = weekdayLabel(settings.language, now.getDay());
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <header className="bp-page-header">
      <div className="bp-page-header__title">
        <h1 tabIndex={-1}>{title}</h1>
        <i />
        <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">{english}</span>
      </div>
      <div className="bp-page-header__meta" {...labelProps("B", "rail", "persist")} data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist" data-mg-container="">
        <time data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">{date}</time>
        <span data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">{weekday}</span>
        <time data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">{time}</time>
        <i />
        <b data-level="B" data-carrier="rail" data-enter="persist" data-family="F10" data-mg-behavior="persist">
          KEEP LEARNING
          <br />
          KEEP GROWING
        </b>
      </div>
    </header>
  );
}

export function BlueprintMotif({
  variant = "network",
}: {
  variant?: "network" | "branch" | "squares" | "type";
}) {
  if (variant === "type") {
    return (
      <div className="bp-motif-type" aria-hidden="true">
        <span>Aa</span>
        <b>学</b>
      </div>
    );
  }

  if (variant === "branch") {
    return (
      <svg className="bp-motif bp-motif--branch" viewBox="0 0 900 600" aria-hidden="true">
        <g fill="none" stroke="currentColor">
          <path className="mg-draw" pathLength="1" d="M92 535 C210 430 252 328 345 258 C435 191 579 183 782 60" />
          <path className="mg-draw" pathLength="1" d="M222 413 C177 335 155 278 122 207 M323 281 C302 210 273 164 225 103 M420 220 C457 152 513 112 580 84 M536 184 C594 212 649 258 699 323" />
          <path className="mg-draw-fade" pathLength="1" d="M101 523 C248 468 350 423 454 342 C567 255 657 157 792 85" strokeDasharray="5 8" />
          <circle cx="92" cy="535" r="4" />
          <circle cx="345" cy="258" r="5" />
          <circle cx="782" cy="60" r="5" />
          <circle cx="122" cy="207" r="3" />
          <circle cx="225" cy="103" r="3" />
          <circle cx="699" cy="323" r="3" />
        </g>
      </svg>
    );
  }

  return (
    <svg className={`bp-motif bp-motif--${variant}`} viewBox="0 0 900 600" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <path className="mg-draw" pathLength="1" d="M25 422 C168 200 338 140 520 215 S760 360 885 108" />
        <path className="mg-draw-fade" pathLength="1" d="M5 455 C148 271 306 265 442 326 S706 430 884 242" strokeDasharray="5 8" />
        <path className="mg-draw" pathLength="1" d="M112 0 V600 M256 0 V600 M510 0 V600 M744 0 V600" opacity=".35" />
        <path className="mg-draw" pathLength="1" d="M0 102 H900 M0 245 H900 M0 475 H900" opacity=".35" />
        <circle cx="168" cy="248" r="4" />
        <circle cx="338" cy="140" r="4" />
        <circle cx="520" cy="215" r="4" />
        <circle cx="760" cy="330" r="4" />
        <circle cx="450" cy="290" r="170" strokeDasharray="3 7" opacity=".5" />
      </g>
      <g fill="currentColor" opacity=".24">
        <rect x="70" y="72" width="55" height="55" />
        <rect x="126" y="128" width="55" height="55" opacity=".45" />
        <rect x="665" y="392" width="48" height="48" />
        <rect x="714" y="441" width="48" height="48" opacity=".45" />
      </g>
    </svg>
  );
}

export function TreeRingGraphic() {
  return (
    <div className="bp-tree-ring bp-tree-ring--art" aria-hidden="true">
      <Carrier shape="ring" className="mg-home-orbit" />
      <img src="/art/dashboard-wing.png" alt="" />
    </div>
  );
}
