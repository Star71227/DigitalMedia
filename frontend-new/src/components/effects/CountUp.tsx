/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../../lib/gsap";
import { scrambleTo } from "./scramble";

interface CountUpProps {
  to: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** "count" 数字滚动(默认)| "scramble" 乱码落定(ScrambleTextPlugin) */
  mode?: "count" | "scramble";
  /** scramble 模式的乱码时长,默认 0.6s */
  scrambleDuration?: number;
}

/** 数字动效双模式:count 滚动(gsap tween onUpdate 直写 textContent,
 *  不触发 React 渲染、不动布局);scramble 乱码落定(源自「数字逐一停止」
 *  demo 现代化 + ScrambleTextPlugin 免费插件)。两模式互斥单写入者,
 *  防 textContent 竞争(调研 SplitText 空格帖同源教训)。 */
export function CountUp({
  to,
  duration = 1.4,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  mode = "count",
  scrambleDuration = 0.6,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (v: number) => `${prefix}${v.toFixed(decimals)}${suffix}`;
    const finalText = fmt(to);
    if (prefersReducedMotion()) {
      el.textContent = finalText;
      return;
    }
    if (mode === "scramble") {
      // scrambleTo 内部先 killTweensOf 再接管 textContent,与 count 分支互斥
      scrambleTo(el, finalText, "0123456789", scrambleDuration);
      return;
    }
    // 从当前已显示值起步(StrictMode 双挂载 / 数据刷新时不闪回 0)
    const shown = parseFloat(el.textContent?.replace(/[^\d.-]/g, "") ?? "") || 0;
    const state = { value: shown };
    const tween = gsap.to(state, {
      value: to,
      duration,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = fmt(state.value);
      },
    });
    return () => {
      tween.kill();
    };
  }, [to, duration, decimals, prefix, suffix, mode, scrambleDuration]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`} aria-label={`${prefix}${to}${suffix}`}>
      0
    </span>
  );
}
