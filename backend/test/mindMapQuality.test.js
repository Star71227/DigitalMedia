/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStructuredMindMapContent } = require("../src/services/mindMapFallbackService");
const { validateMindMapQuality } = require("../src/services/mindMapQualityService");
const { parseMindMapJson } = require("../src/services/mindMapPromptService");

const context = {
  studentId: 7,
  resourceType: "mind_map",
  subject: "数据结构",
  knowledgePoint: "红黑树的结构、性质与插入修复",
  stageTitle: "红黑树阶段",
  stageGoals: ["理解红黑树性质", "掌握插入修复"],
  mastery: 45,
  errorPatterns: [{ errorType: "概念边界混淆", occurrenceCount: 2, confidence: 0.8 }],
  major: "软件工程",
  grade: "大二",
  currentCourse: "数据结构",
  priorKnowledge: ["C语言基础", "树与图基础薄弱"],
  learningGoals: ["准备408"],
  explanationPreference: "先图解后代码",
  resourcePreferences: ["思维导图", "代码示例"],
  paceAndTimeBudget: { pacePreference: "适中", weeklyTimeBudgetMinutes: 360 },
  estimatedMinutes: 40,
};
const retrieval = {
  results: [
    {
      chunkId: 12,
      sourceKey: "rbt",
      sourceTitle: "红黑树课程讲义",
      chapter: "红黑树",
      section: "插入修复",
      sourceVersion: "1.0",
      license: "CC-BY-4.0",
      content: "红黑树插入修复通过变色和旋转保持红黑性质，根节点最终为黑色。",
      score: 0.9,
    },
  ],
};
const citations = [
  {
    label: "S1",
    chunkId: 12,
    sourceKey: "rbt",
    sourceTitle: "红黑树课程讲义",
    chapter: "红黑树",
    section: "插入修复",
    version: "1.0",
    license: "CC-BY-4.0",
    excerpt: "红黑树插入修复通过变色和旋转保持红黑性质，根节点最终为黑色。",
    supportScore: 0.9,
  },
];

function long(label, extra = "") {
  return `${label}需要说明对象、条件、状态变化、正确结论和容易出错的位置，当前掌握度45，偏好先图解后代码，目标是准备408。${extra}`;
}

function child(id, label, type = "concept", extra = "") {
  return {
    id,
    label,
    description: long(label, extra),
    nodeType: type,
    importance: "medium",
    children: [],
    citations: [],
  };
}

function validBoundaryMap() {
  return {
    root: {
      id: "root",
      label: "红黑树的结构、性质与插入修复",
      description: long("主题root"),
      nodeType: "root",
      importance: "high",
      citations: [],
      children: [
        {
          id: "b1",
          label: "结构对象与颜色约束",
          description: long("一级结构对象与颜色约束"),
          nodeType: "concept",
          importance: "high",
          citations: [],
          children: [
            child("b1-a", "节点颜色和NIL叶子", "concept"),
            child("b1-b", "二叉搜索树中序顺序", "condition"),
            child("b1-c", "黑高一致路径约束", "condition"),
            child(
              "b1-d",
              "根节点最终为黑",
              "warning",
              "正确结论是根必须置黑，原因是变色上推可能染红根节点。",
            ),
          ],
        },
        {
          id: "b2",
          label: "插入修复执行流程",
          description: long("一级插入修复执行流程"),
          nodeType: "step",
          importance: "high",
          citations: [],
          children: [
            child("b2-a", "普通BST插入定位", "step"),
            child("b2-b", "父节点颜色判断", "condition"),
            child("b2-c", "父叔同红变色上推", "step"),
            child("b2-d", "伪代码循环条件", "code"),
          ],
        },
        {
          id: "b3",
          label: "旋转关系与错误辨析",
          description: long("一级旋转关系与错误辨析"),
          nodeType: "concept",
          importance: "high",
          citations: [],
          children: [
            child("b3-a", "左旋保持中序顺序", "step"),
            child("b3-b", "右旋镜像保持顺序", "step"),
            child(
              "b3-c",
              "易错：把红黑树当严格平衡树",
              "misconception",
              "错误认知是左右高度差必须为1，正确结论是近似平衡，原因是红黑树依靠黑高约束。",
            ),
            child(
              "b3-d",
              "易错：旋转后漏父指针",
              "misconception",
              "错误认知是旋转只改两个节点，正确结论是还要重接子树和父指针，原因是树必须连通。",
            ),
          ],
        },
        {
          id: "b4",
          label: "案例练习与复习顺序",
          description: long("一级案例练习与复习顺序"),
          nodeType: "summary",
          importance: "high",
          citations: [],
          children: [
            child(
              "b4-a",
              "示例：插入10、20、30触发左旋",
              "example",
              "具体步骤是先按BST插入，再识别右右结构，最后左旋并交换颜色。",
            ),
            child(
              "b4-b",
              "示例：父叔同红只变色",
              "example",
              "具体步骤是父叔变黑、祖父变红、检查点上移，最后根节点置黑。",
            ),
            child(
              "b4-c",
              "易错：空叔叔没有按黑色处理",
              "misconception",
              "错误认知是空叔叔不存在就跳过，正确结论是空叔叔按黑色，原因是NIL叶子参与性质判断。",
            ),
          ],
        },
      ],
    },
    crossLinks: [
      { sourceId: "b1-b", targetId: "b3-a", label: "旋转必须保持二叉搜索树中序顺序，否则查找路径被破坏。" },
      { sourceId: "b1-c", targetId: "b2-c", label: "父叔同红变色上推依赖黑高在两侧同步保持。" },
      { sourceId: "b2-d", targetId: "b4-c", label: "伪代码中的叔叔颜色判断可以避免空叔叔误判。" },
    ],
    highlightNodeIds: ["b1", "b2"],
    misconceptionNodeIds: ["b3-c", "b3-d", "b4-c"],
    recommendedSequence: ["b1", "b1-b", "b2", "b2-d", "b3", "b4"],
  };
}

function quality(content = validBoundaryMap(), options = {}) {
  return validateMindMapQuality({ content, context, citations: [], retrieval: { results: [] }, ...options });
}

function expectIssue(content, code, options = {}) {
  assert.ok(
    quality(content, options).issues.some((item) => item.code === code),
    code,
  );
}

test("恰好1个root、4个一级节点、15个二级节点、20个总节点通过", () => {
  const q = quality();
  assert.equal(q.passed, true);
  assert.equal(q.rootCount, 1);
  assert.equal(q.firstLevelNodes, 4);
  assert.equal(q.secondLevelNodes, 15);
  assert.equal(q.totalNodes, 20);
});
test("0个root失败", () =>
  expectIssue(
    { crossLinks: [], highlightNodeIds: [], misconceptionNodeIds: [], recommendedSequence: [] },
    "invalid_content",
  ));
test("2个root失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].nodeType = "root";
  expectIssue(c, "invalid_root_count");
});
test("3个一级节点失败", () => {
  const c = validBoundaryMap();
  c.root.children.pop();
  expectIssue(c, "invalid_first_level_count");
});
test("7个一级节点普通模式失败", () => {
  const c = validBoundaryMap();
  c.root.children.push(
    structuredClone(c.root.children[0]),
    structuredClone(c.root.children[1]),
    structuredClone(c.root.children[2]),
  );
  c.root.children[4].id = "extra-one";
  c.root.children[5].id = "extra-two";
  c.root.children[6].id = "extra-three";
  expectIssue(c, "invalid_first_level_count");
});
test("19个总节点失败", () => {
  const c = validBoundaryMap();
  c.root.children[3].children.pop();
  expectIssue(c, "invalid_total_node_count");
});
test("50个总节点通过", () => {
  const c = validBoundaryMap();
  for (let i = 0; i < 30; i += 1)
    c.root.children[1].children[3].children.push(child(`deep-${i}`, `过程验证节点${i}`, "step"));
  const q = quality(c);
  assert.equal(q.totalNodes, 50);
  assert.equal(q.passed, true);
});
test("51个总节点普通模式失败", () => {
  const c = validBoundaryMap();
  for (let i = 0; i < 31; i += 1)
    c.root.children[1].children[3].children.push(child(`deep-${i}`, `过程验证节点${i}`, "step"));
  expectIssue(c, "invalid_total_node_count");
});
test("14个二级节点失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].children.pop();
  expectIssue(c, "invalid_second_level_count");
});
test("最大深度2失败", () => {
  const c = validBoundaryMap();
  c.root.children.forEach((branch) => {
    branch.children = [];
  });
  expectIssue(c, "max_depth_too_shallow");
});
test("最大深度6普通模式失败", () => {
  const c = validBoundaryMap();
  let n = c.root.children[0].children[0];
  for (let i = 0; i < 3; i += 1) {
    const next = child(`chain-${i}`, `链式过程节点${i}`, "step");
    n.children = [next];
    n = next;
  }
  expectIssue(c, "max_depth_too_deep");
});
test("重复节点ID失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].children[0].id = "b1";
  expectIssue(c, "duplicate_node_id");
});
test("空节点ID失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].children[0].id = "";
  expectIssue(c, "empty_node_id");
});
test("同级重复标题失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].children[1].label = c.root.children[0].children[0].label;
  expectIssue(c, "sibling_duplicate_title");
});
test("空标题失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].children[0].label = "";
  expectIssue(c, "empty_title");
});
test("占位标题失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].children[0].label = "知识点1";
  expectIssue(c, "placeholder_found");
});
test("description覆盖率不足失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].children.forEach((node) => {
    node.description = "";
  });
  expectIssue(c, "insufficient_description_coverage");
});
test("一级节点描述过短失败", () => {
  const c = validBoundaryMap();
  c.root.children[0].description = "太短";
  expectIssue(c, "first_level_description_too_short");
});
test("大量重复description失败", () => {
  const c = validBoundaryMap();
  c.root.children.forEach((branch) =>
    branch.children.forEach((node) => {
      node.description = long("重复描述");
    }),
  );
  expectIssue(c, "duplicate_descriptions");
});
test("3条有效跨链接通过", () => assert.equal(quality().validCrossLinks, 3));
test("2条跨链接失败", () => {
  const c = validBoundaryMap();
  c.crossLinks.pop();
  expectIssue(c, "insufficient_cross_links");
});
test("跨链接自环失败", () => {
  const c = validBoundaryMap();
  c.crossLinks[0].targetId = c.crossLinks[0].sourceId;
  expectIssue(c, "self_loop");
});
test("跨链接端点缺失失败", () => {
  const c = validBoundaryMap();
  c.crossLinks[0].targetId = "missing";
  expectIssue(c, "invalid_edges");
});
test("跨链接重复父子边失败", () => {
  const c = validBoundaryMap();
  c.crossLinks[0] = { sourceId: "b1", targetId: "b1-a", label: "父子层级关系不能伪装为跨分支联系。" };
  expectIssue(c, "insufficient_cross_links");
});
test("跨链接全部集中root失败", () => {
  const c = validBoundaryMap();
  c.crossLinks = c.crossLinks.map((link) => ({ ...link, sourceId: "root" }));
  expectIssue(c, "insufficient_cross_links");
});
test("只有“示例”空节点失败", () => {
  const c = validBoundaryMap();
  c.root.children[3].children[0].label = "示例";
  c.root.children[3].children[0].description = "举例理解";
  c.root.children[3].children[1].label = "示例";
  c.root.children[3].children[1].description = "举例理解";
  expectIssue(c, "insufficient_examples");
});
test("模糊“注意事项”不算3个易错点", () => {
  const c = validBoundaryMap();
  ["b3-c", "b3-d", "b4-c"].forEach((id) => {
    const n = find(c.root, id);
    n.label = "注意事项";
    n.description = "认真看，注意一下，不要粗心。";
  });
  expectIssue(c, "insufficient_misconceptions");
});
test("无过程分支失败", () => {
  const c = validBoundaryMap();
  walk(c.root, (node) => {
    if (node.nodeType === "step" || node.nodeType === "code") node.nodeType = "concept";
    node.label = node.label.replace(/伪代码|执行|流程|步骤|过程/g, "机制");
    node.description = node.description.replace(/伪代码|执行|流程|步骤|过程/g, "机制");
  });
  expectIssue(c, "missing_process_branch");
});
test("缺少总结分支失败", () => {
  const c = validBoundaryMap();
  walk(c.root, (node) => {
    if (node.nodeType === "summary") node.nodeType = "concept";
    node.label = node.label.replace(/总结|复习|顺序|下一步|回顾/g, "练习集合");
    node.description = node.description.replace(/总结|复习|顺序|下一步|回顾/g, "练习集合");
  });
  expectIssue(c, "missing_summary_branch");
});
test("孤儿节点失败", () => {
  const c = flatValid();
  c.nodes.push({
    id: "orphan",
    label: "孤儿节点",
    description: long("孤儿节点"),
    nodeType: "concept",
    importance: "medium",
    parentId: "missing",
  });
  expectIssue(c, "orphan_nodes");
});
test("不可达节点失败", () => {
  const c = flatValid();
  c.nodes.push({
    id: "lost",
    label: "不可达节点",
    description: long("不可达节点"),
    nodeType: "concept",
    importance: "medium",
  });
  expectIssue(c, "unreachable_nodes");
});
test("层级循环失败", () => {
  const c = flatValid();
  c.edges.push({ sourceId: "b1-a", targetId: "b1", type: "hierarchy" });
  expectIssue(c, "hierarchy_cycle");
});
test("层级自环失败", () => {
  const c = flatValid();
  c.edges.push({ sourceId: "b1-a", targetId: "b1-a", type: "hierarchy" });
  expectIssue(c, "self_loop");
});
test("重复层级边失败", () => {
  const c = flatValid();
  c.edges.push({ sourceId: "root", targetId: "b1", type: "hierarchy" });
  expectIssue(c, "duplicate_edges");
});
test("非法边端点失败", () => {
  const c = flatValid();
  c.edges.push({ sourceId: "root", targetId: "missing", type: "hierarchy" });
  expectIssue(c, "invalid_edges");
});
test("画像可用且3项事实通过", () => assert.ok(quality().profileFactCount >= 3));
test("画像可用但不足3项失败", () => {
  const c = validBoundaryMap();
  JSON.stringify(c);
  walk(c.root, (node) => {
    node.description = node.description.replace(
      /45|先图解后代码|准备408|思维导图|代码示例|360|适中|C语言基础|树与图基础薄弱/g,
      "",
    );
  });
  expectIssue(c, "insufficient_profile_facts");
});
test("无画像时不强制个性化", () =>
  assert.equal(
    validateMindMapQuality({
      content: validBoundaryMap(),
      context: {},
      citations: [],
      retrieval: { results: [] },
    }).issues.some((item) => item.code === "insufficient_profile_facts"),
    false,
  ));
test("真实引用通过", () => {
  const c = validBoundaryMap();
  find(c.root, "b1-a").citations = [12];
  const q = quality(c, { citations, retrieval });
  assert.equal(q.passed, true);
});
test("悬空sourceRef失败", () => {
  const c = validBoundaryMap();
  find(c.root, "b1-a").citations = [99];
  expectIssue(c, "invalid_citations", { citations, retrieval });
});
test("无知识库命中时不强制引用", () =>
  assert.equal(
    quality().issues.some((item) => item.code === "invalid_citations"),
    false,
  ));
test("无知识库命中但出现假引用失败", () => {
  const c = validBoundaryMap();
  find(c.root, "b1-a").citations = [12];
  expectIssue(c, "invalid_citations");
});
test("知识库命中但节点未绑定引用失败", () =>
  expectIssue(validBoundaryMap(), "missing_node_citations", { citations, retrieval }));
test("截断JSON失败", () => assert.throws(() => parseMindMapJson('{"root":'), /JSON/));
test("null安全失败", () =>
  assert.equal(
    validateMindMapQuality({ content: null, context, citations: [], retrieval: { results: [] } }).passed,
    false,
  ));
test("错误类型安全失败", () =>
  assert.equal(
    validateMindMapQuality({ content: "bad", context, citations: [], retrieval: { results: [] } }).passed,
    false,
  ));
test("超大节点数组安全拒绝", () => {
  const c = validBoundaryMap();
  for (let i = 0; i < 60; i += 1)
    c.root.children[0].children.push(child(`over-${i}`, `超大节点${i}`, "concept"));
  expectIssue(c, "invalid_total_node_count");
});
test("正常中文中英文混合安全通过", () => {
  const c = validBoundaryMap();
  find(c.root, "b2-d").description += " RED BLACK TREE、SYN、ACK、FIN、CPU、TLB 都可以作为英文术语出现。";
  assert.equal(quality(c).passed, true);
});
test("危险HTML失败", () => {
  const c = validBoundaryMap();
  find(c.root, "b1-a").description += "<script>alert(1)</script>";
  expectIssue(c, "unsafe_content");
});
test("确定性红黑树、进程线程和TCP均通过", () => {
  for (const [subject, knowledgePoint] of [
    ["数据结构", "红黑树的结构、性质与插入修复"],
    ["操作系统", "进程、线程、调度与上下文切换"],
    ["计算机网络", "TCP连接建立、数据传输与连接释放"],
  ]) {
    const ctx = {
      ...context,
      subject,
      knowledgePoint,
      currentCourse: subject,
      stageTitle: `${knowledgePoint}阶段`,
      stageGoals: [`理解${knowledgePoint}`],
    };
    const q = validateMindMapQuality({
      content: buildStructuredMindMapContent(ctx),
      context: ctx,
      citations: [],
      retrieval: { results: [] },
    });
    assert.equal(q.passed, true, `${subject}: ${q.issues.map((item) => item.code).join(",")}`);
  }
});

function find(root, id) {
  let found = null;
  walk(root, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

function walk(node, fn, seen = new Set()) {
  if (!node || seen.has(node)) return;
  seen.add(node);
  fn(node);
  (node.children || []).forEach((child) => walk(child, fn, seen));
}

function flatValid() {
  const nested = validBoundaryMap();
  const nodes = [];
  const edges = [];
  walk(nested.root, (node) => {
    nodes.push({
      id: node.id,
      label: node.label,
      description: node.description,
      nodeType: node.nodeType,
      importance: node.importance,
      parentId: null,
    });
    for (const child of node.children || [])
      edges.push({ sourceId: node.id, targetId: child.id, type: "hierarchy" });
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) byId.get(edge.targetId).parentId = edge.sourceId;
  return {
    root: nodes[0],
    nodes,
    edges,
    crossLinks: nested.crossLinks,
    highlightNodeIds: nested.highlightNodeIds,
    misconceptionNodeIds: nested.misconceptionNodeIds,
    recommendedSequence: nested.recommendedSequence,
  };
}
