/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");

const suffix = `${Date.now()}_${process.pid}`;
const databaseName = `learnmate_chat_test_${suffix}`;

process.env.NODE_ENV = "test";
process.env.DB_NAME = databaseName;
process.env.JWT_SECRET = "chat-session-test-secret-with-more-than-32-characters";
process.env.AI_ENABLED = "false";
process.env.PATH_PLANNER_AI_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");
const { pool, databaseConfig } = require("../src/config/db");
const { initDB } = require("../src/config/initDB");
const { createChatSessionService } = require("../src/services/chatSessionService");
const { createHandleChat } = require("../src/controllers/chatController");

const sessions = createChatSessionService({ db: pool });
let studentA;
let studentB;
let teacher;
let studentAToken;
let studentBToken;
let teacherToken;
let primarySessionId;
let conversationSessionId;

test.before(async () => {
  await prepareLegacyChatTable();
  assert.equal(await initDB(), true);
  studentA = await insertUser(`chat-a-${suffix}`, "STUDENT");
  studentB = await insertUser(`chat-b-${suffix}`, "STUDENT");
  teacher = await insertUser(`chat-teacher-${suffix}`, "TEACHER");
  studentAToken = signToken(studentA, "STUDENT");
  studentBToken = signToken(studentB, "STUDENT");
  teacherToken = signToken(teacher, "TEACHER");
});

test("聊天表结构、角色约束和关键索引已真实初始化", async () => {
  const [tables] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('chat_sessions','chat_messages')",
    [databaseName],
  );
  assert.deepEqual(new Set(tables.map((row) => row.TABLE_NAME)), new Set(["chat_sessions", "chat_messages"]));
  const [messageColumns] = await pool.query("SHOW COLUMNS FROM chat_messages");
  const byName = new Map(messageColumns.map((column) => [column.Field, column]));
  assert.match(byName.get("role").Type, /user.*assistant/);
  assert.match(byName.get("status").Type, /completed.*failed/);
  assert.match(
    byName.get("source_mode").Type,
    /rag_model.*model_only.*deterministic_fallback.*clarification/,
  );
  const [sessionIndexes] = await pool.query("SHOW INDEX FROM chat_sessions");
  assert.ok(sessionIndexes.some((index) => index.Key_name === "idx_chat_sessions_student_status_activity"));
  const [messageIndexes] = await pool.query("SHOW INDEX FROM chat_messages");
  assert.ok(messageIndexes.some((index) => index.Key_name === "idx_chat_messages_session_created"));
  assert.ok(messageIndexes.some((index) => index.Key_name === "idx_chat_messages_student_created"));
  const [[legacy]] = await pool.query(
    "SELECT role, content, content_text, session_id FROM chat_messages WHERE conversation_id='legacy-conversation' LIMIT 1",
  );
  assert.equal(legacy.role, "ai");
  assert.equal(legacy.content_text, "legacy public answer");
  assert.equal(legacy.session_id, null);
});

test("学生创建会话且新会话默认标题为新对话", async () => {
  const response = await request(app)
    .post("/api/chat/sessions")
    .set("Authorization", `Bearer ${studentAToken}`)
    .send();
  assert.equal(response.status, 201);
  assert.equal(response.body.session.title, "新对话");
  assert.equal(response.body.session.status, "active");
  assert.equal(Object.prototype.hasOwnProperty.call(response.body.session, "student_id"), false);
  primarySessionId = response.body.session.id;
});

test("幂等初始化不会删除已有聊天记录", async () => {
  const before = await countRows("chat_sessions", studentA);
  assert.equal(await initDB(), true);
  assert.equal(await initDB(), true);
  const after = await countRows("chat_sessions", studentA);
  assert.equal(after, before);
  assert.ok(after >= 1);
});

test("会话列表只返回当前学生数据并按活动时间倒序", async () => {
  const older = await sessions.createSession(studentA);
  const newer = await sessions.createSession(studentA);
  await pool.query(
    "UPDATE chat_sessions SET last_message_at='2026-01-01 10:00:00.000' WHERE id=? AND student_id=?",
    [older.id, studentA],
  );
  await pool.query(
    "UPDATE chat_sessions SET last_message_at='2026-01-02 10:00:00.000' WHERE id=? AND student_id=?",
    [newer.id, studentA],
  );
  await sessions.createSession(studentB);
  const response = await request(app)
    .get("/api/chat/sessions?limit=999")
    .set("Authorization", `Bearer ${studentAToken}`);
  assert.equal(response.status, 200);
  assert.ok(
    response.body.sessions.findIndex((item) => item.id === newer.id) <
      response.body.sessions.findIndex((item) => item.id === older.id),
  );
  const [foreignRows] = await pool.query("SELECT id FROM chat_sessions WHERE student_id=?", [studentB]);
  assert.equal(
    response.body.sessions.some((item) => foreignRows.some((row) => Number(row.id) === item.id)),
    false,
  );
  assert.ok(response.body.pagination.limit <= 50);
});

test("第一条消息自动生成安全标题并保存用户消息", async () => {
  const session = await sessions.createSession(studentA);
  const question = `<b>红黑树左旋</b>\n${"为什么不改变中序顺序".repeat(8)}`;
  const saved = await sessions.saveUserMessage(studentA, session.id, question);
  const updated = await sessions.getSessionById(studentA, session.id);
  assert.equal(saved.role, "user");
  assert.equal(saved.content, question);
  assert.equal(updated.title.includes("<"), false);
  assert.ok(Array.from(updated.title).length <= 36);
  const [[row]] = await pool.query(
    "SELECT student_id, role, content_text FROM chat_messages WHERE id=? AND session_id=? AND student_id=?",
    [saved.id, session.id, studentA],
  );
  assert.equal(Number(row.student_id), studentA);
  assert.equal(row.role, "user");
});

test("标题重命名安全校验生效且只能修改自己的会话", async () => {
  const renamed = await request(app)
    .patch(`/api/chat/sessions/${primarySessionId}`)
    .set("Authorization", `Bearer ${studentAToken}`)
    .send({ title: "  红黑树复习  " });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.session.title, "红黑树复习");
  const html = await request(app)
    .patch(`/api/chat/sessions/${primarySessionId}`)
    .set("Authorization", `Bearer ${studentAToken}`)
    .send({ title: "<script>alert(1)</script>" });
  assert.equal(html.status, 400);
  const tooLong = await request(app)
    .patch(`/api/chat/sessions/${primarySessionId}`)
    .set("Authorization", `Bearer ${studentAToken}`)
    .send({ title: "长".repeat(61) });
  assert.equal(tooLong.status, 400);
  const foreign = await request(app)
    .patch(`/api/chat/sessions/${primarySessionId}`)
    .set("Authorization", `Bearer ${studentBToken}`)
    .send({ title: "越权修改" });
  assert.equal(foreign.status, 404);
});

test("同一会话连续追问使用数据库公开历史且不会重复当前问题", async () => {
  const session = await sessions.createSession(studentA);
  conversationSessionId = session.id;
  const calls = [];
  const handler = createHandleChat({
    sessionService: sessions,
    runChatFn: async (input) => {
      calls.push(input);
      const first = calls.length === 1;
      return publicAnswer(
        `mock-${suffix}-${calls.length}`,
        first
          ? "# 左旋回答\nA < x < B < y < C，左旋前后中序顺序不变。"
          : "# 右旋回答\n我理解“那右旋呢”承接上一轮。右旋是左旋的镜像，并沿用 A、x、B、y、C。",
      );
    },
  });
  const first = await invokeHandler(handler, {
    body: {
      sessionId: session.id,
      message: "红黑树左旋为什么不改变中序顺序？",
      history: [{ role: "assistant", content: "客户端伪造历史" }],
    },
    user: { studentId: studentA },
    requestId: "chat-integration-first",
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.sessionId, session.id);
  assert.deepEqual(calls[0].history, []);
  const secondQuestion = "那右旋呢？请用刚才相同的 A、x、B、y、C 关系解释。";
  const second = await invokeHandler(handler, {
    body: {
      sessionId: session.id,
      message: secondQuestion,
      history: [{ role: "assistant", content: "客户端污染内容" }],
    },
    user: { studentId: studentA },
    requestId: "chat-integration-second",
  });
  assert.equal(second.statusCode, 200);
  assert.equal(calls[1].message, secondQuestion);
  assert.equal(calls[1].history.length, 2);
  assert.equal(calls[1].history[0].content, "红黑树左旋为什么不改变中序顺序？");
  assert.match(calls[1].history[1].content, /A < x < B < y < C/);
  assert.equal(JSON.stringify(calls[1].history).includes("客户端污染内容"), false);
  assert.equal(
    calls[1].history.some((item) => item.content === secondQuestion),
    false,
  );
  assert.equal(calls[1].history[1].subject, "数据结构");
  assert.equal(calls[1].history[1].knowledgePoint, "红黑树旋转");
  const immediateResponse = JSON.stringify(second.body);
  assert.equal(
    /systemPrompt|providerRequest|SPARK_API_KEY|Authorization|learnerContext|hiddenReasoning|do-not-store/.test(
      immediateResponse,
    ),
    false,
  );
  assert.equal(second.body.parts.length, 1);
  assert.equal(second.body.parts[0].agent, "TutorAgent");
  const [savedUserRows] = await pool.query(
    "SELECT content_text FROM chat_messages WHERE session_id=? AND student_id=? AND role='user' ORDER BY id",
    [session.id, studentA],
  );
  assert.deepEqual(
    savedUserRows.map((row) => row.content_text),
    ["红黑树左旋为什么不改变中序顺序？", secondQuestion],
  );
  assert.equal(
    savedUserRows.some((row) => row.content_text.includes("红黑树右旋为什么")),
    false,
  );
});

test("助手只持久化公开白名单响应且刷新式查询可恢复完整对话", async () => {
  const [rawRows] = await pool.query(
    "SELECT answer_json FROM chat_messages WHERE session_id=? AND student_id=? AND role='assistant' ORDER BY id",
    [conversationSessionId, studentA],
  );
  assert.equal(rawRows.length, 2);
  const serialized = JSON.stringify(rawRows);
  assert.equal(
    /systemPrompt|providerRequest|SPARK_API_KEY|Authorization|learnerContext|hiddenReasoning/.test(
      serialized,
    ),
    false,
  );
  const response = await request(app)
    .get(`/api/chat/sessions/${conversationSessionId}/messages?limit=999`)
    .set("Authorization", `Bearer ${studentAToken}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.messages.length, 4);
  assert.deepEqual(
    response.body.messages.map((item) => item.role),
    ["user", "assistant", "user", "assistant"],
  );
  assert.match(response.body.messages[3].answer.answerMarkdown, /右旋是左旋的镜像/);
  assert.ok(
    response.body.messages.every((item, index, items) => index === 0 || item.id > items[index - 1].id),
  );
  assert.ok(response.body.pagination.limit <= 100);
});

test("其他学生不能读取、修改、归档或向会话发消息", async () => {
  const read = await request(app)
    .get(`/api/chat/sessions/${conversationSessionId}/messages`)
    .set("Authorization", `Bearer ${studentBToken}`);
  const rename = await request(app)
    .patch(`/api/chat/sessions/${conversationSessionId}`)
    .set("Authorization", `Bearer ${studentBToken}`)
    .send({ title: "越权" });
  const archive = await request(app)
    .delete(`/api/chat/sessions/${conversationSessionId}`)
    .set("Authorization", `Bearer ${studentBToken}`);
  const before = await countMessages(conversationSessionId, studentA);
  const send = await request(app)
    .post("/api/chat")
    .set("Authorization", `Bearer ${studentBToken}`)
    .send({ sessionId: conversationSessionId, message: "越权消息" });
  const after = await countMessages(conversationSessionId, studentA);
  assert.deepEqual([read.status, rename.status, archive.status, send.status], [404, 404, 404, 404]);
  assert.equal(after, before);
  assert.equal(Object.prototype.hasOwnProperty.call(send.body, "studentId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(send.body, "student_id"), false);
});

test("教师 Token 返回 403，未登录返回 401，非法 sessionId 返回安全 400", async () => {
  const teacherResponse = await request(app)
    .get("/api/chat/sessions")
    .set("Authorization", `Bearer ${teacherToken}`);
  const anonymous = await request(app).get("/api/chat/sessions");
  const invalid = await request(app)
    .get("/api/chat/sessions/not-a-number/messages")
    .set("Authorization", `Bearer ${studentAToken}`);
  assert.equal(teacherResponse.status, 403);
  assert.equal(anonymous.status, 401);
  assert.equal(invalid.status, 400);
  assert.equal(JSON.stringify(invalid.body).includes("SELECT"), false);
  assert.equal(JSON.stringify(invalid.body).includes("D:\\"), false);
});

test("AI 失败时用户消息保留且失败记录不保存内部错误", async () => {
  const session = await sessions.createSession(studentA);
  const response = await request(app)
    .post("/api/chat")
    .set("Authorization", `Bearer ${studentAToken}`)
    .send({ sessionId: session.id, message: "TCP为什么是三次握手？" });
  assert.equal(response.status, 503);
  assert.equal(response.body.error, "AI_SERVICE_UNAVAILABLE");
  assert.equal(response.body.sessionId, session.id);
  const [rows] = await pool.query(
    "SELECT role, content_text, answer_json, status, error_code FROM chat_messages WHERE session_id=? AND student_id=? ORDER BY id",
    [session.id, studentA],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].role, "user");
  assert.equal(rows[0].status, "completed");
  assert.equal(rows[1].role, "assistant");
  assert.equal(rows[1].status, "failed");
  assert.equal(rows[1].error_code, "AI_SERVICE_UNAVAILABLE");
  assert.equal(rows[1].content_text, "当前回答生成失败，请稍后重试。");
  assert.equal(rows[1].answer_json, null);
  assert.equal(/stack|provider|prompt|SPARK_API_KEY/i.test(JSON.stringify(rows)), false);
});

test("sessionId 缺省时自动创建会话且旧 history 非法格式不会崩溃", async () => {
  const before = await countRows("chat_sessions", studentA);
  const response = await request(app)
    .post("/api/chat")
    .set("Authorization", `Bearer ${studentAToken}`)
    .send({ message: "它？", history: "legacy-invalid-history" });
  assert.equal(response.status, 200);
  assert.equal(response.body.sourceMode, "clarification");
  assert.ok(Number.isSafeInteger(response.body.sessionId));
  const after = await countRows("chat_sessions", studentA);
  assert.equal(after, before + 1);
  const restored = await request(app)
    .get(`/api/chat/sessions/${response.body.sessionId}/messages`)
    .set("Authorization", `Bearer ${studentAToken}`);
  assert.equal(restored.body.messages.length, 2);
});

test("归档是软删除、默认列表隐藏且归档会话不能继续聊天", async () => {
  const before = await countMessages(conversationSessionId, studentA);
  const archived = await request(app)
    .delete(`/api/chat/sessions/${conversationSessionId}`)
    .set("Authorization", `Bearer ${studentAToken}`);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.session.status, "archived");
  const activeList = await request(app)
    .get("/api/chat/sessions")
    .set("Authorization", `Bearer ${studentAToken}`);
  assert.equal(
    activeList.body.sessions.some((item) => item.id === conversationSessionId),
    false,
  );
  const archivedList = await request(app)
    .get("/api/chat/sessions?status=archived")
    .set("Authorization", `Bearer ${studentAToken}`);
  assert.equal(
    archivedList.body.sessions.some((item) => item.id === conversationSessionId),
    true,
  );
  const send = await request(app)
    .post("/api/chat")
    .set("Authorization", `Bearer ${studentAToken}`)
    .send({ sessionId: conversationSessionId, message: "归档后追问" });
  assert.equal(send.status, 409);
  assert.equal(await countMessages(conversationSessionId, studentA), before);
  const [[record]] = await pool.query("SELECT status FROM chat_sessions WHERE id=? AND student_id=?", [
    conversationSessionId,
    studentA,
  ]);
  assert.equal(record.status, "archived");
});

test.after(async () => {
  await pool.end().catch(() => undefined);
  const server = await mysql
    .createConnection({
      host: databaseConfig.host,
      port: databaseConfig.port,
      user: databaseConfig.user,
      password: databaseConfig.password,
      charset: "utf8mb4",
    })
    .catch(() => null);
  if (server) {
    if (!/^learnmate_chat_test_[A-Za-z0-9_]+$/.test(databaseName))
      throw new Error("unsafe test database name");
    await server.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await server.end();
  }
});

async function insertUser(username, role) {
  const [result] = await pool.query(
    "INSERT INTO users(student_no, username, display_name, password_hash, role, is_demo) VALUES(?,?,?,?,?,0)",
    [`CHAT-${username}`, username, username, "test-only-password-hash", role],
  );
  return Number(result.insertId);
}

async function prepareLegacyChatTable() {
  const server = await mysql.createConnection({
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    password: databaseConfig.password,
    charset: "utf8mb4",
  });
  if (!/^learnmate_chat_test_[A-Za-z0-9_]+$/.test(databaseName)) throw new Error("unsafe test database name");
  await server.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await server.end();
  const legacy = await mysql.createConnection({
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    password: databaseConfig.password,
    database: databaseName,
    charset: "utf8mb4",
  });
  await legacy.query(`CREATE TABLE chat_messages (
    id INT NOT NULL AUTO_INCREMENT,
    student_id INT NOT NULL,
    conversation_id VARCHAR(100) NOT NULL,
    role ENUM('user','ai') NOT NULL,
    content TEXT NOT NULL,
    knowledge_points JSON NULL,
    resources JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_conv (student_id, conversation_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await legacy.query(
    "INSERT INTO chat_messages(student_id, conversation_id, role, content) VALUES(999, 'legacy-conversation', 'ai', 'legacy public answer')",
  );
  await legacy.end();
}

function signToken(id, role) {
  return jwt.sign(
    { userId: id, role, ...(role === "STUDENT" ? { studentId: id } : { teacherId: id }) },
    process.env.JWT_SECRET,
    { subject: String(id), expiresIn: "10m" },
  );
}

function publicAnswer(messageId, answerMarkdown) {
  return {
    messageId,
    answerMarkdown,
    sourceMode: "model_only",
    subject: "数据结构",
    knowledgePoint: "红黑树旋转",
    knowledgeNotice: "本回答使用模型通识知识，暂未引用本地课程资料。",
    citations: [{ label: "S1", chunkId: 1, sourceTitle: "公开资料", apiKey: "SPARK_API_KEY=do-not-store" }],
    codeBlocks: [],
    followups: ["继续比较左右旋？", "需要完整代码吗？"],
    profileSuggestions: [],
    trace: {
      collapsed: true,
      summary: "公开摘要",
      steps: [{ name: "TutorAgent", status: "completed", prompt: "system prompt do-not-store" }],
    },
    modelAvailable: true,
    quality: {
      passed: true,
      characterCount: answerMarkdown.length,
      sectionCount: 1,
      codeBlockCount: 0,
      exampleCount: 1,
      misconceptionCount: 3,
      practiceCount: 1,
      issues: [],
      providerResponse: "do-not-store",
    },
    parts: [{ hiddenReasoning: "do-not-store" }],
    systemPrompt: "do-not-store",
    providerRequest: { Authorization: "Bearer do-not-store" },
    learnerContext: { databaseRows: ["do-not-store"] },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invokeHandler(handler, req) {
  const res = responseRecorder();
  let forwardedError = null;
  await handler(req, res, (error) => {
    forwardedError = error;
  });
  if (forwardedError) throw forwardedError;
  return res;
}

async function countRows(table, studentId) {
  if (!new Set(["chat_sessions", "chat_messages"]).has(table)) throw new Error("unsafe table name");
  const [[row]] = await pool.query(`SELECT COUNT(*) count FROM \`${table}\` WHERE student_id=?`, [studentId]);
  return Number(row.count);
}

async function countMessages(sessionId, studentId) {
  const [[row]] = await pool.query(
    "SELECT COUNT(*) count FROM chat_messages WHERE session_id=? AND student_id=?",
    [sessionId, studentId],
  );
  return Number(row.count);
}
