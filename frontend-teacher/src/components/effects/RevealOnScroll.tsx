/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion, useGSAP } from "../../lib/gsap";

interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  y?: number;
  start?: string;
}

/** 滚动分批入场:ScrollTrigger.batch 只触发一次(gsap-scrolltrigger)。
 *  关键约定:初始隐藏态只在 JS 可动时由 gsap.set 注入,CSS 层绝不预隐藏,
 *  JS 失效 / reduced-motion 时内容完整可见。 */
export function RevealOnScroll({
  children,
  className,
  stagger = 0.08,
  y = 26,
  start = "top 85%",
}: RevealOnScrollProps) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (!scopeRef.current) return;
      /* 只在自身包装层内查 data-reveal:全局查询会让后挂载的实例
         重新捕获同页其他实例已入场的目标,造成闪没再重放 */
      const targets = gsap.utils.toArray<HTMLElement>("[data-reveal]", scopeRef.current);
      if (!targets.length) return;
      gsap.set(targets, { opacity: 0, y });
      ScrollTrigger.batch(targets, {
        start,
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger,
            ease: "power2.out",
            overwrite: true,
            // 清掉内联 transform,否则 hover 抬升(lm-card-lift)被残值挡住
            clearProps: "transform",
          }),
      });
    },
    { scope: scopeRef },
  );

  return (
    <div ref={scopeRef} className={className}>
      {children}
    </div>
  );
}
