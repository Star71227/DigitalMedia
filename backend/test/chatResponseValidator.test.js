/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateChatResponse,
  validateTopicAcceptance,
  extractCodeBlocks,
  containsEmptyMain,
} = require("../src/services/chatResponseValidator");

function redBlackTreeAnswer() {
  return `# 直接结论

红黑树左旋不会破坏二叉搜索树顺序，因为它只重连局部父子指针，没有改变局部结点和子树的中序相对位置。设 x 的左子树为 A，x 的右孩子为 y，y 的左子树为 B，y 的右子树为 C，则旋转前后始终满足 A < x < B < y < C。

## 直观理解

旋转前可以写成 x(A, y(B, C))。这里 A 中所有键小于 x，B 中所有键位于 x 与 y 之间，C 中所有键大于 y。左旋后结构变成 y(x(A, B), C)：y 上升为局部根，x 下沉为 y 的左孩子，B 从 y 的左侧移动为 x 的右子树。虽然树形发生变化，A、x、B、y、C 从小到大的排列没有改变。

## 原理与分步过程

第一步令 y = x->right，保存即将上升的支点。第二步执行 x->right = y->left，把 B 接到 x 的右侧；若 B 不是哨兵结点，必须把 B->parent 更新为 x。第三步把 y->parent 设为 x 原来的父结点，并根据 x 原来是根、左孩子还是右孩子，更新 root 或父结点对应指针。最后执行 y->left = x 和 x->parent = y，完成局部根替换。整个过程中键值没有交换，也没有把任何键放到不满足大小关系的一侧。

## 完整数值示例

令 x.key=10、y.key=20，A 中键为 5，B 中键为 15，C 中键为 25。旋转前中序遍历是 5、10、15、20、25；旋转后 20 成为局部根，10 成为其左孩子，15 成为 10 的右孩子，中序遍历仍是 5、10、15、20、25。这个例子直接验证了 B 必须移动到 x->right，因为 15 大于 10 且小于 20。

## leftRotate C 代码

\`\`\`c
void leftRotate(RBTree *tree, Node *x) {
    Node *y = x->right;
    x->right = y->left;
    if (y->left != tree->nil) {
        y->left->parent = x;
    }
    y->parent = x->parent;
    if (x->parent == tree->nil) {
        tree->root = y;
    } else if (x == x->parent->left) {
        x->parent->left = y;
    } else {
        x->parent->right = y;
    }
    y->left = x;
    x->parent = y;
}
\`\`\`

## 易错点

1. 只写 x->right = y->left，却忘记在 B 非空时执行 B->parent = x，会让父指针链断裂。
2. 忘记区分 x 是根、左孩子还是右孩子，导致 x 原父结点仍然指向旧的局部根。
3. 过早覆盖 x->right 而没有先保存 y，后续就无法完成 y->left = x。
4. 把旋转和红黑树变色混为一谈；旋转保持搜索顺序，但颜色和黑高是否满足约束还要由修复算法判断。

## 检查理解

若 x=10、y=20、B 的根键为 15，为什么旋转后 B 必须成为 x 的右子树，而不能成为 x 的左子树？请同时写出旋转前后的中序序列。

## 下一步学习

接下来可以把同一局部结构镜像，推导右旋的全部指针更新；也可以把左旋放入红黑树插入修复案例，观察旋转与变色各自维护哪一条性质。`;
}

test("复杂回答质量合同接受完整红黑树答案", () => {
  const answerMarkdown = redBlackTreeAnswer();
  const quality = validateChatResponse({
    answerMarkdown,
    message: "红黑树左旋为什么不会破坏二叉搜索树的顺序？",
    knowledgePoint: "红黑树左旋",
    complexity: true,
    requiresCode: true,
    followups: ["右旋如何处理？", "插入修复何时左旋？"],
  });
  assert.equal(quality.passed, true, JSON.stringify(quality.issues));
  assert.ok(quality.characterCount >= 600);
  assert.ok(quality.sectionCount >= 5);
  assert.equal(quality.codeBlockCount, 1);
  assert.ok(quality.misconceptionCount >= 3);
  assert.match(answerMarkdown, /A < x < B < y < C/);
  assert.match(answerMarkdown, /y = x->right/);
  assert.equal(extractCodeBlocks(answerMarkdown)[0].language, "c");
});

test("质量验证拒绝过短且没有示例的复杂回答", () => {
  const quality = validateChatResponse({
    answerMarkdown: "# 结论\nTCP 通过三次握手建立连接。",
    message: "TCP为什么是三次握手而不是两次？",
    knowledgePoint: "TCP三次握手",
    complexity: true,
    requiresCode: false,
    followups: [],
  });
  assert.equal(quality.passed, false);
  assert.ok(quality.issues.some((item) => item.code === "answer_too_short"));
  assert.ok(quality.issues.some((item) => item.code === "missing_example"));
});

test("红黑树右旋质量合同要求镜像关系、符号顺序和完整指针更新", () => {
  const complete = validateTopicAcceptance(
    `右旋与左旋互为镜像，旋转前后都满足 A < x < B < y < C。

\`\`\`c
void rightRotate(RBTree *tree, Node *y) {
    Node *x = y->left;
    y->left = x->right;
    x->right = y;
    y->parent = x;
}
\`\`\``,
    "红黑树右旋",
  );
  assert.deepEqual(complete, []);
  const incomplete = validateTopicAcceptance("右旋保持中序顺序。", "红黑树右旋");
  assert.ok(incomplete.some((item) => item.code === "red_black_right_acceptance_missing"));
});

test("质量验证拒绝空 main 占位", () => {
  const markdown = "## 代码\n```c\nint main(void) { return 0; }\n```";
  assert.equal(containsEmptyMain(markdown), true);
  const quality = validateChatResponse({
    answerMarkdown: markdown,
    message: "写代码",
    knowledgePoint: "综合问题",
    complexity: false,
  });
  assert.ok(quality.issues.some((item) => item.code === "empty_main_placeholder"));
});

module.exports = { redBlackTreeAnswer };
