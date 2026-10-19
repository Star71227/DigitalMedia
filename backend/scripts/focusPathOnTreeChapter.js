/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 把某个学生的当前学习路径改成「数据结构」主线，并让当前节点停在树与二叉树。
 *
 * 用途：课堂演示时，学生的课件 / 思维导图 / 讲义都是第 6 章树与二叉树的样例，
 * 但路径如果还停在操作系统，页面就对不上。这个脚本把当前路径版本（默认就是 latest）
 * 的阶段改成数据结构主线：stage-1 = 树与二叉树（当前节点，未完成），后面依次是
 * 二叉树遍历 / 二叉搜索树 / 堆 / 图 / 排序算法，验收方式用平台真实题库里对应的题目。
 *
 * 用法：
 *   node scripts/focusPathOnTreeChapter.js --student=8
 *   node scripts/focusPathOnTreeChapter.js --username=2511310430 --dry
 *
 * 幂等：重复执行只会重写同一版本的快照，并在 data/path-backups/ 下留一份改动前快照。
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/config/db");

const PLAN = [
  {
    knowledgePoint: "树与二叉树",
    stageTitle: "树与二叉树",
    keywords: ["二叉树", "先序遍历", "树"],
    exclude: ["遍历", "搜索", "红黑"],
    minutes: 45,
  },
  {
    knowledgePoint: "二叉树遍历",
    stageTitle: "二叉树遍历",
    keywords: ["二叉树遍历", "遍历"],
    exclude: [],
    minutes: 45,
  },
  {
    knowledgePoint: "二叉搜索树",
    stageTitle: "二叉搜索树",
    keywords: ["二叉搜索树", "搜索"],
    exclude: ["红黑"],
    minutes: 40,
  },
  { knowledgePoint: "堆", stageTitle: "堆", keywords: ["堆", "哈夫曼"], exclude: [], minutes: 40 },
  {
    knowledgePoint: "图",
    stageTitle: "图",
    keywords: ["最小生成树", "图"],
    exclude: ["二叉树"],
    minutes: 50,
  },
  {
    knowledgePoint: "排序算法",
    stageTitle: "排序算法",
    keywords: ["排序", "查找"],
    exclude: [],
    minutes: 50,
  },
];

function parseArgs(argv) {
  const options = {};
  for (const item of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (!match) continue;
    options[match[1]] = match[2] === undefined ? true : match[2];
  }
  return options;
}

async function resolveStudent(options) {
  const id = Number(options.student);
  if (id) {
    const [[row]] = await pool.query("SELECT id,username,display_name FROM users WHERE id=?", [id]);
    return row;
  }
  if (options.username) {
    const [[row]] = await pool.query("SELECT id,username,display_name FROM users WHERE username=?", [
      String(options.username),
    ]);
    return row;
  }
  throw new Error("请用 --student=<id> 或 --username=<用户名> 指定学生");
}

/**
 * 按知识点关键字挑题目：优先「该学生还没答对过」的题，保证这个阶段不会一上来就显示已完成；
 * 其次按关键字命中顺序（先精确、后宽泛）补齐，最后兜底用数据结构任意已发布题。
 */
async function pickQuestions(item, studentId, limit = 3) {
  const exclude = (item.exclude || []).map(() => " AND knowledge_point NOT LIKE ?").join("");
  for (const keyword of item.keywords) {
    const [rows] = await pool.query(
      `SELECT q.question_id,
              (SELECT COUNT(*) FROM quiz_attempt_answers a JOIN quiz_attempts t ON t.id=a.attempt_id
                WHERE t.student_id=? AND a.question_id=q.question_id AND a.is_correct=1) answered_right
         FROM question_bank q
        WHERE q.subject='数据结构' AND q.is_published=1 AND q.owner_student_id IS NULL AND q.knowledge_point LIKE ?${exclude}
        ORDER BY answered_right ASC, q.difficulty ASC, q.question_id ASC
        LIMIT ?`,
      [studentId, `%${keyword}%`, ...(item.exclude || []).map((word) => `%${word}%`), limit],
    );
    if (rows.length) return rows.map((r) => r.question_id);
  }
  const [fallback] = await pool.query(
    `SELECT question_id FROM question_bank
      WHERE subject='数据结构' AND is_published=1 AND owner_student_id IS NULL
      ORDER BY question_id LIMIT ?`,
    [limit],
  );
  return fallback.map((r) => r.question_id);
}

async function main() {
  const options = parseArgs(process.argv);
  const dry = Boolean(options.dry);
  const student = await resolveStudent(options);
  if (!student) throw new Error("没有找到该学生");

  const [[pathRow]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=?",
    [student.id],
  );
  if (!pathRow) throw new Error(`学生 ${student.display_name} 还没有学习路径`);
  const version = Number(pathRow.current_version);
  const [[versionRow]] = await pool.query(
    "SELECT title,snapshot_json FROM learning_path_versions WHERE student_id=? AND version=?",
    [student.id, version],
  );
  if (!versionRow) throw new Error(`学习路径版本 ${version} 不存在`);
  const snapshot =
    typeof versionRow.snapshot_json === "string"
      ? JSON.parse(versionRow.snapshot_json)
      : versionRow.snapshot_json;

  console.log(`学生 ${student.display_name}（#${student.id}）当前路径 v${version}：「${versionRow.title}」`);
  for (const stage of snapshot.stages || [])
    console.log(`  旧：${stage.key} ${stage.subject} / ${(stage.knowledgePoints || []).join("、")}`);

  const stages = [];
  for (const [index, item] of PLAN.entries()) {
    const ids = await pickQuestions(item, student.id);
    stages.push({
      key: `stage-${index + 1}`,
      title: `${index + 1}. ${item.stageTitle} · 针对性测验`,
      subject: "数据结构",
      durationMinutes: item.minutes,
      goals: [
        "个性化依据：当前掌握度偏低，按薄弱度排序优先突破",
        `本阶段行动：完成 ${ids.length} 道已审核测验题`,
        `验收目标：能解释${item.knowledgePoint}的条件、过程与边界`,
        index === PLAN.length - 1 ? "完成后回到学习报告复盘本周期表现" : "完成后再进入下一阶段",
      ],
      knowledgePoints: [item.knowledgePoint],
      questionIds: ids,
      codeExerciseIds: [],
      completion: { type: "quiz", ids },
      dependsOn: index === 0 ? [] : [`stage-${index}`],
    });
  }
  const nextSnapshot = { ...snapshot, title: "先攻克树与二叉树的个性化学习路径", stages };
  const nextTitle = "先攻克树与二叉树的个性化学习路径";

  if (dry) {
    console.log("\n[预演] 新阶段：");
    for (const stage of stages)
      console.log(
        `  ${stage.key} ${stage.subject} / ${stage.knowledgePoints.join("、")} · 验收 ${stage.completion.type}(${stage.completion.ids.join(",")})`,
      );
    await pool.end();
    return;
  }

  const backupDir = path.join(__dirname, "..", "data", "path-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `student-${student.id}-v${version}-before-tree-focus.json`);
  fs.writeFileSync(backupFile, `${JSON.stringify({ title: versionRow.title, snapshot }, null, 2)}\n`, "utf8");
  console.log(`已备份旧快照：${path.relative(path.join(__dirname, ".."), backupFile)}`);

  await pool.query(
    "UPDATE learning_path_versions SET title=?, snapshot_json=?, change_reason=? WHERE student_id=? AND version=?",
    [nextTitle, JSON.stringify(nextSnapshot), "按第 6 章树与二叉树重新排定学习路径", student.id, version],
  );
  const [profileResult] = await pool.query(
    "UPDATE student_profiles SET current_course='数据结构' WHERE student_id=?",
    [student.id],
  );

  console.log(`\n新阶段（路径 v${version}）：`);
  for (const stage of stages)
    console.log(
      `  ${stage.key} ${stage.subject} / ${stage.knowledgePoints.join("、")} · 验收 ${stage.completion.type}(${stage.completion.ids.join(",")})`,
    );
  console.log(`画像 current_course 更新：${profileResult.affectedRows} 行`);
  await pool.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("改路径失败：", error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
