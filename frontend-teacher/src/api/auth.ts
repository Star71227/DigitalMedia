/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import { api } from "./client";
import type { User } from "../types";
export function login(identifier: string, password: string) {
  return api<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}
export function me() {
  return api<{ user: User }>("/auth/me");
}
export interface TeacherRegistrationInput {
  username: string;
  name: string;
  password: string;
  confirmPassword: string;
}
export function registerTeacher(input: TeacherRegistrationInput) {
  return api<{ success: true; message: string; user: User }>("/auth/register-teacher", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
