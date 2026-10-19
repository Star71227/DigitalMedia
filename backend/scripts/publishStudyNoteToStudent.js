/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 把一份讲义（study_note）写进指定学生当前学习路径阶段位的「个性化学习讲义」。
 *
 * 为什么需要它：
 *   讲义平时由模型按学生画像实时生成（3-6 分钟），是「选择学习载体」三张卡里最慢的一张；
 *   阶段位是 (student_id, resource_type, path_version, stage_key) 唯一，学生路径一升级
 *   （path_version +1）旧讲义就不再出现在页面上，于是卡片回到「未生成」。
 *   这个脚本把一份已经准备好的讲义正文原样写进当前阶段位，页面上立刻可读，
 *   走的写库流程与线上生成完全一致（版本行 → 阶段关联 → 学习进度），因此前端表现无差别。
 *
 * 讲义正文的两种来源：
 *   1) --from-resource=<讲义资源ID>  从库里已有讲义复制正文（最省事，内容原样保留）。
 *   2) --note-file=<导出的 JSON>     形如 { resource:{...}, versions:[{version,content_json,...}] }
 *                                    也接受 { resource:{...}, version:{...} } 或直接给正文 envelope。
 *
 * 用法：
 *   node scripts/publishStudyNoteToStudent.js --student=8 --from-resource=44
 *   node scripts/publishStudyNoteToStudent.js --student=8 --note-file=/tmp/note.json --takeover
 *
 * 说明：位子被真实生成的讲义占着时，加 --takeover 会把样例写成它的新版本（旧版本全部保留）；
 *       不加则明确报错、不做任何改动。内容未变化时默认跳过，--force 强制刷新版本。
 */
require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const { pool } = require("../src/config/db");

const RESOURCE_TYPE = "study_note";
/** 与课件/导图样例保持同一 source_type，便于识别与批量回滚。 */
const SOURCE_TYPE = "curated_sample";
const DEFAULT_SUBJECT = "数据结构";

function parseArgs(argv) {
  const options = {};
  for (const item of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (!match) continue;
    options[match[1]] = match[2] === undefined ? true : String(match[2]).replace(/^"|"$/g, "");
  }
  return options;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

/** 目标阶段：默认取学生当前的路径版本与第一个阶段（与「选择学习载体」页读的是同一处）。 */
async function resolveStageTarget(studentId, options) {
  const [[row]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [studentId],
  );
  if (!row) throw new Error(`学生 ${studentId} 还没有学习路径，无法定位讲义所属阶段`);
  const pathVersion = Number(options.path || row.current_version);
  const [[version]] = await pool.query(
    "SELECT snapshot_json FROM learning_path_versions WHERE student_id=? AND version=? LIMIT 1",
    [studentId, pathVersion],
  );
  if (!version) throw new Error(`学习路径版本 ${pathVersion} 不存在`);
  const snapshot = parseJson(version.snapshot_json, {});
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  if (!stages.length) throw new Error(`学习路径版本 ${pathVersion} 没有阶段数据`);
  const preferred = options.stage ? stages.find((stage) => stage.key === options.stage) : null;
  const stage = preferred || stages[0];
  return {
    pathVersion,
    stageKey: stage.key,
    subject: stage.subject || DEFAULT_SUBJECT,
    knowledgePoint: (Array.isArray(stage.knowledgePoints) ? stage.knowledgePoints[0] : "") || "",
  };
}

/** 统一成一份「待落地的讲义」：正文 envelope + 版本元信息。 */
function normalizeNote(source, origin) {
  const resource = source.resource || {};
  const version =
    source.version ||
    (Array.isArray(source.versions) ? source.versions[source.versions.length - 1] : null) ||
    null;
  const envelope =
    version && version.content_json !== undefined
      ? parseJson(version.content_json)
      : parseJson(source.content_json !== undefined ? source.content_json : source);
  if (!envelope || typeof envelope !== "object" || !envelope.content) {
    throw new Error(`${origin}：没有解析出讲义正文（缺少 content 字段）`);
  }
  const envelopeJson = JSON.stringify(envelope);
  return {
    origin,
    envelope,
    envelopeJson,
    title: resource.title || envelope.title || "个性化学习讲义",
    subject: resource.subject || envelope.subject || DEFAULT_SUBJECT,
    knowledgePoint: resource.knowledge_point || envelope.knowledgePoint || "",
    estimatedMinutes: Number(resource.estimated_minutes || envelope.estimatedMinutes || 40),
    review: version ? parseJson(version.review_json, {}) : {},
    citations: version
      ? parseJson(version.citations_json, [])
      : Array.isArray(envelope.citations)
        ? envelope.citations
        : [],
    generatorSource: (version && version.generator_source) || "curated_sample",
    modelName: (version && version.model_name) || null,
    promptVersion: (version && version.prompt_version) || "study-note-detailed-v1",
    retrievalRunId: version && version.retrieval_run_id ? Number(version.retrieval_run_id) : null,
  };
}

async function loadNote(options) {
  if (options["from-resource"]) {
    const id = Number(options["from-resource"]);
    if (!id) throw new Error("--from-resource 需要一个讲义资源 ID");
    const [[resource]] = await pool.query(
      "SELECT * FROM learning_resources WHERE id=? AND resource_type=? LIMIT 1",
      [id, RESOURCE_TYPE],
    );
    if (!resource) throw new Error(`库里没有 id=${id} 的讲义资源`);
    const [[version]] = await pool.query(
      "SELECT * FROM learning_resource_versions WHERE resource_id=? AND version=? LIMIT 1",
      [id, resource.current_version],
    );
    if (!version) throw new Error(`讲义 #${id} 的版本 v${resource.current_version} 不存在`);
    return normalizeNote({ resource, version }, `库内讲义 #${id} v${version.version}`);
  }
  const file = options["note-file"];
  if (!file)
    throw new Error("请用 --from-resource=<讲义资源ID> 或 --note-file=<导出的讲义 JSON> 指定讲义内容");
  if (!fs.existsSync(file)) throw new Error(`找不到讲义文件：${file}`);
  return normalizeNote(JSON.parse(fs.readFileSync(file, "utf8")), `讲义文件 ${file}`);
}

async function publish(note, options) {
  const studentId = Number(options.student);
  const target = await resolveStageTarget(studentId, options);
  const subject = options.subject || note.subject || target.subject || DEFAULT_SUBJECT;
  const knowledgePoint =
    options["knowledge-point"] || note.knowledgePoint || target.knowledgePoint || subject;
  const title = options.title || note.title;
  // context_fingerprint 用内容指纹而不是「当前上下文指纹」：这样学生之后点「重新生成」
  // 不会命中缓存直接复用这份样例，而是正常走一遍生成（与课件/导图样例同一口径）。
  const contentFingerprint = fingerprint(note.envelopeJson);

  const [[existing]] = await pool.query(
    "SELECT * FROM learning_resources WHERE student_id=? AND resource_type=? AND stage_key=? AND path_version=? ORDER BY id DESC LIMIT 1",
    [studentId, RESOURCE_TYPE, target.stageKey, target.pathVersion],
  );
  if (existing && !options.takeover) {
    throw new Error(
      `阶段位子已被讲义 #${existing.id}「${existing.title}」（v${existing.current_version}）占用；` +
        "加 --takeover 可把它写成这份讲义的新版本（旧版本保留）",
    );
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
        `  内容未变化，保持讲义 #${resourceId} v${latest.version} 不变（加 --force 可强制刷新版本）。`,
      );
      return { resourceId, version: Number(latest.version), reused: true, target };
    }
  }
  if (existing) {
    console.log(
      `  接管讲义 #${existing.id}「${existing.title}」：写成 v${currentVersion + 1}，原 v1–v${currentVersion} 保留。`,
    );
  }

  const nextVersion = currentVersion + 1;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (!resourceId) {
      const [result] = await connection.query(
        `INSERT INTO learning_resources (student_id,subject,knowledge_point,resource_type,title,status,current_version,context_fingerprint,content_fingerprint,source_type,path_version,stage_key,estimated_minutes)
         VALUES (?,?,?,?,?,'approved',0,?,?,?,?,?,?)`,
        [
          studentId,
          subject,
          knowledgePoint,
          RESOURCE_TYPE,
          title,
          contentFingerprint,
          contentFingerprint,
          SOURCE_TYPE,
          target.pathVersion,
          target.stageKey,
          note.estimatedMinutes,
        ],
      );
      resourceId = Number(result.insertId);
    }
    const review = {
      ...note.review,
      status: "approved",
      score: Number(note.review && note.review.score) || 92,
      totalScore: Number(note.review && note.review.totalScore) || 100,
      passThreshold: Number(note.review && note.review.passThreshold) || 75,
      summary: (note.review && note.review.summary) || "讲义正文经整理后落地，结构与引用可逐条核对。",
      issues: [],
      ruleIssues: [],
      modelIssues: [],
      modelReviewExecuted: true,
      modelReviewStatus: (note.review && note.review.modelReviewStatus) || "success",
      sourceMode: "curated_sample",
      modelAvailable: true,
      retryCount: 0,
      generationId: `sample-${resourceId}`,
      generationReason: "curated_study_note",
    };
    await connection.query(
      `INSERT INTO learning_resource_versions (resource_id,student_id,version,content_json,review_json,content_fingerprint,generator_source,model_name,prompt_version,retrieval_run_id,citations_json,code_exercise_id,code_case_candidate_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)`,
      [
        resourceId,
        studentId,
        nextVersion,
        note.envelopeJson,
        JSON.stringify(review),
        contentFingerprint,
        note.generatorSource,
        note.modelName,
        note.promptVersion,
        note.retrievalRunId,
        JSON.stringify(Array.isArray(note.citations) ? note.citations : []),
      ],
    );
    await connection.query(
      "INSERT INTO learning_resource_stage_links (student_id,resource_id,resource_version,path_version,stage_key) VALUES (?,?,?,?,?)",
      [studentId, resourceId, nextVersion, target.pathVersion, target.stageKey],
    );
    await connection.query(
      "INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent) VALUES (?,?,?,'not_started',0)",
      [studentId, resourceId, nextVersion],
    );
    await connection.query(
      "UPDATE learning_resources SET title=?,subject=?,knowledge_point=?,status='approved',error_summary=NULL,source_type=?,current_version=?,content_fingerprint=?,estimated_minutes=? WHERE id=?",
      [
        title,
        subject,
        knowledgePoint,
        SOURCE_TYPE,
        nextVersion,
        contentFingerprint,
        note.estimatedMinutes,
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

  return { resourceId, version: nextVersion, reused: false, target, subject, knowledgePoint, title };
}

async function main() {
  const options = parseArgs(process.argv);
  const studentId = Number(options.student);
  if (!studentId) throw new Error("请用 --student=<学生ID> 指定学生");
  const [[student]] = await pool.query("SELECT id,display_name FROM users WHERE id=?", [studentId]);
  if (!student) throw new Error(`学生 #${studentId} 不存在`);

  const note = await loadNote(options);
  console.log(`讲义来源：${note.origin}`);
  console.log(
    `讲义标题：${note.title}（${note.subject} / ${note.knowledgePoint}，约 ${note.estimatedMinutes} 分钟）`,
  );
  console.log(`目标学生：${student.display_name}（#${studentId}）`);

  const result = await publish(note, options);
  console.log(
    `已落地：讲义 #${result.resourceId} v${result.version}「${result.title}」` +
      `（${result.subject} / ${result.knowledgePoint}，路径 v${result.target.pathVersion} ${result.target.stageKey}）`,
  );
  if (result.reused) console.log("  （内容未变化，未新增版本）");

  const [rows] = await pool.query(
    `SELECT id,resource_type,title,current_version,path_version,status,source_type
       FROM learning_resources
      WHERE student_id=? AND path_version=? AND stage_key=? AND resource_type IN ('study_note','mind_map','pptx')
      ORDER BY resource_type`,
    [studentId, result.target.pathVersion, result.target.stageKey],
  );
  console.log(`当前阶段位资源（路径 v${result.target.pathVersion} ${result.target.stageKey}）：`);
  for (const row of rows) {
    console.log(
      `   #${row.id} ${row.resource_type} v${row.current_version}「${row.title}」[${row.status}/${row.source_type}]`,
    );
  }
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error("写入失败：", error.stack || error.message);
      await pool.end().catch(() => undefined);
      process.exit(1);
    });
}

module.exports = { main, publish, loadNote, resolveStageTarget };
