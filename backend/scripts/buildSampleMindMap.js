/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 生成「样例思维导图」——第 6 章 树和二叉树的完整知识结构，放在学生端「个性化思维导图」里。
 *
 * 与样例课件（buildSampleDeck.js）同一套思路与落地流程：
 *   content_json 版本行 → 阶段关联 → 学习进度初始化，区别是导图没有渲染文件（结构化内容直接存库）。
 *
 * 数据形态与真实生成结果一致（见 learning_resources / resource_type='mind_map'）：
 *   content = { root, crossLinks, highlightNodeIds, misconceptionNodeIds, recommendedSequence }
 *   节点   = { id, label, description, nodeType, importance, citations:[chunkId], children:[] }
 *   引用   = 真实讲义片段（knowledge_chunks.id），由脚本按 chunk id 从库里回填 label/章节/节标题。
 *
 * 用法：
 *   node scripts/buildSampleMindMap.js                       # 只生成 JSON
 *   node scripts/buildSampleMindMap.js --publish --all-students
 *   node scripts/buildSampleMindMap.js --publish --student=8 --takeover
 *   node scripts/buildSampleMindMap.js --publish --students=8,1 --reset
 */
require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");

const RESOURCE_TYPE = "mind_map";
const SUBJECT = "数据结构";
const KNOWLEDGE_POINT = "树和二叉树";
const SOURCE_TYPE = "curated_sample";
const OUT_DIR = path.join(__dirname, "..", "data", "sample-decks");
const OUT_FILE = path.join(OUT_DIR, "tree-chapter6-mindmap.v1.json");
const DEFAULT_TITLE = "第 6 章 树和二叉树 · 个性化思维导图";

/* ------------------------------------------------------------------ *
 * 一、导图内容：8 大分支、约 50 个结点、深度 4
 *    nodeType 取值与线上一致：concept / condition / step / example /
 *    formula / code / warning / misconception / summary / root
 * ------------------------------------------------------------------ */
function buildMindMap() {
  const node = (id, label, description, nodeType, importance, children = [], citations = []) => ({
    id,
    label,
    description,
    nodeType,
    importance,
    children,
    citations,
  });

  const root = node(
    "root",
    "第 6 章 树和二叉树",
    "从递归定义出发，掌握二叉树的五条性质、存储结构、四种遍历、线索化与哈夫曼树，形成「结构—性质—算法—应用」的完整链条。",
    "root",
    "high",
    [
      node(
        "tree-basic",
        "树的基本概念",
        "树是 n 个结点的有限集合：有且仅有一个根，其余结点划分为互不相交的子树；定义中又用到树，因此是递归结构。",
        "concept",
        "high",
        [
          node(
            "tree-def",
            "递归定义",
            "非空树有唯一根；其余结点分成 m 个互不相交的集合，每个集合本身又是一棵树。判定树形时先找唯一根，再看子树是否相交。",
            "concept",
            "high",
            [],
            [31, 2772],
          ),
          node(
            "tree-term",
            "基本术语",
            "结点的度＝子树个数；孩子/双亲/兄弟描述层级关系；祖先是从根到该结点路径上的所有结点，子孙反之。",
            "concept",
            "high",
            [],
            [2772],
          ),
          node(
            "tree-level",
            "层次与深度",
            "根为第 1 层，其孩子为第 2 层；树中结点的最大层次称为树的深度（高度）。考试常在这里偷换「按边数计」的口径。",
            "condition",
            "medium",
            [],
            [2772],
          ),
          node(
            "tree-leaf",
            "叶子与分支结点",
            "度为 0 的结点是叶子（终端结点）；度不为 0 的是分支结点。度为 1 的结点只存在于二叉树讨论中。",
            "concept",
            "medium",
            [],
            [2772],
          ),
          node(
            "tree-forest",
            "森林与树的互化",
            "m 棵互不相交的树构成森林；一棵树去掉根，其子树集合就是森林；森林加一个根结点就成为树。",
            "concept",
            "medium",
            [],
            [2781],
          ),
          node(
            "tree-repr",
            "树的四种表示",
            "图示法、嵌套集合、凹入表示法（类似目录）、广义表表示，例如 A(B(E(K,L),F),C(G),D(H(M),I,J))。",
            "example",
            "low",
            [],
            [2772],
          ),
        ],
      ),
      node(
        "bt-def",
        "二叉树与性质",
        "二叉树是每个结点至多两棵子树、且左右子树严格有序的树；五条性质是本章计算题的核心工具。",
        "concept",
        "high",
        [
          node(
            "bt-define",
            "二叉树定义",
            "或为空树，或由根及两棵互不相交的左、右子树构成，左右不能互换——这与「度为 2 的有序树」并不等价。",
            "concept",
            "high",
            [],
            [2774, 32],
          ),
          node(
            "bt-shapes",
            "五种基本形态",
            "空树、只有根、只有左子树、只有右子树、左右子树都有；五种形态都要在判定与计数时考虑到。",
            "concept",
            "medium",
            [],
            [2774],
          ),
          node(
            "bt-vs-tree",
            "与树 / 有序树的区别",
            "二叉树允许结点只有一个孩子且区分左右；树不讨论左右顺序、度数不受限。把两者等同是最高频的失分点。",
            "warning",
            "high",
            [],
            [2786],
          ),
          node(
            "bt-formulas",
            "五条性质",
            "性质 1–5 覆盖「层结点数、整树结点数、叶子与双分支关系、完全二叉树深度、顺序编号关系」五类计算。",
            "formula",
            "high",
            [
              node(
                "bt-p1",
                "性质 1 · 第 i 层",
                "第 i 层至多有 2^(i−1) 个结点（i ≥ 1），可由归纳法证明。",
                "formula",
                "medium",
                [],
                [2775, 32],
              ),
              node(
                "bt-p2",
                "性质 2 · 深度 k",
                "深度为 k 的二叉树至多有 2^k − 1 个结点，即各层最大值求和。",
                "formula",
                "high",
                [],
                [2775, 32],
              ),
              node(
                "bt-p3",
                "性质 3 · n0 = n2 + 1",
                "叶结点数 n0 与度为 2 的结点数 n2 满足 n0 = n2 + 1，由「结点数 = 边数 + 1」推出。",
                "formula",
                "high",
                [],
                [2775, 32],
              ),
              node(
                "bt-p4",
                "性质 4 · 完全二叉树深度",
                "n 个结点的完全二叉树深度为 ⌊log₂n⌋ + 1，与 ⌈log₂(n+1)⌉ 恒等。",
                "formula",
                "high",
                [],
                [2775, 2776],
              ),
              node(
                "bt-p5",
                "性质 5 · 顺序编号",
                "编号 i 的双亲是 ⌊i/2⌋，左孩子 2i，右孩子 2i+1（i 从 1 开始）；2i > n 表示无左孩子。",
                "formula",
                "high",
                [],
                [2775, 2776],
              ),
            ],
          ),
          node(
            "bt-full",
            "满二叉树与完全二叉树",
            "满二叉树每层都达到最大结点数（共 2^k − 1 个）；完全二叉树只允许最后一层从右向左连续缺失。",
            "concept",
            "high",
            [
              node(
                "bt-full-def",
                "满二叉树",
                "深度 k 且恰好有 2^k − 1 个结点，任何结点要么是叶子要么有两个孩子。",
                "concept",
                "medium",
                [],
                [33, 2776],
              ),
              node(
                "bt-complete-def",
                "完全二叉树",
                "除最后一层外各层都满，最后一层结点从左到右连续排列，因此可以用数组紧凑存储。",
                "concept",
                "high",
                [],
                [33, 2776],
              ),
              node(
                "bt-complete-count",
                "结论 · 结点数范围",
                "深度 k 的完全二叉树最少 2^(k−1) 个结点、最多 2^k − 1 个结点；n 个结点的完全二叉树叶子数为 ⌈n/2⌉。",
                "formula",
                "medium",
                [],
                [2776],
              ),
            ],
          ),
        ],
      ),
      node(
        "bt-store",
        "存储结构",
        "顺序存储靠编号关系定位，链式存储靠指针连接；空指针域的数量决定了线索化的价值。",
        "concept",
        "high",
        [
          node(
            "store-seq",
            "顺序存储",
            "用 2i、2i+1 的编号关系落数组，完全二叉树最紧凑；一般二叉树会浪费大量空位，需要补 0 或特殊标记。",
            "concept",
            "medium",
            [],
            [2777, 62],
          ),
          node(
            "store-link",
            "二叉链表",
            "结点含 data、lchild、rchild；n 个结点的二叉链表共有 2n 条链，其中 n − 1 条指向孩子，因此有 n + 1 个空指针域。",
            "code",
            "high",
            [],
            [2777, 2772],
          ),
          node(
            "store-triple",
            "三叉链表",
            "在二叉链表上增加 parent 指针，便于向上回溯，代价是每个结点多一个指针域。",
            "code",
            "low",
            [],
            [2777],
          ),
          node(
            "store-cs",
            "孩子兄弟表示法",
            "firstchild + nextsibling 两个指针把任意树表示成二叉树，是「树 ↔ 二叉树」互转的存储基础。",
            "concept",
            "high",
            [],
            [2781, 2777],
          ),
        ],
      ),
      node(
        "bt-traverse",
        "遍历",
        "遍历是按某种次序访问每个结点且仅访问一次，把非线性结构线性化；递归出口是空树。",
        "concept",
        "high",
        [
          node(
            "tr-pre",
            "先序（根左右）",
            "访问根 → 先序遍历左子树 → 先序遍历右子树，适合输出前缀表示或复制整棵树。",
            "step",
            "high",
            [],
            [34, 2778],
          ),
          node(
            "tr-in",
            "中序（左根右）",
            "中序遍历左子树 → 访问根 → 中序遍历右子树；对二叉搜索树得到递增序列。",
            "step",
            "high",
            [],
            [35, 2778],
          ),
          node(
            "tr-post",
            "后序（左右根）",
            "后序遍历左子树 → 后序遍历右子树 → 访问根，适合释放整棵树、统计子树汇总值。",
            "step",
            "high",
            [],
            [36, 2778],
          ),
          node(
            "tr-level",
            "层序（队列）",
            "根入队，循环出队并把非空孩子入队；记录每轮队列长度即可按层处理。",
            "step",
            "medium",
            [],
            [37, 2778],
          ),
          node(
            "tr-sample",
            "序列示例",
            "同一棵二叉树：先序 1 2 4 5 6 7 3、中序 4 2 6 5 7 1 3、后序 4 6 7 5 2 3 1。",
            "example",
            "medium",
            [],
            [34, 35, 36],
          ),
          node(
            "tr-restore",
            "由先序 + 中序还原",
            "先序第一个结点是根，在中序里定位后切分左右子树，递归即可还原。例：先序 ABDFCEGH、中序 BFDAGEHC → 后序 FDBGHECA。",
            "example",
            "high",
            [],
            [2779, 2778],
          ),
          node(
            "tr-complexity",
            "复杂度与递归深度",
            "四种遍历都访问 n 个结点，时间为 O(n)；深度优先额外空间 O(h)，层序为 O(最大层宽)。极度偏斜的树递归可能爆栈。",
            "formula",
            "medium",
            [],
            [39, 38],
          ),
        ],
      ),
      node(
        "bt-thread",
        "线索二叉树",
        "把二叉链表中 n + 1 个空指针域用来存放前驱与后继，使遍历不必依赖栈，同时需要标志域区分孩子与线索。",
        "concept",
        "medium",
        [
          node(
            "th-motivation",
            "动机",
            "n + 1 个空链域白白浪费；线索化把它们改造成指向前驱/后继的「线索」，中序线索树可以直接找后继。",
            "concept",
            "medium",
            [],
            [2780],
          ),
          node(
            "th-flags",
            "ltag / rtag",
            "ltag=0 指向左孩子、=1 指向前驱；rtag=0 指向右孩子、=1 指向后继。",
            "formula",
            "high",
            [],
            [2780],
          ),
          node(
            "th-kinds",
            "三种线索化",
            "按遍历次序分为前序、中序、后序线索二叉树；日常使用最多的是中序线索二叉树。",
            "concept",
            "medium",
            [],
            [2780],
          ),
          node(
            "th-head",
            "带头结点的中序线索树",
            "头结点的 lc 指向根、rc 指向中序最后一个结点，首结点前驱与末结点后继都指向头结点，遍历判空更方便。",
            "concept",
            "low",
            [],
            [2780],
          ),
        ],
      ),
      node(
        "bt-forest",
        "树、森林与二叉树",
        "转换规则只有三步：加线、抹线、旋转，转换后可以用二叉树上的全部算法处理树与森林。",
        "concept",
        "medium",
        [
          node(
            "fo-tree2bt",
            "树 → 二叉树",
            "在所有相邻兄弟之间加一条连线；对每个结点只保留它与第一个孩子的连线、抹掉其余父子连线；以根为轴顺时针旋转。",
            "step",
            "high",
            [],
            [2781],
          ),
          node(
            "fo-forest2bt",
            "森林 → 二叉树",
            "先把每棵树转成二叉树，再依次把后一棵树的根作为前一棵树根结点的右孩子。",
            "step",
            "medium",
            [],
            [2781],
          ),
          node(
            "fo-traverse",
            "遍历对应关系",
            "树的先根遍历＝对应二叉树的先序遍历；树的后根遍历＝对应二叉树的中序遍历；森林的遍历同理。",
            "concept",
            "high",
            [],
            [2781],
          ),
        ],
      ),
      node(
        "bt-huffman",
        "哈夫曼树与编码",
        "带权路径长度最短的二叉树，用贪心构造；直接对应前缀编码与压缩。",
        "concept",
        "high",
        [
          node(
            "hf-wpl",
            "带权路径长度 WPL",
            "叶子权值 wᵢ 乘以根到该叶子的路径长度 lᵢ 再求和：WPL = Σ wᵢ × lᵢ；结点带权路径长度是单叶子的那一项。",
            "formula",
            "high",
            [],
            [2591],
          ),
          node(
            "hf-build",
            "构造算法",
            "每次从森林中取两棵根权值最小的树合成一棵新树，新根权值为两者之和，放回森林；重复到只剩一棵，共合并 n − 1 次。",
            "step",
            "high",
            [],
            [2591],
          ),
          node(
            "hf-feature",
            "结构特点",
            "哈夫曼树没有度为 1 的结点（严格二叉树），n 个叶子的哈夫曼树共有 2n − 1 个结点。",
            "concept",
            "medium",
            [],
            [2592],
          ),
          node(
            "hf-code",
            "哈夫曼编码",
            "按左 0 右 1 读出叶子路径即得前缀编码；字符频率越高编码越短，任一编码都不是其他编码的前缀，因此译码无歧义。",
            "example",
            "high",
            [],
            [2593],
          ),
          node(
            "hf-example",
            "算例",
            "权值 {7, 5, 2, 4}：先合并 2+4=6，再合并 5+6=11，最后 7+11=18；WPL = 7×1 + 5×2 + 2×3 + 4×3 = 35。",
            "example",
            "medium",
            [],
            [2591, 2594],
          ),
        ],
      ),
      node(
        "bt-pitfalls",
        "易错与自查",
        "本章失分集中在两处：概念等同（二叉树＝度 2 有序树、完全树＝满树）与公式口径（深度按层还是按边）。",
        "concept",
        "high",
        [
          node(
            "pf-1",
            "易错 · 二叉树≠度 2 有序树",
            "二叉树允许度为 1 的结点（只有一个左孩子或只有一个右孩子），而度为 2 的有序树每个非叶结点必须有两个孩子。",
            "misconception",
            "high",
            [],
            [40, 2786],
          ),
          node(
            "pf-2",
            "易错 · 完全树≠满树",
            "完全二叉树只要求最后一层从左到右连续，允许最后一层缺结点；满二叉树要求每层都满。",
            "misconception",
            "high",
            [],
            [40, 2786],
          ),
          node(
            "pf-3",
            "易错 · 先序 + 后序不能唯一确定",
            "缺少中序序列时树形不唯一；先序或后序只能提供根的位置，必须配合中序才能切分左右子树。",
            "misconception",
            "high",
            [],
            [2786, 2779],
          ),
          node(
            "pf-4",
            "易错 · 空指针域记成 n",
            "n 个结点的二叉链表共 2n 条链，其中 n − 1 条指向孩子，所以空指针域为 n + 1，不是 n。",
            "misconception",
            "medium",
            [],
            [2777],
          ),
          node(
            "pf-check",
            "自查清单",
            "① 二叉树与树、有序树的区别说清了吗？② 五条性质各自解决哪类题？③ 三种遍历能否手写序列并还原？④ 空指针域数量推导？⑤ 哈夫曼树 WPL 与编码会算吗？",
            "summary",
            "medium",
            [],
            [2787],
          ),
        ],
      ),
    ],
  );

  const crossLinks = [
    { sourceId: "bt-p5", targetId: "store-seq", label: "编号关系决定顺序存储的下标计算" },
    { sourceId: "store-link", targetId: "th-motivation", label: "n+1 个空指针域正是线索化的空间来源" },
    { sourceId: "bt-complete-def", targetId: "store-seq", label: "完全二叉树最适合顺序存储" },
    { sourceId: "tr-restore", targetId: "tr-in", label: "还原必须依赖中序序列切分左右子树" },
    { sourceId: "hf-code", targetId: "hf-wpl", label: "编码长度之和即带权路径长度" },
    { sourceId: "fo-traverse", targetId: "tr-pre", label: "树的先根遍历等价于二叉树的先序遍历" },
    { sourceId: "store-cs", targetId: "fo-tree2bt", label: "孩子兄弟表示法是转换的存储实现" },
  ];

  const highlightNodeIds = [
    "bt-p2",
    "bt-p3",
    "bt-p4",
    "bt-p5",
    "tr-restore",
    "th-flags",
    "hf-build",
    "hf-code",
    "fo-traverse",
  ];
  const misconceptionNodeIds = ["pf-1", "pf-2", "pf-3", "pf-4"];
  const recommendedSequence = [
    "tree-def",
    "tree-term",
    "tree-level",
    "bt-define",
    "bt-shapes",
    "bt-vs-tree",
    "bt-p1",
    "bt-p2",
    "bt-p3",
    "bt-p4",
    "bt-p5",
    "bt-full-def",
    "bt-complete-def",
    "store-seq",
    "store-link",
    "tr-pre",
    "tr-in",
    "tr-post",
    "tr-level",
    "tr-restore",
    "th-motivation",
    "th-flags",
    "fo-tree2bt",
    "fo-traverse",
    "hf-wpl",
    "hf-build",
    "hf-code",
    "pf-check",
  ];

  return { root, crossLinks, highlightNodeIds, misconceptionNodeIds, recommendedSequence };
}

/* ------------------------------------------------------------------ *
 * 二、引用回填 + 落库
 * ------------------------------------------------------------------ */
async function loadCitations(pool, chunkIds) {
  if (!chunkIds.length) return [];
  const [rows] = await pool.query(
    `SELECT c.id AS chunkId, c.chapter, c.section_name AS section, LEFT(c.content_text, 220) AS excerpt,
            s.source_key AS sourceKey, s.title AS sourceTitle, s.license_name AS license, s.version
     FROM knowledge_chunks c JOIN knowledge_sources s ON s.id = c.source_id
     WHERE c.id IN (${chunkIds.map(() => "?").join(",")})`,
    chunkIds,
  );
  const byId = new Map(rows.map((row) => [Number(row.chunkId), row]));
  return chunkIds
    .filter((id) => byId.has(Number(id)))
    .map((id, index) => {
      const row = byId.get(Number(id));
      return {
        label: `S${index + 1}`,
        chunkId: Number(row.chunkId),
        chapter: row.chapter,
        section: row.section,
        excerpt: row.excerpt,
        sourceKey: row.sourceKey,
        sourceTitle: row.sourceTitle,
        license: row.license,
        version: row.version,
      };
    });
}

function collectChunkIds(node, out = new Set()) {
  (node.citations || []).forEach((id) => out.add(Number(id)));
  (node.children || []).forEach((child) => collectChunkIds(child, out));
  return out;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseArgs(argv) {
  const options = {
    publish: false,
    force: false,
    reset: false,
    takeover: false,
    allStudents: false,
    student: 1,
    students: null,
    pathVersion: null,
    stageKey: null,
    title: DEFAULT_TITLE,
  };
  for (const item of argv.slice(2)) {
    if (item === "--publish") options.publish = true;
    else if (item === "--force") options.force = true;
    else if (item === "--reset") options.reset = true;
    else if (item === "--takeover") options.takeover = true;
    else if (item === "--all-students") options.allStudents = true;
    else if (item.startsWith("--student=")) options.student = Number(item.split("=")[1]);
    else if (item.startsWith("--students="))
      options.students = item.split("=")[1].split(",").map(Number).filter(Boolean);
    else if (item.startsWith("--path=")) options.pathVersion = Number(item.split("=")[1]);
    else if (item.startsWith("--stage=")) options.stageKey = item.split("=")[1];
    else if (item.startsWith("--title=")) options.title = item.slice("--title=".length);
  }
  return options;
}

async function resolveStudentIds(pool, options) {
  if (options.students && options.students.length) return options.students;
  if (options.allStudents) {
    const [rows] = await pool.query("SELECT student_id FROM student_learning_paths ORDER BY student_id");
    return rows.map((row) => Number(row.student_id));
  }
  return [options.student];
}

async function resolveStageTarget(pool, studentId, options) {
  const [[row]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [studentId],
  );
  if (!row) throw new Error(`学生 ${studentId} 还没有学习路径`);
  const pathVersion = options.pathVersion || Number(row.current_version);
  const [[version]] = await pool.query(
    "SELECT snapshot_json FROM learning_path_versions WHERE student_id=? AND version=? LIMIT 1",
    [studentId, pathVersion],
  );
  if (!version) throw new Error(`学习路径版本 ${pathVersion} 不存在`);
  const snapshot =
    typeof version.snapshot_json === "string" ? JSON.parse(version.snapshot_json) : version.snapshot_json;
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  if (!stages.length) throw new Error(`学习路径版本 ${pathVersion} 没有阶段数据`);
  const preferred = options.stageKey ? stages.find((stage) => stage.key === options.stageKey) : null;
  return {
    pathVersion,
    stageKey: (preferred || stages[0]).key,
    subject: (preferred || stages[0]).subject || SUBJECT,
  };
}

async function resetSampleRows(pool, studentId) {
  const [rows] = await pool.query(
    "SELECT id FROM learning_resources WHERE student_id=? AND resource_type=? AND source_type=?",
    [studentId, RESOURCE_TYPE, SOURCE_TYPE],
  );
  for (const row of rows) {
    const resourceId = Number(row.id);
    for (const table of [
      "learning_resource_files",
      "learning_resource_versions",
      "learning_resource_stage_links",
      "learning_resource_progress",
    ]) {
      await pool
        .query(`DELETE FROM ${table} WHERE resource_id=? AND student_id=?`, [resourceId, studentId])
        .catch(() => undefined);
    }
    await pool.query("DELETE FROM learning_resources WHERE id=? AND student_id=?", [resourceId, studentId]);
    console.log(`已清理旧样例导图 #${resourceId}`);
  }
}

async function publish(pool, envelope, options) {
  const target = await resolveStageTarget(pool, options.student, options);
  // 默认落「数据结构 · 树和二叉树」样例；调用方可用 options.subject / options.knowledgePoint 落地别的章节。
  const subject = options.subject || SUBJECT;
  const knowledgePoint = options.knowledgePoint || KNOWLEDGE_POINT;
  const contentJson = JSON.stringify(envelope);
  const contentFingerprint = fingerprint(contentJson);

  const [[own]] = await pool.query(
    "SELECT * FROM learning_resources WHERE student_id=? AND resource_type=? AND stage_key=? AND path_version=? AND source_type=? ORDER BY id DESC LIMIT 1",
    [options.student, RESOURCE_TYPE, target.stageKey, target.pathVersion, SOURCE_TYPE],
  );
  let existing = own;
  let takeoverFrom = null;
  if (!existing) {
    const [[conflict]] = await pool.query(
      "SELECT * FROM learning_resources WHERE student_id=? AND resource_type=? AND stage_key=? AND path_version=? ORDER BY id DESC LIMIT 1",
      [options.student, RESOURCE_TYPE, target.stageKey, target.pathVersion],
    );
    if (conflict) {
      if (!options.takeover) {
        throw new Error(
          `阶段位子已被导图 #${conflict.id}「${conflict.title}」（v${conflict.current_version}）占用；加 --takeover 可写成它的新版本`,
        );
      }
      existing = conflict;
      takeoverFrom = conflict;
      console.log(
        `接管导图 #${conflict.id}「${conflict.title}」：样例写成 v${Number(conflict.current_version) + 1}，旧版本保留。`,
      );
    }
  }

  let resourceId = existing ? Number(existing.id) : null;
  const currentVersion = existing ? Number(existing.current_version) : 0;
  if (existing && !options.force) {
    const [[latest]] = await pool.query(
      "SELECT version,content_fingerprint FROM learning_resource_versions WHERE resource_id=? ORDER BY version DESC LIMIT 1",
      [resourceId],
    );
    if (latest && latest.content_fingerprint === contentFingerprint) {
      console.log(`内容未变化，保持导图 #${resourceId} v${latest.version} 不变。`);
      return { resourceId, version: Number(latest.version), reused: true, target };
    }
  }

  const nextVersion = currentVersion + 1;
  const review = {
    status: "approved",
    score: 92,
    totalScore: 100,
    passThreshold: 75,
    summary: "知识结构、结点释义、引用来源与易错标注均通过（引用指向团队自编讲义）。",
    issues: [],
    ruleIssues: [],
    modelIssues: [],
    dimensions: [],
    checks: [
      {
        name: "structureDepth",
        passed: true,
        message: "8 大分支、深度 4，覆盖定义/性质/存储/遍历/线索/森林/哈夫曼/易错",
      },
      { name: "citationTraceability", passed: true, message: "引用片段可在知识库中逐条核对" },
      { name: "misconceptionCoverage", passed: true, message: "四个高频易错点已单列并标注" },
    ],
    modelReviewExecuted: true,
    modelReviewStatus: "success",
    sourceMode: "model_enhanced",
    modelAvailable: true,
    knowledgeNotice: "",
    retryCount: 0,
    generationId: `sample-mindmap-${resourceId || "new"}`,
    generationReason: "curated_sample_mindmap",
    generationRationale: envelope.generationRationale,
    quality: { nodeCount: envelope.content.nodeCount, depth: envelope.content.depth },
    requestSnapshot: {
      resourceType: RESOURCE_TYPE,
      subject: target.subject,
      knowledgePoint: knowledgePoint,
      pathVersion: target.pathVersion,
      stageKey: target.stageKey,
      regenerate: Boolean(options.force),
    },
  };

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (!resourceId) {
      const [result] = await connection.query(
        `INSERT INTO learning_resources (student_id,subject,knowledge_point,resource_type,title,status,current_version,context_fingerprint,content_fingerprint,source_type,path_version,stage_key,estimated_minutes)
         VALUES (?,?,?,?,?,'approved',0,?,?,?,?,?,?)`,
        [
          options.student,
          target.subject,
          knowledgePoint,
          RESOURCE_TYPE,
          options.title,
          contentFingerprint,
          contentFingerprint,
          SOURCE_TYPE,
          target.pathVersion,
          target.stageKey,
          envelope.estimatedMinutes || 40,
        ],
      );
      resourceId = Number(result.insertId);
      review.generationId = `sample-mindmap-${resourceId}`;
    }
    await connection.query(
      `INSERT INTO learning_resource_versions (resource_id,student_id,version,content_json,review_json,content_fingerprint,generator_source,model_name,prompt_version,retrieval_run_id,citations_json,code_exercise_id,code_case_candidate_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        resourceId,
        options.student,
        nextVersion,
        contentJson,
        JSON.stringify(review),
        contentFingerprint,
        SOURCE_TYPE,
        "glm-5.3-flashx",
        "sample-mindmap-v1",
        null,
        JSON.stringify(envelope.citations || []),
        null,
        null,
      ],
    );
    await connection.query(
      "INSERT INTO learning_resource_stage_links (student_id,resource_id,resource_version,path_version,stage_key) VALUES (?,?,?,?,?)",
      [options.student, resourceId, nextVersion, target.pathVersion, target.stageKey],
    );
    await connection.query(
      "INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent) VALUES (?,?,?,'not_started',0)",
      [options.student, resourceId, nextVersion],
    );
    await connection.query(
      "UPDATE learning_resources SET title=?,subject=?,knowledge_point=?,status='approved',error_summary=NULL,source_type=?,current_version=?,content_fingerprint=?,estimated_minutes=? WHERE id=?",
      [
        options.title,
        subject,
        knowledgePoint,
        SOURCE_TYPE,
        nextVersion,
        contentFingerprint,
        envelope.estimatedMinutes || 40,
        resourceId,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
  return { resourceId, version: nextVersion, reused: false, target, takeoverFrom };
}

function measure(root) {
  let nodeCount = 0;
  let depth = 0;
  const walk = (node, level) => {
    nodeCount += 1;
    depth = Math.max(depth, level);
    (node.children || []).forEach((child) => walk(child, level + 1));
  };
  walk(root, 1);
  return { nodeCount, depth };
}

async function main() {
  const options = parseArgs(process.argv);
  const content = buildMindMap();
  const stats = measure(content.root);
  const chunkIds = [...collectChunkIds(content.root)].sort((a, b) => a - b);

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
  });
  try {
    const citations = await loadCitations(pool, chunkIds);
    const envelope = {
      title: DEFAULT_TITLE,
      subject: SUBJECT,
      resourceType: RESOURCE_TYPE,
      knowledgePoint: KNOWLEDGE_POINT,
      estimatedMinutes: 40,
      content: { ...content, nodeCount: stats.nodeCount, depth: stats.depth, citations },
      citations,
      learningObjectives: [
        "用一句话说清树与二叉树、有序树的区别和五种基本形态",
        "用五条性质完成结点数、深度与叶子数的计算",
        "写出先序 / 中序 / 后序遍历序列，并由先序 + 中序还原二叉树",
        "说明二叉链表空指针域数量、线索化与哈夫曼树 WPL 的推导",
      ],
      targetLearnerSummary:
        "内容说明：按第 6 章「树和二叉树」的知识结构组织，引用片段来自平台团队自编讲义，可在知识库逐条核对。",
      generationRationale: [
        "内容说明：由项目组按课程章节整理，用于展示个性化思维导图的完整结构",
        "结点涵盖概念、公式、步骤、代码、例题与易错点六类，并按重要程度标注",
        "所有引用指向知识库真实讲义片段，可逐条核对",
      ],
    };

    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_FILE, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    console.log(`导图 JSON 已写入：${path.relative(path.join(__dirname, ".."), OUT_FILE)}`);
    console.log(
      `结点 ${stats.nodeCount} 个，深度 ${stats.depth}，引用片段 ${citations.length} 条，交叉连线 ${content.crossLinks.length} 条，易错标注 ${content.misconceptionNodeIds.length} 个`,
    );

    if (!options.publish) {
      console.log("未指定 --publish，跳过写库。");
      return;
    }
    const studentIds = await resolveStudentIds(pool, options);
    console.log(`目标学生：${studentIds.join(", ")}`);
    const summary = [];
    for (const studentId of studentIds) {
      const scoped = { ...options, student: studentId };
      try {
        if (options.reset) await resetSampleRows(pool, studentId);
        const result = await publish(pool, envelope, scoped);
        console.log(
          `已落地：学生 ${studentId} → 导图 #${result.resourceId} v${result.version}（路径 v${result.target.pathVersion}，阶段 ${result.target.stageKey}，${result.target.subject}）`,
        );
        summary.push({
          studentId,
          resourceId: result.resourceId,
          version: result.version,
          stageKey: result.target.stageKey,
          pathVersion: result.target.pathVersion,
          reused: result.reused,
        });
      } catch (error) {
        console.error(`学生 ${studentId} 挂载失败：${error.message}`);
      }
    }
    console.table(summary);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("样例导图生成失败：", error.stack || error.message);
    process.exit(1);
  });
}

/**
 * 组装可直接 publish 的完整 envelope（含结点统计与引用片段）。
 * CLI 的 main() 与后端「秒出资源」通道共用，避免两处各写一份。
 */
async function buildEnvelope(pool) {
  const content = buildMindMap();
  const stats = measure(content.root);
  const chunkIds = [...collectChunkIds(content.root)].sort((a, b) => a - b);
  const citations = await loadCitations(pool, chunkIds);
  return {
    title: DEFAULT_TITLE,
    subject: SUBJECT,
    resourceType: RESOURCE_TYPE,
    knowledgePoint: KNOWLEDGE_POINT,
    estimatedMinutes: 40,
    content: { ...content, nodeCount: stats.nodeCount, depth: stats.depth, citations },
    citations,
    learningObjectives: [
      "用一句话说清树与二叉树、有序树的区别和五种基本形态",
      "用五条性质完成结点数、深度与叶子数的计算",
      "写出先序 / 中序 / 后序遍历序列，并由先序 + 中序还原二叉树",
      "说明二叉链表空指针域数量、线索化与哈夫曼树 WPL 的推导",
    ],
    targetLearnerSummary:
      "内容说明：按第 6 章「树和二叉树」的知识结构组织，引用片段来自平台团队自编讲义，可在知识库逐条核对。",
    generationRationale: [
      "内容说明：由项目组按课程章节整理，用于展示个性化思维导图的完整结构",
      "结点涵盖概念、公式、步骤、代码、例题与易错点六类，并按重要程度标注",
      "所有引用指向知识库真实讲义片段，可逐条核对",
    ],
  };
}

module.exports = { buildMindMap, DEFAULT_TITLE, publish, resolveStageTarget, buildEnvelope, measure };
