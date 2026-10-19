/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "../../lib/gsap";

interface DockNavProps {
  children: ReactNode;
  className?: string;
  /** 磁吸缩放的子元素选择器(容器内),默认直接子按钮 */
  childSelector?: string;
  /** false 时完全不挂监听(如移动端横排布局、侧栏展开态),默认 true */
  enabled?: boolean;
}

/** Dock 磁吸(源自特效库「仿苹果导航菜单」现代化):
 *  容器单 pointermove,按光标与子项中心的距离做 scale(峰值 1.25,
 *  96px 内线性衰减),直写不经 React;leave 全部回 1。
 *  只接管子项 transform,不接管渲染。仅 hover:hover + pointer:fine;reduced 跳过。
 *  实现注:gsap 3.13+ 独立 transform 属性模式下 quickTo+scale 的 paused 初始
 *  tween 解析有坑(probe 实证 scale 永不写入),改用缓存 paused tween +
 *  invalidate().restart() 等价实现。 */
export function DockNav({
  children,
  className,
  childSelector = ":scope > button",
  enabled = true,
}: DockNavProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tweensRef = useRef<Map<number, gsap.core.Tween>>(new Map());

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled || prefersReducedMotion()) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const items = Array.from(container.querySelectorAll(childSelector)) as HTMLElement[];
    let raf = 0;
    let cy = 0;

    const onMove = (e: PointerEvent) => {
      cy = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        items.forEach((item, i) => {
          const r = item.getBoundingClientRect();
          const d = Math.abs(cy - (r.top + r.height / 2));
          const s = d < 96 ? 1 + 0.25 * (1 - d / 96) : 1;
          let t = tweensRef.current.get(i);
          if (!t) {
            t = gsap.to(item, {
              scale: 1,
              duration: 0.35,
              ease: "power3.out",
              paused: true,
              overwrite: "auto",
            });
            tweensRef.current.set(i, t);
          }
          t.vars.scale = s;
          t.invalidate().restart();
        });
      });
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      items.forEach((item, i) => {
        const t = tweensRef.current.get(i);
        if (t) {
          t.vars.scale = 1;
          t.invalidate().restart();
          /* 回落动画结束后清内联 transform,不留 translate(0,0)/scale(1) 残值
             (残值会压住子项自身的 CSS :hover transform) */
          gsap.to(item, {
            scale: 1,
            duration: 0.35,
            ease: "power3.out",
            delay: 0.35,
            overwrite: "auto",
            onComplete: () => gsap.set(item, { clearProps: "transform" }),
          });
        }
      });
    };

    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);
    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      items.forEach((item) => {
        gsap.killTweensOf(item);
        gsap.set(item, { clearProps: "scale" });
      });
      tweensRef.current.clear();
    };
  }, [childSelector, enabled]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
