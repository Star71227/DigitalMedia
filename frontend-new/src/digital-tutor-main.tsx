/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./components/digitalTutor/digitalTutorLab.css";

const DigitalTutorLab = lazy(() => import("./pages/DigitalTutorLab"));

createRoot(document.getElementById("digital-tutor-root")!).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="dt-lab-loading" role="status">
          正在加载数字讲师实验室…
        </div>
      }
    >
      <DigitalTutorLab />
    </Suspense>
  </StrictMode>,
);
