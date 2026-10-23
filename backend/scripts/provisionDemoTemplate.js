/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 把「演示统一模板」批量套到所有学生账号上（含没有学习路径的账号）。
 * 登录时也会自动补（见 authController），这个脚本用于一次性刷全部存量账号。
 *
 * 用法：
 *   node scripts/provisionDemoTemplate.js                 # 所有学生
 *   node scripts/provisionDemoTemplate.js --student=8     # 只看某个学生
 *   node scripts/provisionDemoTemplate.js --dry           # 只体检不写入
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const demoTemplate = require("../src/services/demoTemplateService");

function parseArgs(argv) {
  const options = {};
  for (const item of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (!match) continue;
    options[match[1]] = match[2] === undefined ? true : String(match[2]);
  }
  return options;
}

async function describe(studentId) {
  const [[pathRow]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [studentId],
  );
  const version = Number(pathRow?.current_version || 0);
  if (!version) return "（没有学习路径）";
  const [rows] = await pool.query(
    "SELECT resource_type FROM learning_resources WHERE student_id=? AND path_version=? AND status='approved'",
    [studentId, version],
  );
  const types = rows.map((row) => row.resource_type).sort();
  const label = { pptx: "课件", mind_map: "导图", study_note: "讲义" };
  return `路径v${version} · ${types.map((t) => label[t] || t).join("、") || "无资源"}`;
}

async function main() {
  const options = parseArgs(process.argv);
  const only = Number(options.student);
  const dry = Boolean(options.dry);

  const [users] = only
    ? await pool.query("SELECT id, username, display_name FROM users WHERE id=?", [only])
    : await pool.query("SELECT id, username, display_name FROM users WHERE role='STUDENT' ORDER BY id");

  console.log(`模板账号：#${demoTemplate.TEMPLATE_STUDENT_ID}`);
  const template = await demoTemplate.getTemplate();
  if (!template) throw new Error("模板账号没有学习路径，无法统一");
  console.log(
    `模板：路径v${template.version} 阶段=${template.stageKey} 讲义来源=#${template.noteResourceId}`,
  );

  let changed = 0;
  for (const user of users) {
    const before = await describe(user.id);
    if (dry) {
      console.log(`  #${user.id} ${user.display_name}：${before}`);
      continue;
    }
    const result = await demoTemplate.ensureStudent(user.id);
    const after = await describe(user.id);
    const touched = result?.pathChanged || (result?.created || []).length;
    if (touched) changed += 1;
    console.log(
      `  #${user.id} ${user.display_name}：${before}  ->  ${after}` +
        (touched
          ? `  [${result.pathChanged ? "路径已统一 " : ""}${(result.created || []).join(",") || "无新增"}]`
          : "  [已一致]"),
    );
  }

  console.log(`\n共 ${users.length} 个学生，${dry ? "（dry-run 未写入）" : `${changed} 个被补齐`}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error("统一模板失败：", error.stack || error.message);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
