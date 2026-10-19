/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "../../lib/gsap";

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  /** 磁吸强度(0-1),默认 0.25 */
  strength?: number;
  /** 双层反向视差(Cuberto 式,调研):>0 时内层以更强比例反向偏移
   *  (惯例 0.35/0.55),leave 双层 elastic 回弹;0 = 现单层行为,零破坏 */
  depth?: number;
  /** 按钮原生类型(表单提交用),默认 button */
  type?: "button" | "submit";
  /** 挂 data-ripple 标记(全局委托注入点击波纹) */
  ripple?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaBusy?: boolean;
}

/** 磁吸按钮:指针靠近时按钮向光标轻微偏移(单层);depth>0 升级双层
 *  反向视差 + elastic 回弹。quickTo 直写 transform 不经 React 渲染;
 *  touch 指针跳过;仅用于主 CTA。 */
export function MagneticButton({
  children,
  className,
  strength = 0.25,
  depth = 0,
  type = "button",
  ripple = false,
  onClick,
  disabled,
  ariaLabel,
  ariaBusy,
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || !window.PointerEvent) return;
    const el = ref.current;
    if (!el) return;
    const inner = innerRef.current;
    const xTo = gsap.quickTo(el, "x", { duration: 0.45, ease: "power3" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.45, ease: "power3" });
    const ixTo = inner ? gsap.quickTo(inner, "x", { duration: 0.45, ease: "power3" }) : null;
    const iyTo = inner ? gsap.quickTo(inner, "y", { duration: 0.45, ease: "power3" }) : null;
    const innerRatio = 0.55 / 0.35;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * strength;
      const dy = (e.clientY - (r.top + r.height / 2)) * strength;
      xTo(dx);
      yTo(dy);
      if (depth > 0 && ixTo && iyTo) {
        ixTo(-dx * innerRatio);
        iyTo(-dy * innerRatio);
      }
    };
    const onLeave = () => {
      /* 回落结束后清内联 x/y,不留 translate(0px,0px) 残值压 CSS :hover transform */
      const settle = () => {
        gsap.set(el, { clearProps: "x,y" });
        if (inner) gsap.set(inner, { clearProps: "x,y" });
      };
      if (depth > 0) {
        gsap.to(el, { x: 0, y: 0, duration: 1, ease: "elastic.out(1, 0.7)", overwrite: "auto" });
        if (inner) {
          gsap.to(inner, {
            x: 0,
            y: 0,
            duration: 1,
            ease: "elastic.out(1, 0.7)",
            overwrite: "auto",
            onComplete: settle,
          });
        } else {
          gsap.to(el, {
            x: 0,
            y: 0,
            duration: 1,
            ease: "elastic.out(1, 0.7)",
            overwrite: "auto",
            onComplete: settle,
          });
        }
      } else {
        gsap.to(el, { x: 0, y: 0, duration: 0.45, ease: "power3", overwrite: "auto", onComplete: settle });
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      // StrictMode 双挂载下 quickTo(0) 会把单位变换写进内联样式;
      // killTweens + clearProps 彻底清掉,不留 translate(0px,0px) 残留
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: "x,y" });
      if (inner) {
        gsap.killTweensOf(inner);
        gsap.set(inner, { clearProps: "x,y" });
      }
    };
  }, [strength, depth]);

  return (
    <button
      ref={ref}
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      data-ripple={ripple || undefined}
    >
      {depth > 0 ? (
        <span ref={innerRef} className="inline-flex items-center gap-2">
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
