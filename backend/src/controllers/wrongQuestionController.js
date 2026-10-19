/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const {
  VALID_WRONG_QUESTION_STATUSES,
  listWrongQuestions,
  updateWrongQuestionStatus,
} = require("../services/wrongQuestionService");

async function listWrongQuestionItems(req, res) {
  try {
    const { status, subject } = req.query || {};

    if (status && !VALID_WRONG_QUESTION_STATUSES.includes(status)) {
      return res.status(400).json({ error: "错题状态只能是待复习或已掌握" });
    }

    const data = await listWrongQuestions({
      studentId: req.user.studentId,
      status,
      subject,
    });

    return res.json({ data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "查询错题本失败",
    });
  }
}

async function patchWrongQuestionStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "错题编号无效" });
    }

    if (!VALID_WRONG_QUESTION_STATUSES.includes(status)) {
      return res.status(400).json({ error: "错题状态只能是待复习或已掌握" });
    }

    const updated = await updateWrongQuestionStatus({
      studentId: req.user.studentId,
      id,
      status,
    });

    if (!updated) {
      return res.status(404).json({ error: "未找到该错题记录" });
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "更新错题状态失败",
    });
  }
}

module.exports = {
  listWrongQuestionItems,
  patchWrongQuestionStatus,
};
