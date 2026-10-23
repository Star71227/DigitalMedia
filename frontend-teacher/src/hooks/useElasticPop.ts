/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { RefObject } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../lib/gsap";

/** 菜单弹性弹出:elastic.out 只作用于 transform,opacity 单独 power2.out(避免透明度过冲)。
 *  CSS lm-menu-in 保留作 reduced-motion 回退;卸载时 useGSAP 自动 revert。
 *  泛型承载具体元素类型(div/section 的 ref 类型不同,免调用处强转)。 */
export function useElasticPop<T extends HTMLElement>(ref: RefObject<T | null>) {
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      gsap.fromTo(
        el,
        { scale: 0.92, y: -6 },
        { scale: 1, y: 0, duration: 0.55, ease: "elastic.out(1, 0.55)" },
      );
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" });
    },
    { scope: ref },
  );
}
