/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRanking, readPathProgress } = require("../src/services/studentRankingService");

test("buildRanking sorts by combined student progress and marks the current student", () => {
  const result = buildRanking({
    className: "数据结构 2 班",
    currentStudentId: 2,
    members: [
      { id: 1, display_name: "李晨" },
      { id: 2, display_name: "张三" },
    ],
    quizRows: [
      { student_id: 1, correct_count: 8, total_count: 10 },
      { student_id: 2, correct_count: 9, total_count: 10 },
    ],
    focusRows: [
      { student_id: 1, study_minutes: 300 },
      { student_id: 2, study_minutes: 420 },
    ],
    pathRows: [
      { student_id: 1, snapshot_json: JSON.stringify({ progress: 72 }) },
      { student_id: 2, snapshot_json: JSON.stringify({ progress: 88 }) },
    ],
    codeRows: [
      { student_id: 1, accepted_count: 1 },
      { student_id: 2, accepted_count: 3 },
    ],
    checkInRows: [],
  });
  assert.equal(result.items[0].studentId, "2");
  assert.equal(result.items[0].isCurrent, true);
  assert.equal(result.myRank, 1);
  assert.equal(result.total, 2);
});

test("readPathProgress accepts either direct progress or stage averages", () => {
  assert.equal(readPathProgress('{"progress":63.7}'), 64);
  assert.equal(readPathProgress({ stages: [{ progress: 20 }, { progress: 80 }] }), 50);
});
