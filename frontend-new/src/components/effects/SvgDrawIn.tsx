/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../../lib/gsap";

interface SvgDrawInProps {
  children: ReactNode;
  /** scope 内描线目标选择器(必须是无 dasharray 的 stroke 元素) */
  lineSelector: string;
  /** opacity 0→1 淡入目标(glow 线 / text label / 填充 path) */
  fadeSelector?: string;
  /** scale 0→1 交错 pop 目标(circle;transform-box 由 CSS 侧声明) */
  popSelector?: string;
  /** 启动延迟,默认 0.35s(与 bp-page-enter 520ms / lm-page-transition 250ms 错开) */
  delay?: number;
  /** 描线时长,默认 1.4s */
  duration?: number;
  /** pop 步进,默认 0.05s */
  stagger?: number;
  /** 变化时杀旧补新重播(传 useMemo 稳定引用,如 days 数组) */
  replayKey?: unknown;
}

/** SVG 描线入场:DrawSVG 描主线 + 辅助元素淡入/交错 pop。
 *  关键约定(同 RevealOnScroll):隐藏态只在 JS 可动时由 fromTo 注入,
 *  CSS 层绝不预隐藏;reduced-motion 时早退,内容天然完整可见。
 *  DrawSVG 写的是 inline style(非 attribute),收尾 clearProps 清掉
 *  strokeDasharray/strokeDashoffset,恢复 CSS 基态。 */
export function SvgDrawIn({
  children,
  lineSelector,
  fadeSelector,
  popSelector,
  delay = 0.35,
  duration = 1.4,
  stagger = 0.05,
  replayKey,
}: SvgDrawInProps) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (!scopeRef.current) return;
      const lines = gsap.utils.toArray<SVGElement>(lineSelector, scopeRef.current);
      if (!lines.length) return;
      const fades = fadeSelector ? gsap.utils.toArray<SVGElement>(fadeSelector, scopeRef.current) : [];
      const pops = popSelector ? gsap.utils.toArray<SVGElement>(popSelector, scopeRef.current) : [];

      const tl = gsap.timeline({ delay });
      lines.forEach((line) =>
        tl.fromTo(
          line,
          { drawSVG: "0%" },
          {
            drawSVG: "100%",
            duration,
            ease: "power1.inOut",
            onComplete: () => gsap.set(line, { clearProps: "strokeDasharray,strokeDashoffset" }),
          },
          0,
        ),
      );
      if (fades.length) {
        tl.fromTo(fades, { opacity: 0 }, { opacity: 1, duration: duration * 0.7, ease: "power2.out" }, 0.1);
      }
      if (pops.length) {
        tl.fromTo(
          pops,
          { scale: 0, transformOrigin: "center" },
          { scale: 1, duration: 0.5, ease: "back.out(2.2)", stagger, clearProps: "transform" },
          "-=0.55",
        );
      }
    },
    { scope: scopeRef, dependencies: [replayKey] },
  );

  return <div ref={scopeRef}>{children}</div>;
}
