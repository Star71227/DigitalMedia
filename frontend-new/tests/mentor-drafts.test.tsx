/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MentorView from "../src/components/MentorView";
const user = vi.hoisted(() => ({ id: 101, studentId: 101 }));
vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  getStoredUser: () => user,
  listChatSessions: vi.fn().mockResolvedValue({ sessions: [], pagination: { hasMore: false } }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("助手草稿跨挂载保留，并按学生隔离", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const view = render(<MentorView />);
  const input = await screen.findByPlaceholderText("输入课程问题，说明你卡住的具体位置");
  fireEvent.change(input, { target: { value: "我的未发送错题问题" } });
  await waitFor(() =>
    expect(localStorage.getItem("learnmate:chat:drafts:101")).toContain("我的未发送错题问题"),
  );
  view.unmount();
  const second = render(<MentorView />);
  expect(
    ((await screen.findByPlaceholderText("输入课程问题，说明你卡住的具体位置")) as HTMLTextAreaElement).value,
  ).toBe("我的未发送错题问题");
  second.unmount();
  user.id = 102;
  user.studentId = 102;
  render(<MentorView />);
  expect(
    ((await screen.findByPlaceholderText("输入课程问题，说明你卡住的具体位置")) as HTMLTextAreaElement).value,
  ).toBe("");
});
