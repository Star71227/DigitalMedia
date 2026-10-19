/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useRef, type ReactNode } from "react";
import { useElasticPop } from "../../hooks/useElasticPop";

/** 随开关挂载的卡片容器:挂载即弹性入场(useElasticPop 驱动)。
 *  reduced-motion 时跳过动画、内容直接可见;卸载时 useGSAP 自动 revert。 */
export function ElasticMount({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useElasticPop(ref);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
