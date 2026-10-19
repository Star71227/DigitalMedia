/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");
const { generatePptx, validatePptxFile } = require("../src/services/pptxService");

const THEMES = ["academic-blue", "technology-dark", "learning-light"];

function comprehensiveContent(themeName) {
  const longTitle =
    "面向当前学习者的超长个性化课程标题：从核心概念、过程推理到边界验证与迁移应用的完整学习课件";
  return {
    theme: { name: themeName, primaryTone: "blue", density: "medium" },
    slides: [
      {
        slideType: "title",
        title: longTitle,
        subtitle: "数据结构 / 树 · 基于当前学习路径生成",
        bullets: ["当前掌握度：52%", "学习偏好：图解与分步实践"],
        speakerNotes: "封面讲解：该资源为当前学生个性化生成。",
      },
      {
        slideType: "objectives",
        title: "学习目标",
        bullets: [
          "说出核心定义",
          "识别适用条件",
          "解释关键步骤",
          "比较不同方案",
          "纠正常见错误",
          "完成阶段自测",
          "迁移到新问题",
        ],
        speakerNotes: "目标页备注。",
      },
      {
        slideType: "concept",
        title: "核心概念",
        body: "围绕定义、条件、结构与结果建立联系。",
        bullets: ["定义与边界", "适用条件", "关键结构", "结果验证"],
        speakerNotes: "概念页备注。",
      },
      {
        slideType: "process",
        title: "学习过程",
        steps: Array.from({ length: 8 }, (_, index) => ({
          title: `步骤 ${index + 1}`,
          description: "确认条件、执行操作并检查状态变化。",
        })),
        speakerNotes: "流程页备注。",
      },
      {
        slideType: "comparison",
        title: "方案对比",
        body: "相同点、不同点与适用场景",
        left: { title: "方案 A", items: ["共同目标", "结构简单", "适合基础场景"] },
        right: { title: "方案 B", items: ["共同目标", "扩展性更强", "适合复杂场景"] },
        speakerNotes: "对比页备注。",
      },
      {
        slideType: "misconception",
        title: "易错点",
        items: [
          {
            mistake: "忽略边界条件",
            description: "结论只在部分输入成立",
            correction: "先枚举边界，再验证结论",
          },
          { mistake: "跳过关键步骤", correction: "记录每次状态变化" },
        ],
        speakerNotes: "易错页备注。",
      },
      {
        slideType: "example",
        title: "例题",
        body: "给定输入，说明处理思路并验证结果。",
        steps: [
          { title: "识别", description: "提取条件" },
          { title: "执行", description: "逐步求解" },
        ],
        explanation: "结果满足定义与全部边界。",
        speakerNotes: "例题页备注。",
      },
      {
        slideType: "code",
        title: "关键实现",
        language: "javascript",
        code: Array.from({ length: 35 }, (_, index) => `const step${index} = ${index};`).join("\n"),
        explanation: "保留关键实现，完整代码进入备注。",
        speakerNotes: "代码讲解备注。",
      },
      {
        slideType: "quiz",
        title: "阶段自测",
        body: "哪一项最符合定义与适用条件？",
        bullets: ["A. 正确使用条件", "B. 忽略条件", "C. 跳过验证", "D. 只看表面"],
        questionIds: ["Q-001"],
        explanation: "先检查条件，不在主页面展示答案。",
        speakerNotes: "测验页备注。",
      },
      {
        slideType: "summary",
        title: "学习总结",
        bullets: ["已学核心概念", "掌握关键步骤", "能够验证结果"],
        nextSteps: ["完成阶段练习"],
        speakerNotes: "总结页备注。",
      },
      {
        slideType: "next_steps",
        title: "下一步",
        nextSteps: ["平衡树", "复习课件", "完成 CodeLab", "预计 25 分钟"],
        speakerNotes: "下一步备注。",
      },
      { slideType: "concept", title: "空字段兼容", subtitle: "", body: "", bullets: [], speakerNotes: "" },
    ],
    references: [
      {
        sourceKey: "course-notes",
        title: "数据结构课程讲义",
        chapter: "树",
        section: "基本概念",
        version: "1.0.0",
        license: "CC-BY-4.0",
      },
    ],
  };
}

async function inspect(file) {
  const result = await validatePptxFile(file);
  assert.ok(result.size > 10_000 && result.size < 10_000_000, `文件大小异常：${result.size}`);
  assert.equal(result.externalRelationships.length, 0, "PPTX 不应包含外部关系依赖");
  assert.ok(result.notesCount > 0, "speakerNotes 未写入");
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const slideXml = await Promise.all(
    result.entries
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .map((name) => zip.file(name).async("string")),
  );
  const joined = slideXml.join("\n");
  assert.match(joined, /核心概念/, "中文内容未写入");
  assert.match(joined, /参考资料/, "引用页不存在");
  assert.match(joined, /CC-BY-4.0/, "许可证未写入");
  const notesXml = await Promise.all(
    result.entries
      .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
      .map((name) => zip.file(name).async("string")),
  );
  assert.match(notesXml.join("\n"), /step34/, "裁剪代码未在 speakerNotes 中保留");
  return result;
}

async function verifyExisting(input) {
  const file = path.resolve(process.cwd(), input);
  if (path.extname(file).toLowerCase() !== ".pptx") throw new Error("只允许检查 .pptx 文件");
  const result = await validatePptxFile(file);
  if (result.externalRelationships.length)
    throw new Error(`PPTX 包含外部依赖：${result.externalRelationships.join(", ")}`);
  console.log(JSON.stringify({ valid: true, file, ...result }, null, 2));
}

async function verifyGenerated() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "learnmate-pptx-verify-"));
  const reports = [];
  try {
    for (const theme of THEMES) {
      const file = path.join(directory, `${theme}.pptx`);
      await generatePptx(comprehensiveContent(theme), file, [{ label: "S1", chunkId: 1 }]);
      const result = await inspect(file);
      reports.push({ theme, size: result.size, slides: result.slideCount, notes: result.notesCount });
    }
    const legacy = path.join(directory, "legacy.pptx");
    await generatePptx(
      {
        theme: { name: "academic-light" },
        slides: [
          { slideType: "title", title: "旧资源课件", subtitle: "兼容旧主题" },
          { slideType: "concept", title: "旧资源正文", body: "旧内容仍可正常生成。" },
        ],
      },
      legacy,
    );
    const legacyResult = await validatePptxFile(legacy);
    reports.push({
      theme: "academic-light → academic-blue",
      size: legacyResult.size,
      slides: legacyResult.slideCount,
      notes: legacyResult.notesCount,
    });
    console.log(
      JSON.stringify(
        {
          valid: true,
          generatedInTemporaryDirectory: true,
          themes: THEMES,
          slideTypes: [
            "title",
            "objectives",
            "concept",
            "process",
            "comparison",
            "misconception",
            "example",
            "code",
            "quiz",
            "summary",
            "next_steps",
            "references",
          ],
          reports,
        },
        null,
        2,
      ),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

const input = process.argv[2];
(input ? verifyExisting(input) : verifyGenerated()).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
