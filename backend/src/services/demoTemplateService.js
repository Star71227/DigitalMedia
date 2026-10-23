/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 演示统一模板服务
 * ---------------------------------------------------------------------------
 * 目标：**任何学生账号**（包括现场临时注册的新账号）登录后，「学习路径」页与三张卡
 *      （课件 / 思维导图 / 讲义）都与模板账号（默认张湛 #8）完全一致。
 *
 * 做法（幂等，可重复调用）：
 *   1) ensurePath()      学生当前路径快照与模板不一致 → 复制模板快照生成一个新版本并切过去
 *   2) ensureResources() 当前路径版本 + 模板阶段上缺哪张卡就补哪张：
 *                        课件/导图用预置样例（与模板账号同一套），讲义复用模板账号那份正文
 *   3) ensureStudent()   1+2；登录时自动调用（见 authController），也可用
 *                        scripts/provisionDemoTemplate.js 批量跑一遍
 *
 * 关系：与学生点「生成」时的秒出通道（instantSampleResourceService）互补——
 *      秒出通道保证"点了生成立刻有"，本服务保证"一登录就已经有，且跟模板账号一样"。
 */
const { pool } = require("../config/db");
const sampleMaterial = require("./sampleMaterialService");
const studyNotePublisher = require("../../scripts/publishStudyNoteToStudent");
const { publish: publishDeck } = require("../../scripts/buildSampleDeck");
const { publish: publishMindMap } = require("../../scripts/buildSampleMindMap");

const TEMPLATE_STUDENT_ID = Number(process.env.INSTANT_SAMPLE_TEMPLATE_STUDENT || 8);
const FORCED_STAGE_KEY = String(process.env.INSTANT_SAMPLE_TEMPLATE_STAGE || "").trim();
const RESOURCE_TYPES = ["pptx", "mind_map", "study_note"];
const inflight = new Map();

function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

/** 读模板账号的路径快照与讲义正文来源；没有模板就返回 null（此时什么都不做）。 */
async function getTemplate() {
  const [[pathRow]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [TEMPLATE_STUDENT_ID],
  );
  if (!pathRow) return null;
  const version = Number(pathRow.current_version);
  const [[versionRow]] = await pool.query(
    "SELECT version,title,snapshot_json,semantic_fingerprint FROM learning_path_versions WHERE student_id=? AND version=? LIMIT 1",
    [TEMPLATE_STUDENT_ID, version],
  );
  if (!versionRow) return null;
  const snapshot = parseJson(versionRow.snapshot_json, {});
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  const stage =
    (FORCED_STAGE_KEY && stages.find((item) => item.key === FORCED_STAGE_KEY)) || stages[0] || null;
  const snapshotJson =
    typeof versionRow.snapshot_json === "string"
      ? versionRow.snapshot_json
      : JSON.stringify(versionRow.snapshot_json);

  const [[noteRow]] = await pool.query(
    `SELECT id FROM learning_resources
      WHERE student_id=? AND resource_type='study_note' AND status='approved'
      ORDER BY (path_version=? AND stage_key=?) DESC, updated_at DESC, id DESC LIMIT 1`,
    [TEMPLATE_STUDENT_ID, version, stage ? stage.key : ""],
  );

  return {
    studentId: TEMPLATE_STUDENT_ID,
    version,
    title: versionRow.title,
    snapshot,
    snapshotJson,
    semanticFingerprint: versionRow.semantic_fingerprint,
    stageKey: stage ? String(stage.key) : "stage-1",
    subject: stage ? String(stage.subject || "") : "",
    knowledgePoint:
      stage && Array.isArray(stage.knowledgePoints) ? String(stage.knowledgePoints[0] || "") : "",
    noteResourceId: noteRow ? Number(noteRow.id) : null,
  };
}

/** 学生当前路径与模板不一致时，复制模板快照生成新版本（保留历史版本）。 */
async function ensurePath(studentId, template) {
  const [[pathRow]] = await pool.query(
    "SELECT current_version FROM student_learning_paths WHERE student_id=? LIMIT 1",
    [studentId],
  );
  const current = Number(pathRow?.current_version || 0);
  if (current > 0) {
    const [[versionRow]] = await pool.query(
      "SELECT snapshot_json FROM learning_path_versions WHERE student_id=? AND version=? LIMIT 1",
      [studentId, current],
    );
    const snapshotJson = versionRow
      ? typeof versionRow.snapshot_json === "string"
        ? versionRow.snapshot_json
        : JSON.stringify(versionRow.snapshot_json)
      : "";
    if (snapshotJson === template.snapshotJson) return { pathVersion: current, changed: false };
  }

  const nextVersion = current + 1;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO learning_path_versions
         (student_id, version, title, snapshot_json, semantic_fingerprint, change_reason, source_type, source_event_id)
       VALUES (?,?,?,?,?,?,?,NULL)`,
      [
        studentId,
        nextVersion,
        template.title,
        template.snapshotJson,
        template.semanticFingerprint,
        `演示统一模板：与模板账号 #${template.studentId} 的学习路径保持一致`,
        "manual",
      ],
    );
    if (current > 0) {
      await connection.query("UPDATE student_learning_paths SET current_version=? WHERE student_id=?", [
        nextVersion,
        studentId,
      ]);
    } else {
      await connection.query(
        "INSERT INTO student_learning_paths (student_id, current_version) VALUES (?,?)",
        [studentId, nextVersion],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
  return { pathVersion: nextVersion, changed: true };
}

/** 当前阶段位上缺哪张卡就补哪张（教材位唯一键是 student+type+path_version+stage_key）。 */
async function ensureResource(studentId, template, pathVersion, resourceType) {
  const [[existing]] = await pool.query(
    `SELECT id FROM learning_resources
      WHERE student_id=? AND resource_type=? AND path_version=? AND stage_key=? AND status='approved' LIMIT 1`,
    [studentId, resourceType, pathVersion, template.stageKey],
  );
  if (existing) return { resourceId: Number(existing.id), created: false };

  if (resourceType === "study_note") {
    if (!template.noteResourceId) return { created: false, reason: "模板账号没有讲义可复用" };
    const note = await studyNotePublisher.loadNote({ "from-resource": template.noteResourceId });
    const result = await studyNotePublisher.publish(note, {
      student: studentId,
      path: pathVersion,
      stage: template.stageKey,
      takeover: true,
      force: false,
      title: note.title,
    });
    return { resourceId: Number(result.resourceId), created: true };
  }

  const material = sampleMaterial.current();
  const isDeck = resourceType === "pptx";
  const envelope = isDeck ? material.deck() : await material.mindMap();
  const result = isDeck
    ? await publishDeck(pool, envelope, {
        student: studentId,
        pathVersion,
        stageKey: template.stageKey,
        takeover: true,
        force: false,
        subject: envelope.subject,
        knowledgePoint: envelope.knowledgePoint,
        title: material.deckTitle,
      })
    : await publishMindMap(pool, envelope, {
        student: studentId,
        pathVersion,
        stageKey: template.stageKey,
        takeover: true,
        force: false,
        subject: envelope.subject,
        knowledgePoint: envelope.knowledgePoint,
        title: material.mindMapTitle,
      });
  return { resourceId: Number(result.resourceId), created: true };
}

/** 幂等入口：保证这个学生的路径与三张卡都和模板账号一致。 */
async function ensureStudent(studentId) {
  const id = Number(studentId);
  if (!id) return { ok: false, reason: "缺少学生 ID" };
  if (inflight.has(id)) return inflight.get(id);

  const task = (async () => {
    try {
      const template = await getTemplate();
      if (!template) return { ok: false, studentId: id, reason: "模板账号还没有学习路径" };
      const { pathVersion, changed } = await ensurePath(id, template);
      const created = [];
      for (const resourceType of RESOURCE_TYPES) {
        const result = await ensureResource(id, template, pathVersion, resourceType);
        if (result.created) created.push(resourceType);
      }
      return {
        ok: true,
        studentId: id,
        pathVersion,
        pathChanged: changed,
        created,
        stageKey: template.stageKey,
      };
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, task);
  return task;
}

module.exports = {
  ensureStudent,
  getTemplate,
  ensurePath,
  ensureResource,
  TEMPLATE_STUDENT_ID,
  RESOURCE_TYPES,
};
