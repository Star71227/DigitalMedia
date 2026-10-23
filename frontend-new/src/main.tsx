/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppSettingsProvider } from "./appSettings.tsx";
import "./index.css";
import "./blueprint/blueprint.css";
import "./editorial.css";
import "./blueprint/blueprint-v2.css";
import "./appSettings.css";
import "./blueprint/motion/motion.css";
import "./blueprint/ranking-badges.css";
import "./blueprint/depth/depth.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppSettingsProvider>
      <App />
    </AppSettingsProvider>
  </StrictMode>,
);
