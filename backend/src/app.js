/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const express = require("express");
const cors = require("cors");
const { createCorsOptions } = require("./config/corsConfig");
const { requestContext, notFoundHandler, errorHandler } = require("./middleware/requestContext");

const healthRoutes = require("./routes/health");
const chatRoutes = require("./routes/chat");
const studentInsightRoutes = require("./routes/studentInsights");
const resourceRoutes = require("./routes/resources");
const quizRoutes = require("./routes/quiz");
const openQuestionRoutes = require("./routes/openQuestions");
const wrongQuestionRoutes = require("./routes/wrongQuestions");
const profileRoutes = require("./routes/profile");
const agentLogRoutes = require("./routes/agentLogs");
const codeRoutes = require("./routes/code");
const authRoutes = require("./routes/auth");
const learningPathRoutes = require("./routes/learningPath");
const knowledgeRoutes = require("./routes/knowledge");
const teacherRoutes = require("./routes/teacher");
const studentClassRoutes = require("./routes/studentClasses");
const assignmentRoutes = require("./routes/assignments");
const teacherAssignmentRoutes = require("./routes/teacherAssignments");
const teacherQuestionBankRoutes = require("./routes/teacherQuestionBank");
const aiLearningRoutes = require("./routes/aiLearning");
const checkInRoutes = require("./routes/checkIn");
const studyTimeRoutes = require("./routes/studyTime");

const app = express();

app.disable("x-powered-by");
app.use(requestContext);
app.use(cors(createCorsOptions()));
app.use(express.json({ limit: "10mb" }));

app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", chatRoutes);
app.use("/api", studentInsightRoutes);
app.use("/api", aiLearningRoutes);
app.use("/api", resourceRoutes);
app.use("/api", quizRoutes);
app.use("/api", openQuestionRoutes);
app.use("/api", wrongQuestionRoutes);
app.use("/api", profileRoutes);
app.use("/api", learningPathRoutes);
app.use("/api", knowledgeRoutes);
app.use("/api", teacherRoutes);
app.use("/api", studentClassRoutes);
app.use("/api", teacherAssignmentRoutes);
app.use("/api", teacherQuestionBankRoutes);
app.use("/api", assignmentRoutes);
app.use("/api", checkInRoutes);
app.use("/api", studyTimeRoutes);
app.use("/api/agent-logs", agentLogRoutes);
app.use("/api/code", codeRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
