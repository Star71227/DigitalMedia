/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 课堂上来回切换某个资源的当前版本（例如把「个性化课件」从样例切回原来的模型生成版本）。
 *
 * 用法：
 *   node scripts/restoreResourceVersion.js 66 3     # 切回 v3（处理机调度 · 补基础）
 *   node scripts/restoreResourceVersion.js 66 4     # 再切回 v4（样例课件）
 *   node scripts/restoreResourceVersion.js 66       # 只列出全部版本，不改动
 *
 * 说明：标题取该版本 content_json.title；subject / knowledge_point 优先取该版本
 * review_json.requestSnapshot 里记录的值，取不到就保持不变（不猜）。同时确保该版本
 * 有对应的学习进度行，避免页面读取时缺行。
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

function parse(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

(async () => {
  const resourceId = Number(process.argv[2]);
  const targetVersion = process.argv[3] ? Number(process.argv[3]) : null;
  if (!resourceId) {
    console.error("用法：node scripts/restoreResourceVersion.js <resourceId> [version]");
    process.exit(1);
  }
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 4,
  });
  const [[resource]] = await pool.query("SELECT * FROM learning_resources WHERE id=? LIMIT 1", [resourceId]);
  if (!resource) {
    console.error(`资源 #${resourceId} 不存在`);
    await pool.end();
    process.exit(1);
  }
  const [versions] = await pool.query(
    "SELECT version, generator_source, created_at, JSON_UNQUOTE(JSON_EXTRACT(content_json,'$.title')) AS deck_title, JSON_LENGTH(JSON_EXTRACT(content_json,'$.content.slides')) AS slides, review_json FROM learning_resource_versions WHERE resource_id=? ORDER BY version",
    [resourceId],
  );
  console.log(
    `资源 #${resourceId}（学生 ${resource.student_id}，当前 v${resource.current_version}，标题「${resource.title}」）`,
  );
  console.table(
    versions.map((row) => ({
      version: row.version,
      source: row.generator_source,
      title: row.deck_title,
      slides: row.slides,
      createdAt: row.created_at,
      current: row.version === Number(resource.current_version) ? "←当前" : "",
    })),
  );

  if (!targetVersion) {
    console.log("未指定版本号，仅列出（加版本号即可切换）。");
    await pool.end();
    return;
  }
  const target = versions.find((row) => Number(row.version) === targetVersion);
  if (!target) {
    console.error(`资源 #${resourceId} 没有 v${targetVersion}`);
    await pool.end();
    process.exit(1);
  }

  const snapshot = parse(target.review_json).requestSnapshot || {};
  const subject = snapshot.subject || resource.subject;
  const knowledgePoint = snapshot.knowledgePoint || resource.knowledge_point;
  await pool.query(
    "UPDATE learning_resources SET title=?, subject=?, knowledge_point=?, current_version=?, source_type=?, updated_at=NOW() WHERE id=?",
    [
      String(target.deck_title || resource.title),
      subject,
      knowledgePoint,
      targetVersion,
      target.generator_source || resource.source_type,
      resourceId,
    ],
  );
  await pool
    .query(
      "INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent) VALUES (?,?,?,'not_started',0) ON DUPLICATE KEY UPDATE resource_version=resource_version",
      [resource.student_id, resourceId, targetVersion],
    )
    .catch(async () => {
      // 没有唯一键时退化成「存在即跳过」
      const [[row]] = await pool.query(
        "SELECT id FROM learning_resource_progress WHERE student_id=? AND resource_id=? AND resource_version=? LIMIT 1",
        [resource.student_id, resourceId, targetVersion],
      );
      if (!row) {
        await pool.query(
          "INSERT INTO learning_resource_progress (student_id,resource_id,resource_version,status,progress_percent) VALUES (?,?,?,'not_started',0)",
          [resource.student_id, resourceId, targetVersion],
        );
      }
    });

  const [[updated]] = await pool.query(
    "SELECT title, subject, knowledge_point, current_version FROM learning_resources WHERE id=?",
    [resourceId],
  );
  console.log("已切换：", updated);
  await pool.end();
})().catch((error) => {
  console.error("切换失败：", error.message);
  process.exit(1);
});
