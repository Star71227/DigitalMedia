/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const { isTeacherRegistrationEnabled } = require("../config/runtimeConfig");

const REGISTRATION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS = 30;
const registrationAttempts = new Map();

async function authenticate(identifier, password) {
  const normalizedIdentifier = String(identifier || "").trim();
  const normalizedPassword = String(password || "");

  if (
    !normalizedIdentifier ||
    normalizedIdentifier.length > 100 ||
    !normalizedPassword ||
    normalizedPassword.length > 200
  ) {
    const error = new Error("用户名或密码错误");
    error.statusCode = 401;
    throw error;
  }

  const [rows] = await pool.query(
    `SELECT id, student_no, username, display_name, password_hash, COALESCE(role, 'STUDENT') AS role
       FROM users
      WHERE student_no = ? OR username = ?
      LIMIT 1`,
    [normalizedIdentifier, normalizedIdentifier],
  );
  const user = rows[0];
  const valid = user ? await bcrypt.compare(normalizedPassword, user.password_hash) : false;

  if (!valid) {
    const error = new Error("用户名或密码错误");
    error.statusCode = 401;
    throw error;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    const error = new Error("JWT_SECRET 未配置或长度不足");
    error.statusCode = 503;
    throw error;
  }

  const role = String(user.role || "STUDENT").toUpperCase();
  const identityClaims =
    role === "STUDENT"
      ? { studentId: Number(user.id) }
      : role === "TEACHER"
        ? { teacherId: Number(user.id) }
        : {};
  const token = jwt.sign(
    { userId: Number(user.id), username: user.username, studentNo: user.student_no, role, ...identityClaims },
    secret,
    { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
  );

  return {
    token,
    user: {
      id: user.id,
      ...(role === "STUDENT" ? { studentId: user.id } : {}),
      ...(role === "TEACHER" ? { teacherId: user.id } : {}),
      studentNo: user.student_no,
      username: user.username,
      displayName: user.display_name,
      role,
    },
  };
}

async function registerStudent(input = {}, options = {}) {
  const registration = normalizeRegistrationInput(input);
  if (options.rateLimitKey) consumeRegistrationRateLimit(options.rateLimitKey);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT id FROM users WHERE username = ? OR student_no = ? LIMIT 1 FOR UPDATE",
      [registration.username, registration.username],
    );
    if (existing.length) throw registrationConflict();

    const passwordHash = await bcrypt.hash(registration.password, 10);
    const [userResult] = await connection.query(
      `INSERT INTO users (student_no, username, display_name, password_hash, role, is_demo)
       VALUES (?, ?, ?, ?, 'STUDENT', 0)`,
      [registration.username, registration.username, registration.name, passwordHash],
    );
    const userId = Number(userResult.insertId);
    await connection.query("INSERT INTO student_profiles (student_id) VALUES (?)", [userId]);
    await connection.commit();

    return {
      username: registration.username,
      name: registration.name,
      role: "STUDENT",
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (isDuplicateError(error)) throw registrationConflict();
    throw error;
  } finally {
    connection.release();
  }
}

async function registerTeacher(input = {}, options = {}) {
  const registration = normalizeRegistrationInput(input);
  if (options.rateLimitKey) consumeRegistrationRateLimit(options.rateLimitKey);
  if (!isTeacherRegistrationEnabled()) {
    throw requestError("教师注册未开放，请联系平台管理员", 403, "TEACHER_REGISTRATION_DISABLED");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT id FROM users WHERE username = ? OR student_no = ? LIMIT 1 FOR UPDATE",
      [registration.username, registration.username],
    );
    if (existing.length) throw registrationConflict();

    const passwordHash = await bcrypt.hash(registration.password, 10);
    await connection.query(
      `INSERT INTO users (student_no, username, display_name, password_hash, role, is_demo)
       VALUES (?, ?, ?, ?, 'TEACHER', 0)`,
      [registration.username, registration.username, registration.name, passwordHash],
    );
    await connection.commit();

    return { username: registration.username, name: registration.name, role: "TEACHER" };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (isDuplicateError(error)) throw registrationConflict();
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeRegistrationInput(input) {
  const rawUsername = input.username ?? input.studentNo ?? input.identifier;
  const username = String(rawUsername ?? "").trim();
  const name = String(input.name ?? input.displayName ?? "").trim();
  const password = typeof input.password === "string" ? input.password : "";
  const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";

  if (!/^[A-Za-z0-9_-]{4,32}$/.test(username)) {
    throw requestError("用户名或学号需为4至32位字母、数字、下划线或连字符", 400, "INVALID_USERNAME");
  }
  if (Array.from(name).length < 2 || Array.from(name).length > 30) {
    throw requestError("姓名长度需为2至30个字符", 400, "INVALID_NAME");
  }
  assertPasswordStrength(password, confirmPassword);

  return { username, name, password };
}

/* 注册 / 改密共用同一套密码强度要求 */
function assertPasswordStrength(password, confirmPassword) {
  if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw requestError("密码需为8至64位，并同时包含字母和数字", 400, "INVALID_PASSWORD");
  }
  if (typeof confirmPassword === "string" && password !== confirmPassword) {
    throw requestError("两次输入的密码不一致", 400, "PASSWORD_MISMATCH");
  }
}

/* ---------------------------------------------------------------- 账号安全 ---- */
async function loadAccount(userId) {
  const [rows] = await pool.query(
    `SELECT id, student_no, username, display_name, password_hash,
            COALESCE(role, 'STUDENT') AS role, COALESCE(is_demo, 0) AS is_demo
       FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

/* 内置账号是给课堂现场用的（zhangsan / teacher_demo 等），不允许改密或注销 */
function requireUsableAccount(user, action) {
  if (!user) throw requestError("登录用户不存在，请重新登录", 401, "AUTH_INVALID");
  if (Number(user.is_demo) === 1) {
    throw requestError(`该账号不支持${action}`, 403, "DEMO_ACCOUNT_PROTECTED");
  }
  return user;
}

async function changePassword(userId, input = {}) {
  const user = requireUsableAccount(await loadAccount(userId), "修改密码");
  const currentPassword = String(input.currentPassword ?? input.oldPassword ?? "");
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : newPassword;

  if (!currentPassword) throw requestError("请输入当前密码", 400, "CURRENT_PASSWORD_REQUIRED");
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw requestError("当前密码不正确", 400, "CURRENT_PASSWORD_WRONG");
  assertPasswordStrength(newPassword, confirmPassword);
  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw requestError("新密码不能与当前密码相同", 400, "PASSWORD_UNCHANGED");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, user.id]);
  return { username: user.username, displayName: user.display_name };
}

/**
 * 注销账号：账号立刻不可再用，身份信息匿名化。
 * 学习记录（提交、会话等）保留，但它们已不再挂在任何可登录的账号上，
 * 这样同班同学的成绩统计不会因为一个人注销而缺行。
 */
async function deactivateAccount(userId, input = {}) {
  const user = requireUsableAccount(await loadAccount(userId), "注销账号");
  const password = String(input.password ?? "");
  if (!password) throw requestError("请输入登录密码以确认注销", 400, "PASSWORD_REQUIRED");
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw requestError("密码不正确，无法注销", 400, "PASSWORD_WRONG");
  if (String(input.confirm ?? "").trim() !== "注销") {
    throw requestError("请输入「注销」两个字以确认", 400, "CONFIRM_REQUIRED");
  }

  const scrambled = `deleted_${user.id}_${Date.now()}`;
  const randomHash = await bcrypt.hash(`${user.id}-${Date.now()}-${Math.random()}`, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE users
          SET student_no = ?, username = ?, display_name = ?, password_hash = ?, is_demo = 0
        WHERE id = ?`,
      [scrambled, scrambled, "已注销用户", randomHash, user.id],
    );
    /* 个人档案里的可识别信息一并清空 */
    await connection
      .query(
        `UPDATE student_profiles
            SET major = NULL, grade = NULL, current_course = NULL,
                prior_knowledge_json = NULL, learning_goals_json = NULL,
                explanation_preference = NULL, resource_preferences_json = NULL,
                pace_preference = NULL, weekly_time_budget_minutes = NULL,
                field_meta_json = NULL
          WHERE student_id = ?`,
        [user.id],
      )
      .catch(() => undefined);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }

  return { username: user.username };
}

function consumeRegistrationRateLimit(key) {
  const normalizedKey = String(key || "unknown").slice(0, 120);
  const now = Date.now();
  const stored = registrationAttempts.get(normalizedKey);
  const current =
    stored && now - stored.startedAt < REGISTRATION_RATE_LIMIT_WINDOW_MS
      ? stored
      : { startedAt: now, count: 0 };
  current.count += 1;
  registrationAttempts.set(normalizedKey, current);
  if (current.count > REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS) {
    throw requestError("注册请求过于频繁，请稍后再试", 429, "RATE_LIMITED");
  }
}

function isDuplicateError(error) {
  return error?.code === "ER_DUP_ENTRY" || Number(error?.errno) === 1062;
}

function registrationConflict() {
  return requestError("用户名或学号已存在", 409, "USERNAME_TAKEN");
}

function requestError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = { authenticate, registerStudent, registerTeacher, changePassword, deactivateAccount };
