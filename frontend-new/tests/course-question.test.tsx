/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CourseQuestionPanel from "../src/components/knowledge/CourseQuestionPanel";
import { askKnowledgeBase } from "../src/api";
vi.mock("../src/api", () => ({
  getStudentOverview: vi.fn().mockResolvedValue({ profile: { currentCourse: "操作系统" } }),
  askKnowledgeBase: vi.fn().mockResolvedValue({
    status: "insufficient",
    answer: "该课程资料不足",
    confidence: "insufficient",
    coverage: 0,
    retrievalRunId: 1,
    citations: [],
  }),
}));
afterEach(cleanup);
it("画像课程进入检索请求，证据不足明确显示", async () => {
  render(<CourseQuestionPanel />);
  await waitFor(() =>
    expect((screen.getByLabelText("问答课程") as HTMLSelectElement).value).toBe("操作系统"),
  );
  fireEvent.change(screen.getByLabelText("课程问题"), { target: { value: "解释进程调度" } });
  fireEvent.click(screen.getByRole("button", { name: "依据课程资料回答" }));
  await screen.findByText("该课程资料不足");
  expect(askKnowledgeBase).toHaveBeenCalledWith("解释进程调度", undefined, "操作系统");
  expect(screen.getByText("证据不足")).toBeTruthy();
});
