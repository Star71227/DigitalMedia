/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertAcyclic } = require("../src/services/knowledgePointService");
test("先修关系拒绝循环", () => {
  assert.doesNotThrow(() =>
    assertAcyclic([
      ["b", "a"],
      ["c", "b"],
    ]),
  );
  assert.throws(
    () =>
      assertAcyclic([
        ["a", "b"],
        ["b", "a"],
      ]),
    /cycle/,
  );
});
