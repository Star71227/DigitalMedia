/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const editor = require("../services/presentationEditorService");
function failure(res, error) {
  return res
    .status(error.statusCode || 500)
    .json({ error: error.statusCode ? error.message : "课件操作失败，请稍后重试" });
}
async function load(req, res) {
  try {
    res.json(await editor.load(req.user.studentId, req.params.resourceId));
  } catch (e) {
    failure(res, e);
  }
}
async function save(req, res) {
  try {
    res.json(await editor.save(req.user.studentId, req.params.resourceId, req.body));
  } catch (e) {
    failure(res, e);
  }
}
async function download(req, res) {
  try {
    const bytes = await editor.exportDeck(req.user.studentId, req.params.resourceId, req.body);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent("LearnMate-" + String(req.body.title || "课件").slice(0, 80) + ".pptx")}`,
    );
    res.send(bytes);
  } catch (e) {
    failure(res, e);
  }
}
module.exports = { load, save, download };
