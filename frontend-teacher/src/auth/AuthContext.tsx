/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import { getToken, setToken } from "../api/client";
import type { User } from "../types";
interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<User>;
  signOut: () => void;
}
const Context = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const restore = async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        setUser((await authApi.me()).user);
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    restore();
    const unauthorized = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("learnmate:unauthorized", unauthorized);
    return () => window.removeEventListener("learnmate:unauthorized", unauthorized);
  }, []);
  const signIn = async (identifier: string, password: string) => {
    const result = await authApi.login(identifier, password);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  };
  const signOut = () => {
    setToken(null);
    setUser(null);
  };
  return <Context.Provider value={{ user, loading, signIn, signOut }}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
