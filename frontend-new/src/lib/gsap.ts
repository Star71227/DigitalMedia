/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// GSAP 单一入口:插件注册(全应用一次)+ reduced-motion 门 + 触发器刷新。
// 所有 GSAP 相关 import 一律走这里,保证 ScrollTrigger 只注册一次(gsap-core/gsap-scrolltrigger 约定)。
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { SplitText } from "gsap/SplitText";
import { Flip } from "gsap/Flip";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

// gsap 3.13 起全部插件随 npm 包免费商用,直接注册
gsap.registerPlugin(ScrollTrigger, useGSAP, ScrambleTextPlugin, SplitText, Flip, DrawSVGPlugin);

/** 项目级 reduced-motion 门:JS 动效的唯一判定出口(与 CSS kill-switch 对齐)。 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 懒加载 chunk 挂载 / 数据渲染改变文档高度后,下一帧刷新所有 ScrollTrigger 位置。 */
export function refreshScrollTriggers(): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  window.requestAnimationFrame(() => ScrollTrigger.refresh());
}

export { gsap, ScrollTrigger, useGSAP, Flip };
