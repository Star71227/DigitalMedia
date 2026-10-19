/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CodeLabWorkspace from "../src/components/CodeLabWorkspace";
import { runCode } from "../src/api";

vi.mock("../src/api", () => ({
  getStoredUser: () => ({ studentId: 1 }),
  getCodeRunnerHealth: vi.fn(async () => ({ available: true })),
  getCodeExerciseDetail: vi.fn(async () => ({
    exercise_id: "sum",
    title: "两数求和",
    language: "c",
    starter_code: "int main(void){return 0;}",
    sample_input: "1 2",
    public_run_available: true,
    submission_available: true,
  })),
  getCodeSubmissions: vi.fn(async () => []),
  getCodeSolution: vi.fn(),
  explainCodeRun: vi.fn(),
  submitCode: vi.fn(),
  describeApiError: (_error: unknown, fallback: string) => fallback,
  runCode: vi.fn(async () => ({
    status: "success",
    judgedBy: "custom_input",
    stdout: "15",
    stderr: "",
    compileOutput: "",
    time: "24",
    totalCount: 1,
    passedCount: 1,
  })),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

it("自定义运行传递学生输入并显示结果，不显示判题通过", async () => {
  render(<CodeLabWorkspace exerciseId="sum" onBackToList={() => {}} />);
  const input = await screen.findByLabelText("标准输入");
  fireEvent.change(input, { target: { value: "7 8" } });
  fireEvent.click(screen.getByRole("button", { name: "自定义运行" }));
  await waitFor(() =>
    expect(runCode).toHaveBeenCalledWith(expect.objectContaining({ stdin: "7 8", runMode: "custom" })),
  );
  expect(await screen.findByText("15")).toBeTruthy();
  expect(screen.getByText("运行完成")).toBeTruthy();
  expect(screen.queryByText("AC · 通过")).toBeNull();
});
