/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useRef } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion, useGSAP } from "../../lib/gsap";

/** 顶栏 3px 阅读进度条:scrub 绑定滚动、仅动 transform(源自「网页进度条」demo 现代化)。
 *  两端的滚动容器都是 window,使用 ScrollTrigger 默认 scroller。 */
export function ScrollProgressBar() {
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = scopeRef.current;
      if (!el || prefersReducedMotion()) return;
      gsap.set(el, { transformOrigin: "left center", scaleX: 0 });
      gsap.to(el, {
        scaleX: 1,
        ease: "none",
        scrollTrigger: { start: 0, end: () => ScrollTrigger.maxScroll(window) || 1, scrub: 0.3 },
      });
    },
    { scope: scopeRef },
  );

  return <div ref={scopeRef} className="lm-scroll-progress" aria-hidden="true" />;
}
