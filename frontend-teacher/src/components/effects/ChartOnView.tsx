/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollTrigger, prefersReducedMotion, useGSAP } from "../../lib/gsap";

interface ChartOnViewProps {
  children: ReactNode;
  /** 占位最小高度:延迟挂载不产生 CLS */
  minHeightClass?: string;
  /** 图表提交挂载后的回调(编排钩子:此时 children 已在 DOM,可建 timeline)。
   *  StrictMode 下可能调用两次,回调须幂等(如 setState 同值不触发重渲)。 */
  onVisible?: () => void;
}

/** 图表入视口再挂载:避免 Recharts 在折叠线以下提前播完入场动画(gsap-scrolltrigger)。
 *  reduced-motion 时直接渲染;占位类保证布局稳定。 */
export function ChartOnView({ children, minHeightClass = "min-h-[260px]", onVisible }: ChartOnViewProps) {
  const [inView, setInView] = useState(() => prefersReducedMotion());
  const scopeRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useGSAP(
    () => {
      const el = scopeRef.current;
      if (!el || prefersReducedMotion()) return;
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () => setInView(true),
      });
    },
    { scope: scopeRef },
  );

  // inView 翻转后(children 已提交挂载)再通知,保证回调里拿得到图表 DOM
  useEffect(() => {
    if (inView) onVisibleRef.current?.();
  }, [inView]);

  return (
    <div ref={scopeRef} className={minHeightClass}>
      {inView ? children : null}
    </div>
  );
}
