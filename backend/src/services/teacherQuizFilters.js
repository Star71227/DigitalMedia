/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
function quizFilters(query = {}) {
  const days = query.rangeDays == null ? 30 : Number(query.rangeDays);
  if (![7, 30, 90].includes(days)) {
    const e = new Error("无效的测验统计周期");
    e.statusCode = 400;
    throw e;
  }
  const subject = String(query.subject || "").trim();
  if (subject.length > 100) {
    const e = new Error("科目名称过长");
    e.statusCode = 400;
    throw e;
  }
  const clauses = ["q.submitted_at>=DATE_SUB(NOW(),INTERVAL ? DAY)"],
    params = [days];
  if (subject) {
    clauses.push("q.subject=?");
    params.push(subject);
  }
  return { sql: clauses.join(" AND "), params, days };
}
module.exports = { quizFilters };
