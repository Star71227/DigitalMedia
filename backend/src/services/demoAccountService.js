/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const bcrypt = require("bcryptjs");

const ALLOWED_ROLES = new Set(["STUDENT", "TEACHER"]);

async function assertDemoAccountsAvailable(db, accounts) {
  if (!Array.isArray(accounts) || !accounts.length)
    throw demoCollision("demo account specification is empty");
  const normalized = accounts.map((account) => ({
    studentNo: String(account.studentNo || "").trim(),
    username: String(account.username || "").trim(),
  }));
  if (normalized.some((account) => !account.studentNo || !account.username)) {
    throw demoCollision("demo account specification is invalid");
  }
  const usernames = normalized.map((account) => account.username);
  const studentNos = normalized.map((account) => account.studentNo);
  const placeholders = (values) => values.map(() => "?").join(",");
  const [rows] = await db.query(
    `SELECT id,student_no,username,is_demo FROM users
      WHERE username IN (${placeholders(usernames)}) OR student_no IN (${placeholders(studentNos)})`,
    [...usernames, ...studentNos],
  );
  for (const row of rows) {
    const expected = normalized.find(
      (account) => account.username === row.username || account.studentNo === row.student_no,
    );
    const exactIdentity =
      expected && expected.username === row.username && expected.studentNo === row.student_no;
    if (!exactIdentity || Number(row.is_demo) !== 1) {
      throw demoCollision(
        `reserved demo identity ${row.username || row.student_no} already belongs to another user`,
      );
    }
  }
  return true;
}

async function registerLegacyDemoAccounts(db, { accounts, password }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const usernames = accounts.map((account) => account.username);
    const studentNos = accounts.map((account) => account.studentNo);
    const placeholders = (values) => values.map(() => "?").join(",");
    const [rows] = await connection.query(
      `SELECT id,student_no,username,password_hash,COALESCE(role,'STUDENT') role,is_demo
         FROM users
        WHERE username IN (${placeholders(usernames)}) OR student_no IN (${placeholders(studentNos)})
        FOR UPDATE`,
      [...usernames, ...studentNos],
    );
    const adopted = [];
    for (const row of rows) {
      const expected = accounts.find(
        (account) => account.username === row.username || account.studentNo === row.student_no,
      );
      const exactIdentity =
        expected && expected.username === row.username && expected.studentNo === row.student_no;
      if (!exactIdentity)
        throw demoCollision(`reserved demo identity ${row.username || row.student_no} is split across users`);
      if (Number(row.is_demo) === 1) continue;
      const passwordMatches = row.password_hash
        ? await bcrypt.compare(password, row.password_hash).catch(() => false)
        : false;
      if (!passwordMatches || String(row.role).toUpperCase() !== String(expected.role).toUpperCase()) {
        throw demoCollision(`existing account ${row.username} does not match the legacy demo evidence`);
      }
      adopted.push({ id: Number(row.id), username: row.username });
    }
    for (const account of adopted) {
      await connection.query("UPDATE users SET is_demo=1 WHERE id=? AND is_demo=0", [account.id]);
    }
    if (adopted.length) {
      await connection.query(
        `INSERT INTO agent_run_logs(agent_name,task_type,input_text,output_text,status,source)
         VALUES('DemoDataOperator','legacy_demo_adoption',?,?,'success','operator')`,
        [
          JSON.stringify({ confirmationProvided: true, matchedAccountCount: adopted.length }),
          JSON.stringify({
            adoptedAccountCount: adopted.length,
            usernames: adopted.map((account) => account.username),
          }),
        ],
      );
    }
    await connection.commit();
    return { adoptedCount: adopted.length, usernames: adopted.map((account) => account.username) };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function ensureDemoAccount(db, { studentNo, username, displayName, role, password }) {
  const normalizedRole = String(role || "").toUpperCase();
  if (!ALLOWED_ROLES.has(normalizedRole)) throw demoCollision("unsupported demo role");

  const [rows] = await db.query(
    `SELECT id,student_no,username,password_hash,COALESCE(role,'STUDENT') role,is_demo
       FROM users WHERE username=? OR student_no=? ORDER BY id LIMIT 2`,
    [username, studentNo],
  );
  if (rows.length > 1)
    throw demoCollision(`reserved demo identity ${username} is split across multiple users`);

  const existing = rows[0];
  if (!existing) {
    const hash = await bcrypt.hash(password, 10);
    try {
      const [result] = await db.query(
        `INSERT INTO users (student_no,username,display_name,password_hash,role,is_demo)
         VALUES (?,?,?,?,?,1)`,
        [studentNo, username, displayName, hash, normalizedRole],
      );
      return { id: Number(result.insertId), created: true, adopted: false };
    } catch (error) {
      if (error?.code === "ER_DUP_ENTRY")
        throw demoCollision(`reserved demo identity ${username} already belongs to another user`);
      throw error;
    }
  }

  const identityMatches = existing.username === username && existing.student_no === studentNo;
  if (!identityMatches)
    throw demoCollision(`reserved demo identity ${username} already belongs to another user`);

  const registered = Number(existing.is_demo) === 1;
  if (!registered) {
    throw demoCollision(`existing account ${username} is not owned by the competition demo`);
  }

  const passwordMatches = existing.password_hash
    ? await bcrypt.compare(password, existing.password_hash).catch(() => false)
    : false;
  const hash = passwordMatches ? existing.password_hash : await bcrypt.hash(password, 10);
  await db.query(`UPDATE users SET student_no=?,display_name=?,password_hash=?,role=?,is_demo=1 WHERE id=?`, [
    studentNo,
    displayName,
    hash,
    normalizedRole,
    existing.id,
  ]);
  return { id: Number(existing.id), created: false, adopted: false };
}

function demoCollision(message) {
  const error = new Error(message);
  error.code = "DEMO_ACCOUNT_COLLISION";
  return error;
}

module.exports = { ensureDemoAccount, assertDemoAccountsAvailable, registerLegacyDemoAccounts };
