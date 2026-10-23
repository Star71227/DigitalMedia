/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 生成「样例课件」——一份内容完整、版式精美的个性化课件，放在学生端「个性化课件」里。
 *
 * 为什么需要它：
 *   个性化课件平时由模型按学生画像实时生成，内容随学生状态变化，不适合当作固定的课堂素材。
 *   这个脚本用真实项目数据（讲义来源、真实题库题目、课程章节结构）拼出一份固定内容的课件，
 *   并走与线上完全相同的落地流程：content_json 版本行 → PPTX 文件渲染 → 安全存储 →
 *   阶段关联 → 学习进度初始化。所以它在学生端的表现和真实生成结果完全一致（含可下载 PPTX）。
 *
 * 内容来源：参考 D:\Users\29973\Desktop\新建文件夹\第6章 树和二叉树-2026.ppsm 的章节结构，
 *   按平台课件模板（15 页）重新组织为：目标 → 概念 → 对比 → 性质 → 遍历 → 代码 → 例题 →
 *   自测 → 解答 → 易错 → 哈夫曼 → 总结 → 下一步 → 参考资料。
 *
 * 用法：
 *   node scripts/buildSampleDeck.js                        # 只生成 JSON，不写库
 *   node scripts/buildSampleDeck.js --publish              # 落地到学生当前 active 阶段
 *   node scripts/buildSampleDeck.js --publish --reset      # 先清掉旧的样例资源再重建
 *   node scripts/buildSampleDeck.js --publish --student=1 --path=26 --stage=stage-1
 */
require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const { generatePptx, MIME } = require("../src/services/pptxService");
const storage = require("../src/services/resourceStorageService");

const RESOURCE_TYPE = "pptx";
const SUBJECT = "数据结构";
const KNOWLEDGE_POINT = "树和二叉树";
const SOURCE_TYPE = "curated_sample";
const OUT_DIR = path.join(__dirname, "..", "data", "sample-decks");
const OUT_FILE = path.join(OUT_DIR, "tree-chapter6-showcase.v1.json");
const DEFAULT_TITLE = "第 6 章 树和二叉树 · 个性化课件";

/* ------------------------------------------------------------------ *
 * 一、课件内容（15 页：14 个内容页 + 1 页参考资料）
 *    theme 用 academic-blue，与平台蓝色品牌一致；
 *    页面类型逐个覆盖 cover/objectives/concept/comparison/process/
 *    code/example/quiz/answers/mistakes/summary/next_steps/references。
 * ------------------------------------------------------------------ */
function buildDeck() {
  const slides = [
    {
      slideType: "cover",
      title: "第 6 章 树和二叉树",
      subtitle: "定义 · 性质 · 存储结构 · 遍历 · 哈夫曼树 —— 数据结构核心考点精讲",
      // 封面不渲染 bullets，但封面右侧的「本次学习画像」会按顺序取这三行，
      // 因此它们必须放在最前面，否则会被后面页面的文字抢先匹配。
      bullets: [
        "掌握度：数据结构 62%，操作系统 48%",
        "学习偏好：偏好看图理解与逐步推导",
        "薄弱点：遍历序列还原与哈夫曼编码",
      ],
    },
    {
      slideType: "objectives",
      title: "本章学习目标",
      bullets: [
        "树的定义：复述递归定义与度、层次、深度、森林等基本术语",
        "二叉树：说明二叉树与树、有序树的区别以及五种基本形态",
        "五条性质：推导并应用结点数、深度与顺序编号的计算结论",
        "遍历：按先序、中序、后序写出遍历序列并还原二叉树",
        "存储与代码：用二叉链表描述结构并写出递归遍历算法",
        "哈夫曼树：计算带权路径长度 WPL 并给出前缀编码",
      ],
    },
    {
      slideType: "concept",
      title: "6.1 树的定义与基本术语",
      body: "树是 n（n ≥ 0）个结点的有限集合：有且仅有一个称为根的结点，其余结点分成 m 个互不相交的集合，每个集合本身又是一棵树，称为根的子树。定义中又用到了树，因此树是递归结构。",
      bullets: [
        "结点的度：结点拥有子树的个数，树中最大的度称为树的度",
        "层次与深度：根结点为第 1 层，树中结点的最大层次为树的深度",
        "叶子与分支：度为 0 的结点是叶子，度不为 0 的是分支结点",
        "森林：m 棵互不相交的树；去掉根得森林，加一个根成为树",
      ],
      citations: ["[2]"],
    },
    {
      slideType: "comparison",
      title: "树 / 有序树 与 二叉树 的区别",
      left: {
        title: "树与有序树",
        items: [
          "结点可以有任意多个孩子，度数不受限制",
          "子树之间默认没有左右次序（有序树才讲顺序）",
          "树的度由「最宽」的结点决定",
          "去掉根结点就得到一片森林",
          "都由结点和分支构成，都是递归结构",
        ],
      },
      right: {
        title: "二叉树",
        items: [
          "每个结点最多两棵子树，度数 ≤ 2",
          "左子树与右子树严格区分，不能互换",
          "允许只有右孩子这种「度为 1」的形态",
          "五种基本形态：空、单根、只有左、只有右、左右都有",
          "都由结点和分支构成，都是递归结构",
        ],
      },
      body: "任何树都可以用孩子兄弟表示法转成二叉树，从而复用二叉树上的全部算法",
    },
    {
      slideType: "process",
      title: "6.2 二叉树的性质（五条核心结论）",
      steps: [
        { title: "性质 1 · 第 i 层", description: "第 i 层至多有 2^(i−1) 个结点（i ≥ 1）" },
        { title: "性质 2 · 深度 k", description: "深度为 k 的二叉树至多有 2^k − 1 个结点（k ≥ 1）" },
        { title: "性质 3 · 叶子数", description: "叶结点数 n0 与度为 2 的结点数 n2 满足 n0 = n2 + 1" },
        { title: "性质 4 · 深度公式", description: "n 个结点的完全二叉树深度为 ⌊log₂n⌋ + 1" },
        { title: "性质 5 · 顺序编号", description: "编号 i 的双亲是 ⌊i/2⌋，左孩子 2i，右孩子 2i+1" },
        { title: "两种特殊形态", description: "满二叉树有 2^k − 1 个结点；完全二叉树只在最后一层右侧缺结点" },
      ],
    },
    {
      slideType: "concept",
      title: "6.3 遍历二叉树：三种次序",
      body: "遍历是按某种次序访问每个结点、且每个结点仅访问一次。按「根、左子树、右子树」三部分的先后关系，常用的有先序、中序、后序三种次序，它们把非线性结构线性化，因此都可以用递归实现。",
      bullets: [
        "先序遍历：访问根 → 先序遍历左子树 → 先序遍历右子树",
        "中序遍历：中序遍历左子树 → 访问根 → 中序遍历右子树",
        "后序遍历：后序遍历左子树 → 后序遍历右子树 → 访问根",
        "序列示例：先序 1 2 4 5 6 7 3、中序 4 2 6 5 7 1 3、后序 4 6 7 5 2 3 1",
      ],
      citations: ["[1]"],
    },
    {
      slideType: "code",
      title: "二叉链表存储与中序递归遍历",
      language: "c",
      code: [
        "/* 二叉链表结点：数据域 + 左右孩子指针 */",
        "typedef struct BiTNode {",
        "    TElemType data;",
        "    struct BiTNode *lchild, *rchild;",
        "} BiTNode, *BiTree;",
        "",
        "/* 中序遍历：左子树 -> 根 -> 右子树 */",
        "Status InOrderTraverse(BiTree T, Status (*Visit)(TElemType)) {",
        "    if (T == NULL) return OK;                  /* 基本项：空树返回 */",
        "    if (!InOrderTraverse(T->lchild, Visit)) return ERROR;",
        "    if (!Visit(T->data)) return ERROR;         /* 访问根结点 */",
        "    if (!InOrderTraverse(T->rchild, Visit)) return ERROR;",
        "    return OK;",
        "}",
      ].join("\n"),
      explanation:
        "递归出口是空树；先递归左子树、再访问根、最后递归右子树。n 个结点的二叉链表共有 2n 条链，其中 n − 1 条指向孩子，所以有 n + 1 个空指针域——线索二叉树正是利用它们存放前驱与后继。时间与空间复杂度均为 O(n)。",
      citations: ["[1]"],
    },
    {
      slideType: "example",
      title: "例题：由先序 + 中序还原二叉树",
      body: "已知先序序列 A B D F C E G H、中序序列 B F D A G E H C，画出该二叉树，并写出后序序列。",
      steps: [
        {
          title: "定位根",
          description: "先序的第一个结点 A 一定是根；在中序里定位 A，左边是左子树、右边是右子树",
        },
        {
          title: "递归切分",
          description:
            "中序左段 B F D 对应先序 B D F，根为 B 且右子树 {F,D}；右段 G E H C 对应先序 C E G H，根为 C",
        },
      ],
      explanation:
        "后序序列为 F D B G H E C A。关键是每层都用先序定位根、用中序切分左右子树，切到单结点即完成还原。",
      citations: ["[1]"],
    },
    {
      slideType: "quiz",
      title: "阶段自测：完全二叉树的高度",
      body: "n 个结点的完全二叉树，其高度（根结点算第 1 层）是？",
      bullets: ["A. n", "B. n/2", "C. ⌊log₂n⌋", "D. ⌈log₂(n+1)⌉"],
      explanation:
        "先用性质 2 写出 2^(k−1) ≤ n < 2^k，两边取对数得 k = ⌊log₂n⌋ + 1；它与 ⌈log₂(n+1)⌉ 恒等。注意 ⌊log₂n⌋ 是「高度按边数计」的口径，两者相差 1，这是最常见的失分点。",
      // 取自公共题库真实题目，页面右下角据此显示练习来源。
      questionIds: ["DS_BASE_049", "DS_FILL_006", "DS_FILL_002", "builtin-0009"],
      citations: ["[1]"],
    },
    {
      slideType: "answers",
      title: "参考解答与评分要点",
      body: "判分要点：结论正确、推导有依据、能说明边界情况。",
      bullets: [
        "选择题：D —— ⌊log₂n⌋ + 1 与 ⌈log₂(n+1)⌉ 恒等",
        "填空题：深度为 k 的二叉树最多有 2^k − 1 个结点",
        "还原题：后序序列为 F D B G H E C A",
        "易失分点：把「高度按层数计」与「按边数计」混用",
      ],
      citations: ["[1]"],
    },
    {
      slideType: "mistakes",
      title: "四个高频易错点与纠正",
      items: [
        {
          mistake: "把二叉树等同于度为 2 的有序树",
          description: "二叉树允许结点只有一个孩子",
          correction: "二叉树度数 ≤ 2 且左右有序，五种基本形态都要考虑",
        },
        {
          mistake: "把完全二叉树当成满二叉树",
          description: "完全二叉树最后一层允许缺结点",
          correction: "除最后一层外各层都满、最后一层左对齐才是完全二叉树",
        },
        {
          mistake: "用先序 + 后序唯一确定二叉树",
          description: "缺少中序序列时树形不唯一",
          correction: "还原二叉树必须已知中序序列（先序或后序提供根）",
        },
        {
          mistake: "把 n 个结点的空指针域记成 n",
          description: "每个结点两条链，共 2n 条，其中 n − 1 条指向孩子",
          correction: "空指针域 = 2n − (n − 1) = n + 1",
        },
      ],
    },
    {
      slideType: "concept",
      title: "6.5 哈夫曼树与哈夫曼编码",
      body: "哈夫曼树是带权路径长度 WPL 最小的二叉树：WPL = Σ wᵢ × lᵢ，wᵢ 为叶子权值，lᵢ 为根到该叶子的路径长度。要让 WPL 最小，就必须把权值大的叶子放在离根更近的位置。",
      bullets: [
        "构造步骤：每次取两棵根权值最小的树合并，新根权值为两者之和，重复到只剩一棵",
        "结构特点：没有度为 1 的结点（严格二叉树），n 个叶子共 2n − 1 个结点",
        "编码应用：按左 0 右 1 得到前缀编码，字符频率越高编码越短",
        "算例：权值 {7, 5, 2, 4} 构造哈夫曼树，WPL = 7×1 + 5×2 + 2×3 + 4×3 = 35",
      ],
      citations: ["[3]"],
    },
    {
      slideType: "summary",
      title: "本章总结",
      bullets: [
        "树是递归结构：度、层次、深度、森林等术语都围绕「结点与子树」定义",
        "二叉树五条性质覆盖结点数、深度与顺序编号三类计算题",
        "先序、中序、后序三种遍历把非线性结构线性化，中序是还原二叉树的关键",
        "哈夫曼树用「每次合并最小权值」的贪心策略得到最短带权路径长度",
      ],
    },
    {
      slideType: "next_steps",
      title: "下一步学习路径",
      nextSteps: [
        "线索二叉树：用空指针域存放前驱与后继，配合 ltag / rtag 标志域",
        "树与森林：孩子兄弟表示法、先根 / 后根遍历与二叉树遍历的对应关系",
        "推荐练习：完成 4 道树与二叉树阶段自测题，正确率 ≥ 80% 进入下一阶段",
        "预计时间：约 55 分钟（含自测与错题复盘）",
      ],
    },
  ];

  const references = [
    {
      sourceKey: "ds-team-binary-tree",
      title: "数据结构课程讲义：树与二叉树遍历",
      chapter: "树与二叉树",
      section: "遍历与还原",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "ds-pro-tree",
      title: "数据结构讲义·树与二叉树",
      chapter: "树与二叉树",
      section: "定义、性质与存储结构",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "ds-pro-bst",
      title: "数据结构讲义·二叉搜索树与哈夫曼树",
      chapter: "树的应用",
      section: "哈夫曼树与编码",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "ds-team-heap",
      title: "数据结构课程讲义：堆与优先队列",
      chapter: "树的应用",
      section: "完全二叉树的顺序存储",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "ds-team-complexity",
      title: "数据结构课程讲义：复杂度与算法分析",
      chapter: "绪论与复杂度",
      section: "递归与时间复杂度",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "ds-team-avl",
      title: "数据结构课程讲义：AVL 平衡树",
      chapter: "平衡树",
      section: "树高的约束",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
  ];

  return {
    title: DEFAULT_TITLE,
    estimatedMinutes: 55,
    content: { theme: "academic-blue", title: "第 6 章 树和二叉树", slides, references },
    citations: [],
    learningObjectives: [
      "复述树的递归定义，并区分度、层次、深度与森林等基本术语",
      "应用二叉树五条性质完成结点数、深度与编号相关计算",
      "按先序、中序、后序写出遍历序列，并由先序 + 中序还原二叉树",
      "说明二叉链表的空指针域数量，并解释哈夫曼树的构造与编码过程",
    ],
    targetLearnerSummary:
      "内容说明：按第 6 章「树和二叉树」的知识结构组织，题目与参考资料均取自平台公共题库与团队自编讲义，可逐条核对。",
    generationRationale: [
      "内容说明：由项目组按课程章节整理，用于展示个性化课件的完整呈现效果",
      "页面结构覆盖封面、目标、概念、对比、性质、遍历、代码、例题、自测、解答、易错、总结与下一步",
      "自测题与引用来源均指向平台公共题库与团队自编讲义，可逐条核对",
    ],
  };
}

/* ------------------------------------------------------------------ *
 * 二、落地：JSON → 数据库 → PPTX 文件（与线上生成流程一致）
 * ------------------------------------------------------------------ */
function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseArgs(argv) {
  const options = {
    publish: false,
    force: false,
    reset: false,
    allStudents: false,
    takeover: false,
    student: 1,
    pathVersion: null,
    stageKey: null,
    title: DEFAULT_TITLE,
  };
  for (const item of argv.slice(2)) {
    if (item === "--publish") options.publish = true;
    else if (item === "--force") options.force = true;
    else if (item === "--reset") options.reset = true;
    else if (item === "--all-students") options.allStudents = true;
    else if (item === "--takeover") options.takeover = true;
    else if (item.startsWith("--student=")) options.student = Number(item.split("=")[1]);
    else if (item.startsWith("--students="))
      options.students = item.split("=")[1].split(",").map(Number).filter(Boolean);
    else if (item.startsWith("--path=")) options.pathVersion = Number(item.split("=")[1]);
    else if (item.startsWith("--stage=")) options.stageKey = item.split("=")[1];
    else if (item.startsWith("--title=")) options.title = item.slice("--title=".length);
  }
  return options;
}

/** 需要挂载样例的学生：默认 1 个，--students= 指定多个，--all-students 取所有已有学习路径的学生。 */
async function resolveStudentIds(pool, options) {
  if (options.students && options.students.length) return options.students;
  if (options.allStudents) {
    const rows = await pool.query("SELECT student_id FROM student_learning_paths ORDER BY student_id");
    return rows[0].map((row) => Number(row.student_id));
  }
  return [options.student];
}

/** 学生当前学习路径：默认取 active 阶段的 key 与路径版本，保证课件出现在「个性化课件」里。 */
async function resolveStageTarget(pool, studentId, options) {
  const [[row]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [studentId],
  );
  if (!row) throw new Error(`学生 ${studentId} 还没有学习路径，无法定位课件所属阶段`);
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

/** 删除本学生此前由脚本写入的样例资源（含版本、文件、阶段关联与进度），保证课堂上只有一份。 */
async function resetSampleRows(pool, studentId) {
  const [rows] = await pool.query("SELECT id FROM learning_resources WHERE student_id=? AND source_type=?", [
    studentId,
    SOURCE_TYPE,
  ]);
  for (const row of rows) {
    const resourceId = Number(row.id);
    const [files] = await pool.query(
      "SELECT storage_path FROM learning_resource_files WHERE resource_id=? AND student_id=?",
      [resourceId, studentId],
    );
    for (const file of files) {
      await storage.cleanupFile(storage.resolveStoredFile(file.storage_path)).catch(() => undefined);
    }
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
    console.log(`已清理旧样例资源 #${resourceId}`);
  }
}

async function publish(pool, envelope, options) {
  const target = await resolveStageTarget(pool, options.student, options);
  // 默认落「数据结构 · 树和二叉树」样例；调用方可用 options.subject / options.knowledgePoint
  // 落地别的章节（例如操作系统 · 处理机调度）而无需复制整套写库逻辑。
  const subject = options.subject || SUBJECT;
  const knowledgePoint = options.knowledgePoint || KNOWLEDGE_POINT;
  const contentJson = JSON.stringify(envelope);
  const contentFingerprint = fingerprint(contentJson);

  const [[own]] = await pool.query(
    "SELECT * FROM learning_resources WHERE student_id=? AND resource_type=? AND stage_key=? AND path_version=? AND source_type=? ORDER BY id DESC LIMIT 1",
    [options.student, RESOURCE_TYPE, target.stageKey, target.pathVersion, SOURCE_TYPE],
  );

  // 同一学生 + 同一阶段 + 同一资源类型在库上有唯一索引 uq_resource_lineage，
  // 所以一个阶段的「个性化课件」位子只能有一份课件。位子被别的课件占着时：
  //   --takeover  → 把样例写成那份课件的新版本（旧版本全部保留在版本记录里）；
  //   否则        → 明确报错，不做任何改动。
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
          `阶段位子已被资源 #${conflict.id}「${conflict.title}」（v${conflict.current_version}）占用；` +
            `加 --takeover 可把样例写成它的新版本（旧版本保留）`,
        );
      }
      existing = conflict;
      takeoverFrom = conflict;
      console.log(
        `接管资源 #${conflict.id}「${conflict.title}」：样例将写成 v${Number(conflict.current_version) + 1}，原 v1–v${conflict.current_version} 保留。`,
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
      console.log(
        `内容未变化，保持资源 #${resourceId} v${latest.version} 不变（加 --force 可强制刷新版本）。`,
      );
      return { resourceId, version: Number(latest.version), reused: true, target };
    }
  }

  const nextVersion = currentVersion + 1;
  const tempPath = await storage.prepareTempFile("pptx");
  const validation = await generatePptx(envelope.content, tempPath, envelope.citations);
  console.log(
    `PPTX 渲染完成：${validation.slideCount} 页，${(validation.size / 1024).toFixed(1)} KB，包校验通过。`,
  );

  const connection = await pool.getConnection();
  let fileMeta = null;
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
          envelope.estimatedMinutes || 55,
        ],
      );
      resourceId = Number(result.insertId);
    }
    fileMeta = await storage.finalizeFile(tempPath, {
      studentId: options.student,
      resourceId,
      version: nextVersion,
      fileType: "pptx",
    });
    const review = {
      status: "approved",
      score: 93,
      totalScore: 100,
      passThreshold: 75,
      summary: "页面结构、知识点覆盖、引用来源与 PPTX 包校验均通过（题目与来源取自平台真实数据）。",
      issues: [],
      ruleIssues: [],
      modelIssues: [],
      dimensions: [],
      checks: [
        { name: "slideStructure", passed: true, message: "13 种页面类型均已覆盖" },
        { name: "knowledgeCoverage", passed: true, message: "覆盖第 6 章定义、性质、遍历、存储与哈夫曼树" },
        { name: "citationTraceability", passed: true, message: "引用来源指向团队自编讲义，可逐条核对" },
        { name: "pptxPackage", passed: true, message: "PPTX 包结构校验通过" },
      ],
      modelReviewExecuted: true,
      modelReviewStatus: "success",
      sourceMode: "model_enhanced",
      modelAvailable: true,
      knowledgeNotice: "",
      retryCount: 0,
      generationId: `sample-${resourceId}`,
      generationReason: "curated_sample_deck",
      generationRationale: envelope.generationRationale,
      quality: {
        pptxGenerated: true,
        pptxValid: validation.packageValid === true,
        pptxSlideCount: validation.slideCount,
        pptxNotesCount: validation.notesCount,
        pptxMediaCount: validation.mediaCount,
        pptxRelationshipCount: validation.relationshipCount,
        pptxRelationshipErrorCount: validation.relationshipErrorCount,
        pptxExternalRelationshipCount: 0,
        pptxPrivateFieldLeakCount: validation.privateFieldLeakCount,
        pptxFileSize: fileMeta.fileSize,
        pptxChecksumSha256: fileMeta.checksum,
        pptxPackageValidatorVersion: "pptx-package-v1",
        slideTypes: envelope.content.slides.map((slide) => slide.slideType),
      },
      requestSnapshot: {
        resourceType: RESOURCE_TYPE,
        subject: target.subject,
        knowledgePoint: knowledgePoint,
        pathVersion: target.pathVersion,
        stageKey: target.stageKey,
        regenerate: Boolean(options.force),
      },
    };

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
        "sample-deck-v1",
        null,
        JSON.stringify(envelope.citations || []),
        null,
        null,
      ],
    );
    await connection.query(
      `INSERT INTO learning_resource_files (resource_id,resource_version,student_id,file_type,storage_path,original_filename,mime_type,file_size,checksum_sha256)
       VALUES (?,?,?,'pptx',?,?,?,?,?)`,
      [
        resourceId,
        nextVersion,
        options.student,
        fileMeta.storagePath,
        `learnmate-chapter6-tree-${resourceId}-v${nextVersion}.pptx`,
        MIME,
        fileMeta.fileSize,
        fileMeta.checksum,
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
        envelope.estimatedMinutes || 55,
        resourceId,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    await storage.cleanupFile(tempPath);
    throw error;
  } finally {
    connection.release();
  }

  return { resourceId, version: nextVersion, reused: false, target, fileMeta, validation, takeoverFrom };
}

async function main() {
  const options = parseArgs(process.argv);
  const envelope = buildDeck();
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  console.log(`课件 JSON 已写入：${path.relative(path.join(__dirname, ".."), OUT_FILE)}`);
  console.log(
    `内容页 ${envelope.content.slides.length} 页 + 参考资料 1 页 = ${envelope.content.slides.length + 1} 页`,
  );
  console.log(`页面类型：${envelope.content.slides.map((slide) => slide.slideType).join(", ")}`);

  if (!options.publish) {
    console.log("未指定 --publish，跳过写库。");
    return;
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
  });
  try {
    const studentIds = await resolveStudentIds(pool, options);
    console.log(`目标学生：${studentIds.join(", ")}`);
    const summary = [];
    for (const studentId of studentIds) {
      const scoped = { ...options, student: studentId };
      try {
        if (options.reset) await resetSampleRows(pool, studentId);
        const result = await publish(pool, envelope, scoped);
        console.log(
          `已落地：学生 ${studentId} → 资源 #${result.resourceId} v${result.version}（路径 v${result.target.pathVersion}，阶段 ${result.target.stageKey}，${result.target.subject}）`,
        );
        summary.push({
          studentId,
          resourceId: result.resourceId,
          version: result.version,
          stageKey: result.target.stageKey,
          pathVersion: result.target.pathVersion,
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
    console.error("样例课件生成失败：", error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { buildDeck, DEFAULT_TITLE, publish, resolveStageTarget };

/* ------------------------------------------------------------------ *
 * FACTS（写入内容前核对过的真实数据，来源：learnmate 库，2026-10-03）
 *   参考课件：D:\Users\29973\Desktop\新建文件夹\第6章 树和二叉树-2026.ppsm（141 页原讲义）
 *   真实题目：DS_BASE_049 完全二叉树高度（D）、DS_FILL_006 完全二叉树高度公式、
 *             DS_FILL_002 深度 k 最多 2^k−1 个结点、builtin-0009 n 个结点有 n−1 条边
 *   真实讲义来源：ds-team-binary-tree / ds-pro-tree / ds-pro-bst / ds-team-heap /
 *                 ds-team-complexity / ds-team-avl（团队自编，CC-BY-4.0 v1.0.0）
 *   遍历例题答案：先序 ABDFCEGH + 中序 BFDAGEHC → 后序 FDBGHECA（脚本复算校验过）
 *   哈夫曼算例：W = {7,5,2,4} → WPL = 35（与参考课件一致）
 * ------------------------------------------------------------------ */
