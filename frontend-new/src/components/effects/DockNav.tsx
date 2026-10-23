/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "../../lib/gsap";

interface DockNavProps {
  children: ReactNode;
  className?: string;
  /** 子项选择器(容器内),默认直接子按钮 */
  childSelector?: string;
  /** false 时完全不挂监听(如移动端横排布局、侧栏展开态),默认 true */
  enabled?: boolean;
}

/** Dock 磁吸（仿苹果导航菜单）：
 *  容器单 pointermove，按光标与子项中心的距离做「图标」缩放（峰值 1.18，96px 内线性衰减），
 *  直写 transform 不经 React；leave 全部回 1。
 *
 *  为什么只放大图标、不放大整行：
 *   1) 整行 scale(1.25) 会把悬浮高亮（左侧强调条 + 光泽扫过 + 蓝底）一起放大，
 *      顶出导航条宽度，看起来就是「蓝色标注超出所在宽度」；
 *   2) 缩放整行每帧都要重新栅格化文字，帧率不稳；放大一个小 svg 便宜得多，也更像 Dock。
 *  子项中心点只在挂载 / 窗口尺寸变化时量一次，光标移动时只做算术；
 *  缩放目标变化小于 0.01 就直接跳过，避免每帧 restart 补间。
 *  仅 hover:hover + pointer:fine；reduced 或触屏环境直接不挂，退回 CSS 的 :hover 缩放。 */
export function DockNav({
  children,
  className,
  childSelector = ":scope > button",
  enabled = true,
}: DockNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tweensRef = useRef<Map<SVGElement, gsap.core.Tween>>(new Map());

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled || prefersReducedMotion()) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const items = Array.from(container.querySelectorAll(childSelector)) as HTMLElement[];
    /* 图标是绝对定位 + top:50%，垂直居中由 CSS 的 translate: 0 -50% 负责；
       这里只写内联 transform 的 scale，两者互不覆盖，居中不会被顶掉
       （曾经用 yPercent:-50 保居中，会和 CSS 的 translateY(-50%) 叠加成双倍位移，
        图标比罗马数字/文字高出半个图标，导航三列对不齐）。 */
    const icons = items
      .map((item) => item.querySelector("svg") as SVGElement | null)
      .filter((icon): icon is SVGElement => Boolean(icon));
    if (!icons.length) return;

    const PEAK = 1.18;
    const RANGE = 96;
    const EPS = 0.01;
    let raf = 0;
    let cy = 0;
    let centers: number[] = [];
    let current: number[] = icons.map(() => 1);

    const measure = () => {
      centers = items.map((item) => {
        const r = item.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    };

    const tweens = tweensRef.current;
    const setScale = (index: number, scale: number) => {
      const icon = icons[index];
      if (!icon) return;
      if (Math.abs(scale - current[index]) < EPS) return;
      current[index] = scale;
      let tween = tweens.get(icon);
      if (!tween) {
        // 只动 scale：Y 居中交给 CSS 的 translate 属性，内联 transform 里不出现位移
        tween = gsap.to(icon, { scale, duration: 0.28, ease: "power2.out", paused: true, overwrite: "auto" });
        tweens.set(icon, tween);
      }
      tween.vars.scale = scale;
      tween.invalidate().restart();
    };

    const apply = () => {
      raf = 0;
      if (!centers.length) measure();
      icons.forEach((_, i) => {
        const d = Math.abs(cy - (centers[i] ?? 0));
        setScale(i, d < RANGE ? 1 + (PEAK - 1) * (1 - d / RANGE) : 1);
      });
    };

    const onMove = (event: PointerEvent) => {
      cy = event.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      icons.forEach((_, i) => setScale(i, 1));
    };

    const onResize = () => {
      measure();
      if (!raf) raf = requestAnimationFrame(apply);
    };

    measure();
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", onResize);
    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      tweens.forEach((tween, icon) => {
        tween.kill();
        gsap.set(icon, { clearProps: "transform" });
      });
      tweens.clear();
      current = icons.map(() => 1);
    };
  }, [childSelector, enabled]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
