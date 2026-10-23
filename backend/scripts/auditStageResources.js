/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 体检「学生当前路径阶段的资源三张卡」（课件 pptx / 导图 mind_map / 讲义 study_note）
 * ---------------------------------------------------------------------------
 * 为什么需要它：资源是挂在 (student_id, path_version, stage_key) 这个"阶段位"上的，
 * 而学生页面按当前 path_version 过滤。只要学习路径升一版，旧资源就不再命中，
 * 页面回到"未生成"——讲义尤其容易漏（课件/导图有样例通道会重新落地，讲义以前只返回旧 ID）。
 * 这个脚本把「当前阶段位缺哪张卡、而学生在别的版本上其实有」直接列出来，避免演示现场才发现。
 *
 * 用法：
 *   node scripts/auditStageResources.js                 # 全部有路径的学生
 *   node scripts/auditStageResources.js --student=8     # 只看某个学生
 *   node scripts/auditStageResources.js --student=8 --fix   # 顺手把讲义补到当前阶段位
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const studyNotePublisher = require("./publishStudyNoteToStudent");

const TYPES = ["pptx", "mind_map", "study_note"];
const TYPE_LABEL = { pptx: "课件", mind_map: "导图", study_note: "讲义" };

function parseArgs(argv) {
  const options = {};
  for (const item of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (!match) continue;
    options[match[1]] = match[2] === undefined ? true : String(match[2]);
  }
  return options;
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

async function stagesOf(studentId, pathVersion) {
  const [[row]] = await pool.query(
    "SELECT snapshot_json FROM learning_path_versions WHERE student_id=? AND version=? LIMIT 1",
    [studentId, pathVersion],
  );
  if (!row) return [];
  const snapshot = parseJson(row.snapshot_json, {});
  return Array.isArray(snapshot.stages) ? snapshot.stages : [];
}

async function auditStudent(studentId, options) {
  const [[pathRow]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [studentId],
  );
  if (!pathRow) return null;
  const pathVersion = Number(pathRow.current_version);
  const stages = await stagesOf(studentId, pathVersion);
  if (!stages.length) return null;

  const [atVersion] = await pool.query(
    `SELECT resource_type, COUNT(*) AS n FROM learning_resources
      WHERE student_id=? AND path_version=? AND status='approved' GROUP BY resource_type`,
    [studentId, pathVersion],
  );
  const present = new Set(atVersion.map((row) => row.resource_type));

  const [elsewhere] = await pool.query(
    `SELECT resource_type, MAX(path_version) AS newest FROM learning_resources
      WHERE student_id=? AND status='approved' GROUP BY resource_type`,
    [studentId],
  );
  const haveSomewhere = new Map(elsewhere.map((row) => [row.resource_type, Number(row.newest)]));

  const missing = [];
  const stale = [];
  for (const type of TYPES) {
    if (present.has(type)) continue;
    if (haveSomewhere.has(type)) stale.push({ type, lastName: haveSomewhere.get(type) });
    else missing.push(type);
  }

  const result = {
    studentId,
    pathVersion,
    stageKeys: stages.map((stage) => stage.key),
    present: [...present],
    stale,
    missing,
  };

  if (options.fix && stale.some((item) => item.type === "study_note")) {
    result.fixResult = await fixStudyNote(studentId, pathVersion, stages[0]);
  }
  return result;
}

/** 把学生已有讲义补到当前路径版本的第一个阶段位上（与秒出通道同一条写库链路）。 */
async function fixStudyNote(studentId, pathVersion, stage) {
  const [[existing]] = await pool.query(
    `SELECT id FROM learning_resources WHERE student_id=? AND resource_type='study_note' AND status='approved'
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [studentId],
  );
  if (!existing) return "没有可复用的讲义";
  const note = await studyNotePublisher.loadNote({ "from-resource": existing.id });
  const result = await studyNotePublisher.publish(note, {
    student: studentId,
    path: pathVersion,
    stage: stage?.key,
    takeover: true,
    force: false,
    title: note.title,
  });
  return `讲义 #${result.resourceId} v${result.version} 已落到 路径v${pathVersion} ${result.target.stageKey}`;
}

async function main() {
  const options = parseArgs(process.argv);
  const studentId = Number(options.student);
  let ids;
  if (studentId) {
    ids = [studentId];
  } else {
    const [rows] = await pool.query("SELECT student_id FROM student_learning_paths ORDER BY student_id");
    ids = rows.map((row) => Number(row.student_id));
  }

  let problems = 0;
  for (const id of ids) {
    const result = await auditStudent(id, options);
    if (!result) continue;
    const flag = result.stale.length ? "缺卡(旧版本有)" : result.missing.length ? "缺卡(从未生成)" : "齐全";
    if (result.stale.length) problems += 1;
    console.log(
      `学生 #${result.studentId} 路径v${result.pathVersion} [${flag}] ` +
        `已有：${result.present.map((t) => TYPE_LABEL[t] || t).join("、") || "无"}` +
        (result.stale.length
          ? `｜当前版本缺：${result.stale.map((item) => `${TYPE_LABEL[item.type] || item.type}(最新在 v${item.lastName})`).join("、")}`
          : "") +
        (result.missing.length
          ? `｜从未生成：${result.missing.map((t) => TYPE_LABEL[t] || t).join("、")}`
          : ""),
    );
    if (result.fixResult) console.log(`   ↳ 修复：${result.fixResult}`);
  }

  console.log(`\n共检查 ${ids.length} 个学生，其中 ${problems} 个「当前阶段缺卡但旧版本有」（需要补）`);
  await pool.end();
  process.exit(problems ? 1 : 0);
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("体检失败：", error.stack || error.message);
    await pool.end().catch(() => undefined);
    process.exit(2);
  });
}

module.exports = { auditStudent, fixStudyNote };
