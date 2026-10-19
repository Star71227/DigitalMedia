/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import type { ReactNode } from "react";
import { ShieldX } from "lucide-react";
import { useAuth } from "./AuthContext";
import { navigate } from "../router";
export function RequireTeacher({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  if (loading)
    return <div className="min-h-screen grid place-items-center text-slate-500">正在恢复登录状态…</div>;
  if (!user) {
    navigate("/login", true);
    return null;
  }
  if (!["TEACHER", "ADMIN"].includes(user.role))
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <ShieldX className="mx-auto mb-4 text-rose-500" size={40} />
          <h1 className="text-xl font-bold">无教师端访问权限</h1>
          <p className="mt-2 text-sm text-slate-500">
            当前账号角色为 {user.role}。学生账号不能进入教师工作台。
          </p>
          <button
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-white"
            onClick={() => {
              signOut();
              navigate("/login");
            }}
          >
            返回登录
          </button>
        </div>
      </div>
    );
  return children;
}
