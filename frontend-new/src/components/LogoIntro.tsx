/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState } from "react";
import LogoReveal from "./LogoReveal";

/** 每次打开都播的全屏 logo 开场：夜空/浅底背景 + 纸面书页从中缝向两侧展开 logo（页面可见、垫页厚度、
 *  页边高光、中缝折痕）+ 光爆/端点/芯片弹入/扫光收尾，品牌名随后浮入；约 2.4s 后纸面褪去、背景淡出，
 *  书（logo）从屏幕中央平缓飞向登录页内嵌 logo 的位置（dockTarget 选择器，量取实时坐标），落点重合后卸载。
 *  reduced-motion 直接跳过；找不到落点时退化为纯淡出；由父组件在 onDone 后卸载。 */
export default function LogoIntro({
  subtitle = "智课研伴 · AI 学习平台",
  dockTarget,
  onDone,
}: {
  subtitle?: string;
  dockTarget?: string;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [dock, setDock] = useState<{ x: number; y: number; scale: number; origin: string } | null>(null);
  const bookRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        doneRef.current();
        return;
      }
    } catch {
      /* 隐私模式等场景忽略 */
    }
    const leaveTimer = setTimeout(() => {
      // 量取登录页内嵌 logo 的实时位置，计算书 → 落点的位移与缩放
      let next: typeof dock | null = null;
      try {
        const target = dockTarget ? document.querySelector<HTMLElement>(dockTarget) : null;
        const book = bookRef.current;
        const stage = stageRef.current;
        if (target && book && stage) {
          const b = book.getBoundingClientRect();
          const t = target.getBoundingClientRect();
          const s = stage.getBoundingClientRect();
          if (b.width > 0 && t.width > 0) {
            next = {
              x: t.left + t.width / 2 - (b.left + b.width / 2),
              y: t.top + t.height / 2 - (b.top + b.height / 2),
              scale: t.width / b.width,
              origin: `${b.left + b.width / 2 - s.left}px ${b.top + b.height / 2 - s.top}px`,
            };
          }
        }
      } catch {
        /* 布局异常时退化为淡出 */
      }
      setDock(next);
      setLeaving(true);
    }, 2400);
    return () => clearTimeout(leaveTimer);
  }, [dockTarget]);

  useEffect(() => {
    if (!leaving) return;
    const doneTimer = setTimeout(() => doneRef.current(), 760);
    return () => clearTimeout(doneTimer);
  }, [leaving]);

  return (
    <div
      className={`lm-logo-intro${leaving ? " lm-logo-intro--leaving" : ""}${leaving && !dock ? " lm-logo-intro--plain" : ""}`}
      aria-hidden="true"
    >
      <div
        className="lm-logo-intro__stage"
        ref={stageRef}
        style={
          dock
            ? {
                transformOrigin: dock.origin,
                transform: `translate(${dock.x}px, ${dock.y}px) scale(${dock.scale})`,
              }
            : undefined
        }
      >
        <div className="lm-book" ref={bookRef}>
          <span className="lm-book__spine" />
          <span className="lm-book__sheet lm-book__sheet--left" />
          <span className="lm-book__sheet lm-book__sheet--right" />
          <div className="lm-book__page lm-book__page--left">
            <LogoReveal size={112} bare className="lm-book__half lm-book__half--left" />
          </div>
          <div className="lm-book__page lm-book__page--right">
            <LogoReveal size={112} bare className="lm-book__half lm-book__half--right" />
          </div>
          <span className="lm-book__fold" />
          <span className="lm-logo-reveal__burst" />
          <span className="lm-logo-reveal__ring" />
          <span className="lm-logo-reveal__shimmer" />
        </div>
        <p className="lm-logo-intro__name">智课研伴</p>
        <p className="lm-logo-intro__sub">{subtitle}</p>
      </div>
    </div>
  );
}
