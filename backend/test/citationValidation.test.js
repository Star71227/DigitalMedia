/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCitations } = require("../src/services/citationValidationService");
const retrieval = {
  results: [
    {
      chunkId: 12,
      sourceKey: "s",
      sourceTitle: "讲义",
      license: "CC-BY-4.0",
      sourceVersion: "1",
      content: "左旋只改变局部父子关系，并保持二叉搜索树中序遍历的键顺序。",
    },
  ],
};
test("引用只能指向本次检索且合法 claim 通过", () => {
  const v = validateCitations({
    claims: [{ text: "左旋保持二叉搜索树中序遍历的键顺序", chunkIds: [12] }],
    retrieval,
  });
  assert.equal(v.approved, true);
  assert.equal(v.coverage, 1);
});
test("不存在或未参与检索的 chunkId 被拒绝", () => {
  const v = validateCitations({ claims: [{ text: "无依据结论", chunkIds: [999] }], retrieval });
  assert.equal(v.approved, false);
  assert.equal(v.issues[0].type, "invalid_reference");
});
test("无引用关键 claim 被拒绝", () => {
  const v = validateCitations({ claims: [{ text: "关键结论", chunkIds: [] }], retrieval });
  assert.equal(v.approved, false);
  assert.equal(v.issues[0].type, "citation_missing");
});
test("导图节点引用未参与本次检索时被拒绝", () => {
  const v = validateCitations({
    claims: [{ locationKey: "mindmap.node.rotation", text: "左旋保持中序顺序", chunkIds: [999] }],
    retrieval,
  });
  assert.equal(v.approved, false);
  assert.equal(v.issues[0].locationKey, "mindmap.node.rotation");
});
test("PPTX 页面无合法引用时被拒绝", () => {
  const v = validateCitations({
    claims: [{ locationKey: "slides[3]", text: "关键页面结论", chunkIds: [] }],
    retrieval,
  });
  assert.equal(v.approved, false);
  assert.equal(v.issues[0].locationKey, "slides[3]");
});
