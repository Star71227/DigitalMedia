/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/* 验证造完数据后两端的各项接口是否丰富、可用。 */
require("dotenv").config({ quiet: true });
const jwt = require("jsonwebtoken");
const base = "http://127.0.0.1:5800";
const student = (id) =>
  jwt.sign({ userId: id, studentId: id, role: "STUDENT", username: `v${id}` }, process.env.JWT_SECRET, {
    expiresIn: "30m",
  });
const teacher = (id) =>
  jwt.sign({ userId: id, teacherId: id, role: "TEACHER", username: `vt${id}` }, process.env.JWT_SECRET, {
    expiresIn: "30m",
  });

async function get(path, token) {
  const res = await fetch(base + path, { headers: { Authorization: "Bearer " + token } });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text.slice(0, 200) };
  }
}

(async () => {
  console.log("========== 学生端（张湛 id=8） ==========");
  const assessment = await get("/api/student/assessment", student(8));
  const a = assessment.body;
  console.log("学习报告 /api/student/assessment:", assessment.status);
  console.log(
    `  证据数 ${a.evidenceCount} | 综合掌握度 ${a.metrics?.overallMastery}% | 路径完成度 ${a.metrics?.pathProgress}%`,
  );
  console.log(
    `  掌握度记录 ${a.mastery?.length} 条 | 薄弱点 ${a.weaknesses?.length} | 优势 ${a.strengths?.length} | 错因 ${a.errorPatterns?.length} | 风险 ${a.risks?.length} | 建议 ${a.recommendations?.length}`,
  );
  console.log(
    `  测验：${a.metrics?.quiz?.attemptCount} 次、平均正确率 ${a.metrics?.quiz?.averageAccuracy}%；CodeLab ${a.metrics?.codeLab?.submissionCount} 次；资源完成 ${a.metrics?.completedResources}/${a.metrics?.resourceCount}`,
  );
  console.log(
    "  掌握度样例:",
    (a.mastery || [])
      .slice(0, 4)
      .map((m) => `${m.knowledgePoint}:${m.mastery}`)
      .join(", "),
  );

  const study = await get("/api/study-time?days=30", student(8));
  const days = study.body.days || [];
  console.log(
    `学习时长 /api/study-time: ${study.status} | ${days.length} 天，总 ${days.reduce((s, d) => s + d.minutes, 0)} 分钟，最高 ${Math.max(0, ...days.map((d) => d.minutes))}`,
  );

  const ranking = await get("/api/student/class-ranking", student(8));
  const r = ranking.body;
  console.log(
    `班级信息 /api/student/class-ranking: ${ranking.status} | 班级 ${r.className} | 共 ${r.total} 人 | 我的名次 ${r.myRank} | 榜单 ${r.items?.length} 行`,
  );
  console.log(
    "  榜单前 3:",
    (r.items || [])
      .slice(0, 3)
      .map((i) => `${i.name}(${i.score}分)`)
      .join(", "),
  );

  const assignments = await get("/api/assignments", student(8));
  const list = assignments.body.data || assignments.body;
  console.log(
    `作业 /api/assignments: ${assignments.status} | ${list.length} 份 | 未交 ${list.filter((x) => !x.submitted).length}`,
  );

  console.log("\n========== 教师端（张泮 id=12） ==========");
  const students = await get("/api/teacher/students?limit=100", teacher(12));
  const rows = students.body.data || students.body;
  console.log(
    `学生管理 /api/teacher/students: ${students.status} | ${Array.isArray(rows) ? rows.length : "?"} 名学生`,
  );
  if (Array.isArray(rows) && rows[0]) {
    const sample = rows[0];
    console.log("  字段:", Object.keys(sample).slice(0, 18).join(", "));
    console.log(
      "  样例:",
      `${sample.displayName} 掌握度项 ${sample.mastery?.length} 错因 ${sample.errorPatterns?.length} 路径进度 ${sample.pathProgress}% 正确率 ${sample.recentQuizAccuracy != null ? Math.round(sample.recentQuizAccuracy) : "-"}% 风险 ${sample.risk?.level || sample.risk}`,
    );
  }

  const analytics = await get("/api/teacher/classes/42/analytics?range=30d", teacher(12));
  const an = analytics.body.data || analytics.body;
  console.log(`班级情况 /api/teacher/classes/42/analytics: ${analytics.status}`);
  if (an) {
    console.log("  summary:", JSON.stringify(an.summary));
    const arrays = Object.entries(an).filter(([, value]) => Array.isArray(value));
    arrays.forEach(([key, value]) => {
      const sample = value[0] ? JSON.stringify(value[0]).slice(0, 110) : "";
      console.log(`  ${key}: ${value.length} 条 ${sample}`);
    });
  }

  const quizAnalytics = await get("/api/teacher/quiz-analytics?range=30d", teacher(12));
  const qa = quizAnalytics.body.data || quizAnalytics.body;
  console.log(`测验分析 /api/teacher/quiz-analytics: ${quizAnalytics.status}`);
  if (qa) {
    console.log("  summary:", JSON.stringify(qa.summary));
    Object.entries(qa)
      .filter(([, value]) => Array.isArray(value))
      .forEach(([key, value]) => {
        console.log(`  ${key}: ${value.length} 条 ${value[0] ? JSON.stringify(value[0]).slice(0, 110) : ""}`);
      });
  }

  const requests = await get("/api/teacher/class-requests?status=pending", teacher(12));
  const reqs = requests.body.data || requests.body;
  console.log(
    `入班申请 /api/teacher/class-requests: ${requests.status} | ${Array.isArray(reqs) ? reqs.length : "?"} 条`,
  );
  if (Array.isArray(reqs))
    reqs
      .slice(0, 4)
      .forEach((item) =>
        console.log(
          `   #${item.requestId} ${item.studentName || item.studentId} → ${item.className} (${item.status})`,
        ),
      );

  const dashboard = await get("/api/teacher/dashboard/overview", teacher(12));
  const db = dashboard.body.data || dashboard.body;
  console.log(
    `教师首页 /api/teacher/dashboard/overview: ${dashboard.status} | 键: ${Object.keys(db || {}).join(", ")}`,
  );
  if (db?.summary) console.log("  summary:", JSON.stringify(db.summary).slice(0, 260));

  const reports = await get("/api/teacher/reports?limit=20", teacher(12));
  const rl = reports.body.data || reports.body;
  console.log(
    `学习报告列表 /api/teacher/reports: ${reports.status} | ${Array.isArray(rl) ? rl.length : "?"} 份`,
  );
})();
