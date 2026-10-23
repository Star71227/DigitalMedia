/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { State } from "../../frontend-teacher/src/components/Ui";
import { ApiRequestError, describeApiError } from "../src/api";
import GenerationTimeline from "../src/components/resources/GenerationTimeline";
import ResourceReviewPanel from "../src/components/resources/ResourceReviewPanel";

afterEach(cleanup);
describe("页面状态", () => {
  it("加载时不提前显示内容", () => {
    render(
      <State loading>
        <span>实际内容</span>
      </State>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("实际内容")).toBeNull();
  });
  it("错误可重试，空态和成功态明确区分", () => {
    const retry = vi.fn();
    const view = render(
      <State error="接口不可用" onRetry={retry}>
        实际内容
      </State>,
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toContain("接口不可用");
    view.rerender(<State empty>实际内容</State>);
    expect(screen.queryByText("实际内容")).toBeNull();
    view.rerender(<State>实际内容</State>);
    expect(screen.getByText("实际内容")).toBeTruthy();
  });
  it.each([
    [401, "登录状态"],
    [403, "权限"],
    [429, "频繁"],
    [503, "服务暂时不可用"],
  ])("映射 HTTP %s", (status, text) => {
    expect(
      describeApiError(new ApiRequestError("内部错误", { status: Number(status) }), "加载失败"),
    ).toContain(text);
  });
});
describe("模型执行证据", () => {
  it("任务完成不能把跳过的模型审核标成完成", () => {
    render(
      <GenerationTimeline
        currentStage="completed"
        events={[
          {
            eventType: "stage",
            stage: "ai_review",
            status: "skipped",
            label: "模型审核",
            message: "模型未启用",
            agent: "review",
            metadata: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("已跳过")).toBeTruthy();
    expect(screen.getAllByText("无执行记录").length).toBeGreaterThan(0);
  });
  it("规则审核通过不冒充模型复核", () => {
    render(
      <ResourceReviewPanel
        review={{
          status: "approved",
          score: 90,
          summary: "规则检查通过",
          issues: [],
          checks: [],
          modelReviewExecuted: false,
          modelReviewStatus: "unavailable",
        }}
      />,
    );
    expect(screen.getAllByText("模型复核不可用，保留规则审核结果").length).toBeGreaterThan(0);
    expect(screen.queryByText("模型复核已完成")).toBeNull();
  });
});
