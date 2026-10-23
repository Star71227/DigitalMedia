/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { splitMarkdown } = require("../src/services/knowledgeChunkingService");
test("标题感知切分保留章节路径且 chunk key 稳定", () => {
  const source =
    "# 树\n\n## 旋转\n\n" +
    "左旋保持中序次序。".repeat(90) +
    "\n\n```c\nvoid rotateLeft(Node *x) { x->right = 0; }\n```";
  const options = { sourceKey: "ds-test", documentKey: "tree", subject: "数据结构", targetChars: 300 };
  const a = splitMarkdown(source, options),
    b = splitMarkdown(source, options);
  assert.ok(a.length >= 2);
  assert.deepEqual(
    a.map((x) => x.chunkKey),
    b.map((x) => x.chunkKey),
  );
  assert.ok(a.every((x) => x.headingPath.includes("旋转")));
  assert.ok(a.some((x) => x.content.includes("void rotateLeft")));
});
test("空白和纯标题不会形成 chunk", () =>
  assert.equal(
    splitMarkdown("# 空标题\n\n  ", { sourceKey: "x", documentKey: "x", subject: "数据结构" }).length,
    0,
  ));
