/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 把某套预置样例（课件 + 导图）写进指定学生当前学习路径阶段位的资源，并可用指定的 PPTX 覆盖课件文件。
 *
 *   node scripts/publishSampleToStudent.js --student=8 [--material=tree-chapter6|os-scheduling]
 *                                          [--deck-file="D:\...\xxx.pptx"]
 *
 * 说明：同一学生 + 同一阶段 + 同一资源类型在库上有唯一约束，所以这一步是「替换当前版本」而不是新增，
 * 旧版本会保留在版本记录里；不给 --deck-file 时用渲染出来的 PPTX，给了就原样覆盖成这份文件。
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/config/db");
const storage = require("../src/services/resourceStorageService");
const sampleMaterial = require("../src/services/sampleMaterialService");
const { publish: publishDeck } = require("./buildSampleDeck");
const { publish: publishMindMap } = require("./buildSampleMindMap");

function parseArgs(argv) {
  const options = {};
  for (const item of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(item);
    if (!match) continue;
    options[match[1]] = match[2] === undefined ? true : String(match[2]).replace(/^"|"$/g, "");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const studentId = Number(options.student);
  if (!studentId) throw new Error("请用 --student=<学生ID> 指定学生");
  const material = sampleMaterial.resolve(options.material);
  const [[student]] = await pool.query("SELECT id,display_name FROM users WHERE id=?", [studentId]);
  if (!student) throw new Error(`学生 #${studentId} 不存在`);

  console.log(`素材：${material.label}（${material.key}）→ 学生 ${student.display_name}（#${studentId}）`);

  const deckEnvelope = material.deck();
  const deckResult = await publishDeck(pool, deckEnvelope, {
    student: studentId,
    subject: deckEnvelope.subject,
    knowledgePoint: deckEnvelope.knowledgePoint,
    title: material.deckTitle,
    takeover: true,
    force: true,
  });
  console.log(
    `  课件：资源 #${deckResult.resourceId} v${deckResult.version}（路径 v${deckResult.target.pathVersion} ${deckResult.target.stageKey}）`,
  );

  const mindEnvelope = await material.mindMap();
  const mindResult = await publishMindMap(pool, mindEnvelope, {
    student: studentId,
    subject: mindEnvelope.subject,
    knowledgePoint: mindEnvelope.knowledgePoint,
    title: material.mindMapTitle,
    takeover: true,
    force: true,
  });
  console.log(`  导图：资源 #${mindResult.resourceId} v${mindResult.version}`);

  if (options["deck-file"]) {
    const source = options["deck-file"];
    if (!fs.existsSync(source)) throw new Error(`找不到课件文件：${source}`);
    const tempPath = await storage.prepareTempFile("pptx");
    fs.copyFileSync(source, tempPath);
    const meta = await storage.finalizeFile(tempPath, {
      studentId,
      resourceId: deckResult.resourceId,
      version: deckResult.version,
      fileType: "pptx",
    });
    await pool.query(
      "UPDATE learning_resource_files SET storage_path=?,original_filename=?,file_size=?,checksum_sha256=? WHERE resource_id=? AND resource_version=?",
      [
        meta.storagePath,
        path.basename(source),
        meta.fileSize,
        meta.checksum,
        deckResult.resourceId,
        deckResult.version,
      ],
    );
    console.log(`  课件文件已替换为：${path.basename(source)}（${(meta.fileSize / 1024).toFixed(1)} KB）`);
  }

  await pool.end();
  console.log("完成。");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("写入失败：", error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { main };
