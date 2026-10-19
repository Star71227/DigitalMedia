/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 课堂演示用的「秒出资源」通道
 * ---------------------------------------------------------------------------
 * 打开 INSTANT_SAMPLE_RESOURCES=true 后，学生或教师点击「生成」会立刻拿到资源，
 * 不再等待模型生成（真实链路一次要 1–6 分钟，云端讲课现场等不起）：
 *
 *   pptx       → 直接把预置样例课件写成本学生当前阶段的课件版本
 *   mind_map   → 同上，写预置样例导图
 *   study_note → 直接复用该学生已经生成过的讲义（「讲义就用原来的那个」），不调用模型
 *
 * 具体用哪一套样例由 INSTANT_SAMPLE_SOURCE 决定（见 sampleMaterialService）：
 *   tree-chapter6（默认，数据结构 · 第 6 章 树和二叉树） / os-scheduling（操作系统 · 处理机调度）
 *
 * 写入方式与 scripts/buildSampleDeck.js / buildSampleMindMap.js 完全一致（同一套 publish，
 * 新版本写入并保留旧版本），因此页面上的预览、下载、导图导出、路径关联与交付文件一致。
 *
 * 关闭 INSTANT_SAMPLE_RESOURCES 即恢复「画像 → 生成 → 双层审核 → 渲染」的真实链路。
 */
const { pool } = require("../config/db");
const sampleMaterial = require("./sampleMaterialService");
const { publish: publishDeck } = require("../../scripts/buildSampleDeck");
const { publish: publishMindMap } = require("../../scripts/buildSampleMindMap");
const studyNotePublisher = require("../../scripts/publishStudyNoteToStudent");

const INSTANT_TYPES = new Set(["pptx", "mind_map", "study_note"]);
const studentCache = new Map();

function enabled(env = process.env) {
  return (
    String(env.INSTANT_SAMPLE_RESOURCES || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function supports(resourceType) {
  return INSTANT_TYPES.has(String(resourceType || ""));
}

/**
 * 只对指定学生生效（INSTANT_SAMPLE_STUDENTS 逗号分隔，可写用户 ID 或用户名）。
 * 不设置该变量时对所有学生生效；设置后其它学生继续走真实的个性化生成链路。
 */
async function isInstantStudent(studentId, env = process.env) {
  const raw = String(env.INSTANT_SAMPLE_STUDENTS || "").trim();
  if (!raw) return true;
  const tokens = raw.split(/[,\s]+/).filter(Boolean);
  if (tokens.includes(String(studentId))) return true;
  if (/^\d+$/.test(raw)) return false;
  if (studentCache.has(studentId)) return studentCache.get(studentId);
  const [[row]] = await pool
    .query("SELECT username FROM users WHERE id=? LIMIT 1", [studentId])
    .catch(() => [[null]]);
  const matched = Boolean(row && tokens.includes(row.username));
  studentCache.set(studentId, matched);
  return matched;
}

/** 取该学生最近一份已通过的讲义（没有就交给真实链路去生成）。 */
async function findExistingStudyNote(studentId) {
  const [[row]] = await pool.query(
    `SELECT id,current_version,title FROM learning_resources
      WHERE student_id=? AND resource_type='study_note' AND status='approved'
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [studentId],
  );
  return row || null;
}

/** 取该学生在「指定路径版本 + 阶段」上已经就位的讲义（页面就是按这两项过滤的）。 */
async function findStudyNoteAtStage(studentId, pathVersion, stageKey) {
  const [[row]] = await pool.query(
    `SELECT id,current_version,title FROM learning_resources
      WHERE student_id=? AND resource_type='study_note' AND path_version=? AND stage_key=? AND status='approved'
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [studentId, pathVersion, stageKey],
  );
  return row || null;
}

/** 模板账号（默认张湛 #8）：新账号一份讲义都没有时，用它那份兜底，保证"一登录就和模板一样"。 */
const TEMPLATE_STUDENT_ID = Number(process.env.INSTANT_SAMPLE_TEMPLATE_STUDENT || 8);

async function findTemplateStudyNote() {
  if (!TEMPLATE_STUDENT_ID) return null;
  const [[row]] = await pool.query(
    `SELECT id,current_version,title FROM learning_resources
      WHERE student_id=? AND resource_type='study_note' AND status='approved'
      ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [TEMPLATE_STUDENT_ID],
  );
  return row || null;
}

/** 阶段 key 是否真的在这版路径里（避免讲义被写到别的阶段去）。 */
async function stageExistsInPath(studentId, pathVersion, stageKey) {
  const [[row]] = await pool.query(
    "SELECT snapshot_json FROM learning_path_versions WHERE student_id=? AND version=? LIMIT 1",
    [studentId, pathVersion],
  );
  if (!row) return false;
  let snapshot = row.snapshot_json;
  if (typeof snapshot === "string") {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      return false;
    }
  }
  const stages = Array.isArray(snapshot?.stages) ? snapshot.stages : [];
  return stages.some((stage) => String(stage?.key) === String(stageKey));
}

/**
 * 清掉指向「还不存在的版本」的残留阶段关联。
 * 上一版样例写库失败或版本被回退时会留下这种孤儿行，而 learning_resource_stage_links 上
 * 有 (student_id,resource_id,resource_version) 唯一键，不清掉再写同一版本就会报重复键。
 */
async function cleanOrphanStageLinks({ studentId, resourceType, pathVersion, stageKey }) {
  const [result] = await pool.query(
    `DELETE l FROM learning_resource_stage_links l
       JOIN learning_resources r ON r.id = l.resource_id
      WHERE l.student_id=? AND r.resource_type=? AND l.path_version=? AND l.stage_key=?
        AND l.resource_version > r.current_version`,
    [studentId, resourceType, pathVersion, stageKey],
  );
  return Number(result.affectedRows || 0);
}

/**
 * 尝试走秒出通道。
 * @returns {Promise<{resourceId:number, version:number, kind:string, title:string}|null>} null 表示未命中，调用方继续走真实生成。
 */
async function buildInstantResource(context, options = {}) {
  if (!enabled()) return null;
  const studentId = Number(context?.studentId);
  const resourceType = String(context?.resourceType || "");
  if (!studentId || !supports(resourceType)) return null;
  if (!(await isInstantStudent(studentId))) return null;

  if (resourceType === "study_note") {
    const pathVersion = Number(context.pathVersion);
    const stageKey = String(context.stageKey || "");

    /* 1) 当前阶段位已经有讲义：直接复用（正常情况） */
    const atStage = await findStudyNoteAtStage(studentId, pathVersion, stageKey);
    if (atStage) {
      options.stage?.("content_generation", {
        message: "已复用你此前生成的个性化讲义，无需重新生成。",
        metadata: { resourceType, reused: true, instant: true, resourceId: Number(atStage.id) },
      });
      return {
        resourceId: Number(atStage.id),
        version: Number(atStage.current_version),
        kind: "study_note_reused",
        title: atStage.title,
      };
    }

    /* 2) 当前阶段位没有讲义（典型场景：学习路径升版，旧讲义还挂在上一版）：
          把已有讲义正文原样落到当前阶段位。
          修复前这里只是把旧讲义的 ID 返回给前端，阶段位一直空着，而前端按
          pathVersion 过滤资源，于是「选择学习载体」里讲义这张卡永远停在「未生成」
          —— 这个问题已经反复出现过（课件/导图会重新落地，讲义不会）。 */
    let existing = await findExistingStudyNote(studentId);
    if (!existing) {
      // 新注册的账号一份讲义都没有：直接用模板账号（张湛）那份，避免现场等模型生成
      existing = await findTemplateStudyNote();
      if (!existing) return null;
    }

    if (!(await stageExistsInPath(studentId, pathVersion, stageKey))) {
      options.stage?.("content_generation", {
        message: "已复用你此前生成的个性化讲义，无需重新生成。",
        metadata: {
          resourceType,
          reused: true,
          instant: true,
          materialized: false,
          reason: "stage_not_in_path",
        },
      });
      return {
        resourceId: Number(existing.id),
        version: Number(existing.current_version),
        kind: "study_note_reused",
        title: existing.title,
      };
    }

    const note = await studyNotePublisher.loadNote({ "from-resource": existing.id });
    options.stage?.("content_generation", {
      message: "正在把此前的个性化讲义同步到当前学习阶段。",
      metadata: { resourceType, reused: true, instant: true, materializedFrom: Number(existing.id) },
    });
    await cleanOrphanStageLinks({ studentId, resourceType, pathVersion, stageKey });
    const result = await studyNotePublisher.publish(note, {
      student: studentId,
      path: pathVersion,
      stage: stageKey,
      takeover: true,
      force: false,
      title: note.title,
    });
    options.stage?.("persistence", {
      message: "讲义已同步到当前学习阶段。",
      metadata: { resourceId: Number(result.resourceId), version: Number(result.version), instant: true },
    });
    return {
      resourceId: Number(result.resourceId),
      version: Number(result.version),
      kind: "study_note_reused",
      title: result.title || existing.title,
    };
  }

  const isDeck = resourceType === "pptx";
  const material = sampleMaterial.current();
  const envelope = isDeck ? material.deck() : await material.mindMap();
  const scoped = {
    student: studentId,
    pathVersion: context.pathVersion,
    stageKey: context.stageKey,
    takeover: true,
    // force=false：当前版本已经是同一份样例内容时直接复用，避免每点一次就多一个版本
    force: false,
    subject: envelope.subject,
    knowledgePoint: envelope.knowledgePoint,
    title: isDeck ? material.deckTitle : material.mindMapTitle,
  };
  options.stage?.("content_generation", {
    message: isDeck ? `正在装配${material.label}的完整课件。` : `正在装配${material.label}的完整知识导图。`,
    metadata: { resourceType, instant: true, sample: material.key },
  });
  await cleanOrphanStageLinks({
    studentId,
    resourceType,
    pathVersion: context.pathVersion,
    stageKey: context.stageKey,
  });
  const result = isDeck
    ? await publishDeck(pool, envelope, scoped)
    : await publishMindMap(pool, envelope, scoped);
  options.stage?.("persistence", {
    message: isDeck ? "课件已生成并保存为当前版本。" : "思维导图已生成并保存为当前版本。",
    metadata: { resourceId: Number(result.resourceId), version: Number(result.version), instant: true },
  });
  return {
    resourceId: Number(result.resourceId),
    version: Number(result.version),
    kind: isDeck ? "pptx_sample" : "mind_map_sample",
    title: scoped.title,
    sample: material.key,
  };
}

module.exports = { enabled, supports, isInstantStudent, buildInstantResource, findExistingStudyNote };
