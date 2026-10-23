/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAgentTaskDescriptionPrompt } = require("../src/prompts/agentTaskDescriptionPrompt");
const {
  FALLBACK_TASK_DESCRIPTIONS,
  generateAgentTaskDescriptions,
  parseTaskDescriptionJson,
  validateTaskDescriptions,
} = require("../src/services/agentTaskDescriptionService");

const silentLogger = { warn() {} };

async function generateWithModelResult(question, descriptions) {
  return generateAgentTaskDescriptions(question, {
    logger: silentLogger,
    generateTextFn: async ({ prompt }) => {
      assert.match(prompt, new RegExp(escapeRegExp(question)));
      return JSON.stringify(descriptions);
    },
  });
}

test("任务规划 Prompt 包含四个角色、强约束和本次用户问题", () => {
  const question = "已知数列第一项为1，求第n项。";
  const prompt = buildAgentTaskDescriptionPrompt(question);

  for (const field of ["coordinator", "theoryAgent", "codeAgent", "reviewAgent"]) {
    assert.match(prompt, new RegExp(field));
  }

  assert.match(prompt, /只能返回合法 JSON/);
  assert.match(prompt, /问题不涉及指针时，禁止出现“指针”/);
  assert.match(prompt, /codeAgent 应根据问题选择真实适用的方法/);
  assert.match(prompt, new RegExp(escapeRegExp(question)));
});

test("数列问题生成数列相关描述，且不出现指针、链表或节点", async () => {
  const question = "已知数列第一项为1，后续每一项是前一项的2倍，求第n项。";
  const result = await generateWithModelResult(question, {
    coordinator: "正在分析数列条件与第n项目标……",
    theoryAgent: "正在推导数列倍增规律与通项公式……",
    codeAgent: "正在设计循环计算第n项的实现方法……",
    reviewAgent: "正在检查初始项边界与计算复杂度……",
  });

  assert.notDeepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
  assert.match(Object.values(result).join(""), /数列|第n项|初始项/);
  assert.doesNotMatch(Object.values(result).join(""), /指针|链表|节点/);
});

test("单链表删除问题允许生成节点和指针相关描述", async () => {
  const question = "删除单链表中的指定节点。";
  const result = await generateWithModelResult(question, {
    coordinator: "正在分析链表删除目标与任务分工……",
    theoryAgent: "正在梳理单链表节点连接与删除原理……",
    codeAgent: "正在设计指针更新并释放指定节点……",
    reviewAgent: "正在检查头节点边界与链接正确性……",
  });

  assert.notDeepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
  assert.match(Object.values(result).join(""), /链表/);
  assert.match(result.codeAgent, /指针.*节点/);
});

test("快速排序问题生成数组分区描述，且不出现链表节点操作", async () => {
  const question = "使用快速排序对整数数组进行排序。";
  const result = await generateWithModelResult(question, {
    coordinator: "正在分析整数数组排序目标与步骤……",
    theoryAgent: "正在梳理快速排序分区与基准策略……",
    codeAgent: "正在设计数组分区与递归排序实现……",
    reviewAgent: "正在检查递归边界与时空复杂度……",
  });

  assert.notDeepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
  assert.match(Object.values(result).join(""), /数组|分区|基准|递归/);
  assert.doesNotMatch(Object.values(result).join(""), /链表|节点/);
});

test("清理 Markdown 和多余引号，并截断过长描述", () => {
  const result = validateTaskDescriptions(
    {
      coordinator: "**“正在分析整数数组排序目标与执行步骤……”**",
      theoryAgent: "`正在梳理快速排序分区原理与基准策略……`",
      codeAgent: `正在设计${"数组分区".repeat(12)}实现……`,
      reviewAgent: "正在检查递归边界正确性与时空复杂度……",
    },
    "使用快速排序对整数数组进行排序。",
  );

  assert.ok(result);
  assert.equal(result.coordinator.includes("*"), false);
  assert.equal(result.theoryAgent.includes("`"), false);
  assert.ok(Array.from(result.codeAgent).length <= 30);
});

test("非法 JSON、缺字段、空字段和额外字段均触发降级", async (t) => {
  await t.test("非法 JSON", async () => {
    const result = await generateAgentTaskDescriptions("测试问题", {
      logger: silentLogger,
      generateTextFn: async () => "这不是 JSON",
    });
    assert.deepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
  });

  await t.test("缺少字段", async () => {
    const result = await generateWithModelResult("测试问题", {
      coordinator: "正在分析当前问题目标和处理流程……",
      theoryAgent: "正在梳理当前问题理论和解题依据……",
      codeAgent: "正在设计当前问题适用的实现方案……",
    });
    assert.deepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
  });

  await t.test("字段为空", async () => {
    const result = await generateWithModelResult("测试问题", {
      coordinator: "正在分析当前问题目标和处理流程……",
      theoryAgent: "",
      codeAgent: "正在设计当前问题适用的实现方案……",
      reviewAgent: "正在检查当前答案正确性和边界条件……",
    });
    assert.deepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
  });

  await t.test("包含额外字段", async () => {
    const result = await generateWithModelResult("测试问题", {
      coordinator: "正在分析当前问题目标和处理流程……",
      theoryAgent: "正在梳理当前问题理论和解题依据……",
      codeAgent: "正在设计当前问题适用的实现方案……",
      reviewAgent: "正在检查当前答案正确性和边界条件……",
      extra: "正在添加未约定的多余字段内容……",
    });
    assert.deepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
  });
});

test("模型调用失败时返回通用降级文案，不向主要问答流程抛错", async () => {
  const result = await generateAgentTaskDescriptions("任意问题", {
    logger: silentLogger,
    generateTextFn: async () => {
      throw new Error("model unavailable");
    },
  });

  assert.deepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
});

test("JSON 解析只接受对象，并兼容清理模型误加的代码围栏", () => {
  const parsed = parseTaskDescriptionJson(
    `\`\`\`json\n${JSON.stringify(FALLBACK_TASK_DESCRIPTIONS)}\n\`\`\``,
  );
  assert.deepEqual(parsed, FALLBACK_TASK_DESCRIPTIONS);
  assert.throws(() => parseTaskDescriptionJson("[]"), /必须是对象/);
});

test("数列问题中模型误加指针概念时触发安全降级", async () => {
  const result = await generateWithModelResult("求等比数列第n项。", {
    coordinator: "正在分析等比数列条件与求解目标……",
    theoryAgent: "正在推导等比数列通项公式与规律……",
    codeAgent: "正在采用指针方式计算第n项的实现……",
    reviewAgent: "正在检查初始项边界与计算复杂度……",
  });

  assert.deepEqual(result, FALLBACK_TASK_DESCRIPTIONS);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
