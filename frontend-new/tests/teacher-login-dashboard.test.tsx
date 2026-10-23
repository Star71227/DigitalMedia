/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../../frontend-teacher/src/App";
import { teacherApi } from "../../frontend-teacher/src/api/teacher";
vi.mock("../../frontend-teacher/src/api/auth", () => ({
  login: vi.fn().mockResolvedValue({
    token: "test-token",
    user: { id: 1, username: "test-teacher", displayName: "测试教师", role: "TEACHER" },
  }),
  me: vi.fn().mockRejectedValue(new Error("未登录")),
}));
vi.mock("../../frontend-teacher/src/api/teacher", () => ({
  teacherApi: {
    classRequests: vi.fn().mockResolvedValue({ data: [], counts: { pending: 0 } }),
    dashboard: vi.fn().mockResolvedValue({
      teacher: { displayName: "测试教师" },
      summary: { managedStudentCount: 1 },
      recentActivity: [],
      topWeaknesses: [],
    }),
    trends: vi.fn().mockResolvedValue({ data: [] }),
    classes: vi
      .fn()
      .mockResolvedValue({ data: [{ id: 1, className: "示例班级", subject: "数据结构", studentCount: 1 }] }),
  },
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("登录成功后显示首页四个工作区域", async () => {
  window.history.replaceState({}, "", "/login");
  render(<App />);
  fireEvent.change(screen.getByLabelText("用户名或编号"), { target: { value: "test-teacher" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "test-only" } });
  fireEvent.submit(screen.getByLabelText("密码").closest("form")!);
  await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
  expect(await screen.findByRole("heading", { name: "高频薄弱点" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "管理班级" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "近期学生活动" })).toBeTruthy();
  expect(document.getElementById("trend-heading")).toBeTruthy();
  expect(teacherApi.classRequests).toHaveBeenCalledWith({ status: "pending" });
});
