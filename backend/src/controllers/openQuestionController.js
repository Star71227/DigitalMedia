/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { listOpenQuestions, toPublicOpenQuestion } = require("../services/openQuestionService");

async function listOpenQuestionItems(req, res) {
  const subject = req.query.subject;
  const knowledgePoint = req.query.knowledge_point || req.query.knowledgePoint;
  const difficulty = req.query.difficulty;
  const limit = req.query.limit;

  const questions = await listOpenQuestions({
    subject,
    knowledgePoint,
    difficulty,
    limit,
  });

  return res.json({
    data: questions.map(toPublicOpenQuestion),
  });
}

module.exports = {
  listOpenQuestionItems,
};
