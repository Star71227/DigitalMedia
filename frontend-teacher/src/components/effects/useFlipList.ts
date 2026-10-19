/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useCallback, useLayoutEffect, useRef } from "react";
import { Flip, prefersReducedMotion } from "../../lib/gsap";

/** 列表 FLIP 补位:数据变更前调 record() 捕获容器直接子元素位置,
 *  React 提交 DOM 后 useLayoutEffect 平滑补位到新位置。
 *  仅容器直接子元素;reduced-motion 跳过;捕获状态一次性消费。 */
export function useFlipList<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const captured = useRef<ReturnType<typeof Flip.getState> | null>(null);

  const record = useCallback(() => {
    if (prefersReducedMotion()) return;
    if (!ref.current) return;
    captured.current = Flip.getState(Array.from(ref.current.children));
  }, []);

  useLayoutEffect(() => {
    const state = captured.current;
    if (!state) return;
    captured.current = null;
    const tween = Flip.from(state, { duration: 0.4, ease: "power2.out", absolute: true });
    return () => {
      tween.kill();
    };
  });

  return { ref, record };
}
