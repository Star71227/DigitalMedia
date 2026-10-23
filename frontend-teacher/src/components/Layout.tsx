/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { useRef, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ScrollProgressBar } from "./effects/ScrollProgressBar";
import { useRippleRoot } from "./effects/Ripple";

const artwork = [
  ["/dashboard", "dashboard-wing.png"],
  ["/students", "knowledge-scan.png"],
  ["/classes", "ranking-chess-sacred-v3.png"],
  ["/resources", "path-birds-monochrome-v3.png"],
  ["/quizzes", "quiz-chess.png"],
  ["/assignments", "report-archive.png"],
  ["/question-bank", "knowledge-scan.png"],
  ["/reports", "report-glass-grid-v2.png"],
] as const;

export function Layout({ path, children }: { path: string; children: ReactNode }) {
  const art = artwork.find(([route]) => path.startsWith(route))?.[1] ?? "settings-optics.png";
  const rippleRootRef = useRef<HTMLDivElement | null>(null);
  useRippleRoot(rippleRootRef);
  return (
    <div ref={rippleRootRef} className="teacher-app" data-page={path.split("/")[1]}>
      <ScrollProgressBar />
      <Sidebar path={path} />
      <div className="teacher-workspace">
        <TopBar />
        <main className="teacher-main" id="main-content">
          <div className="teacher-art" aria-hidden="true">
            <img src={`/art/${art}`} alt="" />
            <div className="teacher-art-grid">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <span className="teacher-art-node teacher-art-node--one" />
            <span className="teacher-art-node teacher-art-node--two" />
          </div>
          <div key={path} className="teacher-content lm-page-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
