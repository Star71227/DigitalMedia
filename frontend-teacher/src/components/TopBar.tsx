/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { navigate } from "../router";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  const { user, signOut } = useAuth();
  const initial = (user?.displayName || "师").trim().slice(0, 1);
  return (
    <header className="teacher-topbar">
      <div className="flex min-w-0 items-center gap-3">
        <span className="teacher-user-avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="teacher-user-name">{user?.displayName}</div>
          <div className="teacher-user-role">
            <ShieldCheck size={13} aria-hidden="true" />
            教师账号
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => {
            signOut();
            navigate("/login");
          }}
          className="teacher-logout"
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
          退出登录
        </button>
      </div>
    </header>
  );
}
