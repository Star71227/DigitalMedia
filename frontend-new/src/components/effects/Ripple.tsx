/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { prefersReducedMotion } from "../../lib/gsap";

/** 点击波纹事件委托(调研:100ms 内即时反馈):
 *  命中 [data-ripple] 注入波纹 span,CSS 动画只动 transform/opacity,
 *  animationend 自移除;reduced 不注入。挂应用根一次。 */
export function attachRipple(root: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {};
  const onPointerDown = (e: PointerEvent) => {
    const target = (e.target as HTMLElement | null)?.closest?.("[data-ripple]");
    if (!(target instanceof HTMLElement)) return;
    const rect = target.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height) * 1.6;
    const ink = document.createElement("span");
    ink.className = "lm-ripple-ink";
    ink.style.width = `${d}px`;
    ink.style.height = `${d}px`;
    ink.style.left = `${e.clientX - rect.left - d / 2}px`;
    ink.style.top = `${e.clientY - rect.top - d / 2}px`;
    ink.addEventListener("animationend", () => ink.remove());
    target.appendChild(ink);
  };
  root.addEventListener("pointerdown", onPointerDown);
  return () => root.removeEventListener("pointerdown", onPointerDown);
}

/** 波纹委托根:hook 版,挂在现有布局根元素,不新增 DOM。 */
export function useRippleRoot(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachRipple(el);
  }, [ref]);
}

/** 波纹委托根:组件版(无现成根元素时用,会包一层 div)。 */
export function RippleRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useRippleRoot(ref);
  return <div ref={ref}>{children}</div>;
}
