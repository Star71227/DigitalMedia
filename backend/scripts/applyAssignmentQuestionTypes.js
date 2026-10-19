/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 让作业支持「填空题 + 简答题」的数据库准备（幂等，可重复执行）
 * ---------------------------------------------------------------------------
 *   1. 放宽 quiz_attempt_answers 的答案列：填空答案是文本，不是 A-D 选项字母
 *   2. 放宽 question_bank.answer：填空题用 | 分隔多个可接受答案（如 "递增|升序"）
 *   3. 新建 assignment_open_questions / assignment_open_answers：
 *      简答题来自 open_question_bank，需要挂到作业上并保存学生作答
 *   4. 灌入数据结构填空题种子数据（question_type='fill_blank'）
 *
 * 填空题只进入「作业」链路：学生自测的抽题查询（questionBankService）写死了
 * question_type = 'single_choice'，所以新增填空题不会污染自测。
 *
 * 用法： node scripts/applyAssignmentQuestionTypes.js
 */
const path = require("path");
require("dotenv").config({
  path: [path.resolve(__dirname, "../../.env"), path.resolve(__dirname, "../.env")],
  quiet: true,
});
const { initDB } = require("../src/config/initDB");
const { pool } = require("../src/config/db");

// answer 字段用 | 分隔多个可接受答案；判分时会做归一化（去空格、转小写）
const FILL_BLANKS = [
  {
    questionId: "DS_FILL_001",
    chapter: "线性表",
    knowledgePoint: "顺序表",
    difficulty: "基础",
    stem: "在长度为 n 的顺序表中，等概率情况下插入一个元素，平均需要移动多少个元素？（用 n 表示）",
    answer: "n/2|n/2个",
    analysis: "插入位置等概率分布在 0~n 共 n+1 个位置，平均移动次数为 n/2。",
    hint: "分别考虑插在表头（移动 n 个）和插在表尾（移动 0 个）两种极端情况。",
  },
  {
    questionId: "DS_FILL_002",
    chapter: "树与二叉树",
    knowledgePoint: "二叉树性质",
    difficulty: "基础",
    stem: "一棵深度为 k 的二叉树最多有多少个结点？（用 k 表示）",
    answer: "2^k-1",
    analysis: "每层最多 2^(i-1) 个结点，等比数列求和得 2^k - 1。",
    hint: "第 i 层最多 2^(i-1) 个结点。",
  },
  {
    questionId: "DS_FILL_003",
    chapter: "树与二叉树",
    knowledgePoint: "二叉搜索树",
    difficulty: "基础",
    stem: "对一棵二叉搜索树进行中序遍历，得到的结点序列具有什么特点？",
    answer: "递增|升序|有序|递增有序",
    analysis: "中序遍历按「左-根-右」访问，二叉搜索树左小右大，因此输出递增序列。",
    hint: "想想左子树、根、右子树三者的大小关系。",
  },
  {
    questionId: "DS_FILL_004",
    chapter: "排序",
    knowledgePoint: "快速排序",
    difficulty: "综合",
    stem: "快速排序的平均时间复杂度是多少？（用大 O 记号表示）",
    answer: "O(nlogn)|O(n log n)|nlogn",
    analysis: "平均每次划分接近二分，递归深度 O(log n)，每层代价 O(n)，故 O(n log n)。",
    hint: "平均情况下划分比较均衡，递归深度是多少？",
  },
  {
    questionId: "DS_FILL_005",
    chapter: "栈与队列",
    knowledgePoint: "循环队列",
    difficulty: "综合",
    stem: "循环队列为区分队空与队满，常牺牲一个存储单元。设队头指针为 front、队尾指针为 rear、数组容量为 maxSize，则「队满」的判断条件中，(rear + 1) % maxSize 等于哪个变量？",
    answer: "front",
    analysis: "牺牲一个单元时，队满条件为 (rear + 1) % maxSize == front，队空条件为 front == rear。",
    hint: "队空是 front == rear，队满则要提前一格。",
  },
  {
    questionId: "DS_FILL_006",
    chapter: "树与二叉树",
    knowledgePoint: "完全二叉树",
    difficulty: "提高",
    stem: "具有 n 个结点的完全二叉树，其高度（根为第 1 层）用 n 表示是什么？下取整记作 ⌊⌋，log 以 2 为底。",
    answer: "⌊log2n⌋+1|log2n+1|floor(log2n)+1",
    analysis: "完全二叉树高度 h 满足 2^(h-1) ≤ n < 2^h，解得 h = ⌊log2 n⌋ + 1。",
    hint: "高度为 h 的完全二叉树结点数范围是多少？",
  },
];

async function main() {
  const initialized = await initDB();
  if (!initialized) throw new Error("数据库初始化失败");

  console.log("==> 1/4 放宽答案列");
  await pool.query(
    "ALTER TABLE quiz_attempt_answers MODIFY selected_answer VARCHAR(255) NOT NULL, MODIFY correct_answer VARCHAR(255) NOT NULL",
  );
  await pool.query("ALTER TABLE question_bank MODIFY answer VARCHAR(200) NULL");
  console.log("    quiz_attempt_answers.selected_answer / correct_answer -> VARCHAR(255)");
  console.log("    question_bank.answer -> VARCHAR(200)");

  console.log("==> 2/4 建简答题关联表");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignment_open_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assignment_id BIGINT UNSIGNED NOT NULL,
      open_question_id VARCHAR(120) NOT NULL,
      order_index INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_assignment_open_questions_assignment (assignment_id),
      KEY idx_assignment_open_questions_question (open_question_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignment_open_answers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      assignment_id BIGINT UNSIGNED NOT NULL,
      student_id INT NOT NULL,
      open_question_id VARCHAR(120) NOT NULL,
      answer_text TEXT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_assignment_open_answers (assignment_id, student_id, open_question_id),
      KEY idx_assignment_open_answers_student (student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log("    assignment_open_questions / assignment_open_answers 已就绪");

  console.log("==> 3/4 灌入填空题种子数据");
  for (const item of FILL_BLANKS) {
    await pool.query(
      `INSERT INTO question_bank
         (question_id, subject, chapter, knowledge_point, question_type, difficulty, stem, answer, analysis, hint, source, is_published)
       VALUES (?, '数据结构', ?, ?, 'fill_blank', ?, ?, ?, ?, ?, 'system_seed', 1)
       ON DUPLICATE KEY UPDATE
         subject = VALUES(subject), chapter = VALUES(chapter), knowledge_point = VALUES(knowledge_point),
         question_type = 'fill_blank', difficulty = VALUES(difficulty), stem = VALUES(stem),
         answer = VALUES(answer), analysis = VALUES(analysis), hint = VALUES(hint), is_published = 1`,
      [
        item.questionId,
        item.chapter,
        item.knowledgePoint,
        item.difficulty,
        item.stem,
        item.answer,
        item.analysis,
        item.hint,
      ],
    );
    console.log(`    ${item.questionId}  ${item.knowledgePoint}  答案=${item.answer}`);
  }

  console.log("==> 4/4 校验");
  const [[fillBlankCount]] = await pool.query(
    "SELECT COUNT(*) AS c FROM question_bank WHERE question_type = 'fill_blank' AND subject = '数据结构'",
  );
  const [[openCount]] = await pool.query(
    "SELECT COUNT(*) AS c FROM open_question_bank WHERE subject = '数据结构'",
  );
  console.log(`    数据结构填空题 ${fillBlankCount.c} 道 / 简答题 ${openCount.c} 道`);
  await pool.end();
}

main().catch((error) => {
  console.error("迁移失败:", error.message);
  process.exitCode = 1;
});
