/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { seedDemoUsers, seedRedBlackTreeDemo } = require("../config/initLearningProfileDB");
const { seedTeacherDemo } = require("../config/initTeacherAnalyticsDB");
const { importBundledKnowledgeBase } = require("./knowledgeBootstrapService");
const { submitQuiz, reconcileQuizAttemptDerivedState } = require("./quizSubmissionService");
const { createOrAdjustLearningPath, getCurrentLearningPath } = require("./learningPathService");
const { generateResource, getResource, openResource } = require("./resourceGenerationService");
const { generateGroundedAnswer } = require("./groundedAnswerService");
const { getExercisePrivateConfig } = require("./codeExerciseService");
const { judgeSubmission } = require("./codeJudgeService");
const { saveCodeSubmission } = require("./codeSubmissionService");
const teacherReports = require("./teacherReportService");
const teacherAccess = require("./teacherAccessService");
const { checkStorage } = require("./healthService");
const { verifyPdfDependencies } = require("./assessmentPdfService");
const resourceStorage = require("./resourceStorageService");
const reportStorage = require("./teacherReportStorageService");
const { validatePptxFile } = require("./pptxService");
const { isMissingOrPlaceholder, normalizeNodeEnv } = require("../config/runtimeConfig");
const { assertDemoAccountsAvailable, registerLegacyDemoAccounts } = require("./demoAccountService");

const DEMO_USERNAMES = ["teacher_demo", "zhangsan", "lisi", "wangwu"];
const REQUIRED_STUDENT_USERNAMES = ["zhangsan", "lisi"];
const RESET_CONFIRMATION = "RESET_LEARNMATE_DEMO";
const LEGACY_ADOPT_CONFIRMATION = "ADOPT_LEARNMATE_LEGACY_DEMO";
const DEMO_QUIZ_KEY = "competition-demo-quiz-v1";
const DEMO_CODE_QUESTION_ID = "DS-RBT-ROTATE-001";
const DEMO_CODE_EXERCISE_ID = "DS_CODE_RBT_001";
const DEMO_RESOURCE_TYPES = ["study_note", "mind_map", "pptx", "quiz_pack", "code_case"];
const DEMO_ACCOUNT_SPECS = [
  { studentNo: "TEACHER-DEMO", username: "teacher_demo", role: "TEACHER" },
  { studentNo: "20260001", username: "zhangsan", role: "STUDENT" },
  { studentNo: "20260002", username: "lisi", role: "STUDENT" },
  { studentNo: "20260003", username: "wangwu", role: "STUDENT" },
];

async function seedCompetitionDemo(options = {}) {
  const db = options.db || pool;
  assertPrimaryPool(db);
  return withDemoLock(db, () => seedCompetitionDemoUnlocked({ ...options, db }));
}

async function seedCompetitionDemoUnlocked({ db = pool, importKnowledge = true } = {}) {
  assertDemoPassword(process.env.DEMO_PASSWORD);
  // Check every reserved identity before the first seed/import write. A normal account
  // is never silently converted into resettable demo data, even if its password matches.
  await assertDemoAccountsAvailable(db, DEMO_ACCOUNT_SPECS);
  if (importKnowledge) await importBundledKnowledgeBase({ db });
  await seedDemoUsers(db);
  await seedTeacherDemo(db);
  await seedRedBlackTreeDemo(db);

  const users = await loadDemoUsers(db);
  const student = users.get("zhangsan");
  if (!student) throw demoError("zhangsan was not created", "DEMO_STUDENT_MISSING");
  await ensureDemoPlanningProfile(db, student.id);

  await submitQuiz({
    studentId: student.id,
    idempotencyKey: DEMO_QUIZ_KEY,
    subject: "数据结构",
    answers: [{ questionId: "DS-RBT-ROTATE-001", answer: "B", durationSeconds: 34 }],
    startedAt: new Date(Date.now() - 60_000),
    submittedAt: new Date(),
  });
  await reconcileQuizAttemptDerivedState({ studentId: student.id, idempotencyKey: DEMO_QUIZ_KEY });

  let learningPath = await getCurrentLearningPath(student.id);
  if (!learningPath) {
    learningPath = await createOrAdjustLearningPath({
      studentId: student.id,
      reason: "比赛数据初始化",
      sourceType: "demo_seed",
      sourceEventId: "competition-demo-path-v1",
      candidateOverride: buildDemoLearningPathCandidate(),
    });
  }
  let stage = findDemoPathStage(learningPath);
  if (!stage) {
    learningPath = await createOrAdjustLearningPath({
      studentId: student.id,
      reason: "修复比赛学习路径",
      sourceType: "demo_seed",
      candidateOverride: buildDemoLearningPathCandidate(),
    });
    stage = findDemoPathStage(learningPath);
  }
  if (!stage) throw demoError("The demo learning path has no usable stage", "DEMO_PATH_STAGE_MISSING");
  const resourceInput = {
    studentId: student.id,
    subject: stage.subject,
    knowledgePoint: stage.knowledgePoints[0],
    stageKey: stage.key,
    pathVersion: learningPath.version,
  };
  const resources = new Map();
  for (const resourceType of DEMO_RESOURCE_TYPES) {
    resources.set(resourceType, await ensureDemoResource(db, { ...resourceInput, resourceType }));
  }
  const mindMap = resources.get("mind_map");
  if (mindMap?.id && mindMap.progress?.status === "not_started") await openResource(student.id, mindMap.id);

  await ensureDemoCodeSubmission(db, student.id);
  const teacher = users.get("teacher_demo");
  if (!teacher) throw demoError("teacher_demo was not created", "DEMO_TEACHER_MISSING");

  const [[chatEvidence]] = await db.query(
    `SELECT
    (SELECT COUNT(*) FROM generation_citations WHERE student_id=? AND generation_type='chat_answer') citation_count,
    (SELECT COUNT(*) FROM knowledge_retrieval_runs WHERE student_id=? AND request_type='chat' AND result_count>0) retrieval_count`,
    [student.id, student.id],
  );
  if (!Number(chatEvidence.citation_count) || !Number(chatEvidence.retrieval_count)) {
    await generateGroundedAnswer(db, {
      studentId: student.id,
      subject: "数据结构",
      knowledgePoint: "红黑树旋转",
      query: "红黑树左旋如何保持二叉搜索树的次序？",
      topK: 5,
      minimumScore: 0.05,
    });
  }

  // Generate the report only after every evidence source is stable; otherwise the
  // first retry would legitimately see a different snapshot and create V2.
  await teacherReports.createReport({ userId: teacher.id, role: "TEACHER" }, student.id, {
    reportType: "period_assessment",
    rangeDays: 30,
  });

  const summary = await collectDemoSummary(db);
  return { seeded: true, ...summary };
}

async function adoptLegacyCompetitionDemo({ db = pool, env = process.env } = {}) {
  assertPrimaryPool(db);
  if (env.DEMO_ADOPT_LEGACY_CONFIRM !== LEGACY_ADOPT_CONFIRMATION) {
    throw demoError(
      `Set DEMO_ADOPT_LEGACY_CONFIRM=${LEGACY_ADOPT_CONFIRMATION} to register legacy demo accounts`,
      "DEMO_LEGACY_ADOPT_CONFIRMATION_REQUIRED",
    );
  }
  assertDemoPassword(env.DEMO_PASSWORD, env);
  return withDemoLock(db, () =>
    registerLegacyDemoAccounts(db, {
      accounts: DEMO_ACCOUNT_SPECS,
      password: String(env.DEMO_PASSWORD).trim(),
    }),
  );
}

async function verifyCompetitionDemo({ db = pool, checkPdfDependencies = true } = {}) {
  const checks = [];
  const add = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail });
  const users = await loadDemoUsers(db);
  const teacher = users.get("teacher_demo");
  const zhang = users.get("zhangsan");
  const li = users.get("lisi");
  add("teacher-account", teacher?.role === "TEACHER", teacher ? `role=${teacher.role}` : "missing");
  add(
    "student-accounts",
    Boolean(zhang && li && zhang.role === "STUDENT" && li.role === "STUDENT"),
    `${[zhang, li].filter(Boolean).length}/2 present`,
  );
  const demoPassword = String(process.env.DEMO_PASSWORD || "");
  const credentialChecks = await Promise.all(
    [teacher, zhang, li]
      .filter(Boolean)
      .map((user) => bcrypt.compare(demoPassword, user.passwordHash || "").catch(() => false)),
  );
  add(
    "login-credentials",
    credentialChecks.length === 3 && credentialChecks.every(Boolean),
    `${credentialChecks.filter(Boolean).length}/3 credentials verified`,
  );

  const relationCount =
    teacher && zhang && li
      ? await count(
          db,
          `SELECT COUNT(DISTINCT tcs.student_id) count
    FROM teacher_class_students tcs JOIN teacher_classes tc ON tc.id=tcs.class_id AND tc.teacher_id=tcs.teacher_id
    WHERE tcs.teacher_id=? AND tcs.student_id IN (?,?) AND tcs.status='active' AND tc.status='active'
      AND tc.class_name='数据结构 1班'`,
          [teacher.id, zhang.id, li.id],
        )
      : 0;
  add("teacher-class-relations", relationCount === 2, `${relationCount}/2 active`);

  const profileCount = zhang
    ? await count(
        db,
        "SELECT COUNT(*) count FROM student_profiles WHERE student_id=? AND current_version>=1",
        [zhang.id],
      )
    : 0;
  add("profile", profileCount >= 1, `${profileCount} current profile`);
  const quizCount = zhang
    ? await count(db, "SELECT COUNT(*) count FROM quiz_attempts WHERE student_id=? AND idempotency_key=?", [
        zhang.id,
        DEMO_QUIZ_KEY,
      ])
    : 0;
  add("quiz", quizCount === 1, `${quizCount} idempotent attempt`);
  const masteryCount = zhang
    ? await count(db, "SELECT COUNT(*) count FROM student_knowledge_mastery WHERE student_id=?", [zhang.id])
    : 0;
  const errorCount = zhang
    ? await count(db, "SELECT COUNT(*) count FROM student_error_patterns WHERE student_id=?", [zhang.id])
    : 0;
  add(
    "mastery-and-errors",
    masteryCount >= 1 && errorCount >= 1,
    `${masteryCount} mastery, ${errorCount} error patterns`,
  );
  const pathCount = zhang
    ? await count(
        db,
        `SELECT COUNT(*) count FROM student_learning_paths p
    JOIN learning_path_versions v ON v.student_id=p.student_id AND v.version=p.current_version WHERE p.student_id=?`,
        [zhang.id],
      )
    : 0;
  add("learning-path", pathCount === 1, `${pathCount} readable current path`);

  const resourceRows = zhang
    ? await db
        .query(
          `SELECT r.resource_type,r.status,COUNT(f.id) file_count
    FROM learning_resources r LEFT JOIN learning_resource_files f ON f.resource_id=r.id AND f.resource_version=r.current_version
    WHERE r.student_id=? GROUP BY r.id,r.resource_type,r.status`,
          [zhang.id],
        )
        .then(([rows]) => rows)
    : [];
  const resourceTypes = new Set(
    resourceRows.filter((row) => row.status === "approved").map((row) => row.resource_type),
  );
  let pptxFileValid = false;
  if (zhang) {
    const [pptxFiles] = await db.query(
      `SELECT f.storage_path,f.file_size,f.checksum_sha256,v.content_json,v.review_json
      FROM learning_resource_files f
      JOIN learning_resources r ON r.id=f.resource_id AND r.current_version=f.resource_version
      JOIN learning_resource_versions v ON v.resource_id=r.id AND v.student_id=f.student_id AND v.version=f.resource_version
      WHERE f.student_id=? AND f.file_type='pptx' AND r.status='approved'`,
      [zhang.id],
    );
    for (const pptxFile of pptxFiles) {
      if (await verifyPptxFile(pptxFile)) {
        pptxFileValid = true;
        break;
      }
    }
  }
  const hasPptx =
    resourceRows.some(
      (row) => row.resource_type === "pptx" && row.status === "approved" && Number(row.file_count) >= 1,
    ) && pptxFileValid;
  const allResourceTypes = DEMO_RESOURCE_TYPES.every((resourceType) => resourceTypes.has(resourceType));
  add(
    "learning-resources",
    allResourceTypes && hasPptx,
    `${resourceRows.length} resources; types=${[...resourceTypes].sort().join(",")}; pptx=${hasPptx}`,
  );
  const progressCount = zhang
    ? await count(db, "SELECT COUNT(*) count FROM learning_resource_progress WHERE student_id=?", [zhang.id])
    : 0;
  add("resource-progress", progressCount >= 2, `${progressCount} progress records`);

  const successfulCodeCount = zhang
    ? await count(
        db,
        `SELECT COUNT(*) count FROM code_submissions s
    JOIN code_exercises e ON e.exercise_id=s.exercise_id
    WHERE s.student_id=? AND s.mode='submit' AND s.status='accepted' AND s.execution_mode='docker' AND e.path_completion_eligible=1`,
        [zhang.id],
      )
    : 0;
  const executionModeDetail =
    process.env.CODE_EXECUTION_MODE === "docker"
      ? "executionMode=docker"
      : "code_execution=false; reason=runner_unavailable";
  add(
    "codelab-success",
    successfulCodeCount >= 1,
    `${successfulCodeCount} eligible accepted docker submissions; ${executionModeDetail}`,
  );

  const approvedReportCount = zhang
    ? await count(
        db,
        `SELECT COUNT(*) count FROM learning_assessment_reports
    WHERE student_id=? AND status='approved' AND storage_path IS NOT NULL AND checksum_sha256 IS NOT NULL`,
        [zhang.id],
      )
    : 0;
  add("approved-assessment-report", approvedReportCount >= 1, `${approvedReportCount} approved reports`);

  const activeSources = await count(db, "SELECT COUNT(*) count FROM knowledge_sources WHERE status='active'");
  const activeChunks = await count(
    db,
    "SELECT COUNT(*) count FROM knowledge_chunks WHERE status='active' AND safety_status='safe'",
  );
  add(
    "knowledge-base",
    activeSources >= 15 && activeChunks >= 150,
    `${activeSources} sources, ${activeChunks} safe chunks`,
  );
  const retrievalCount = zhang
    ? await count(db, "SELECT COUNT(*) count FROM knowledge_retrieval_runs WHERE student_id=?", [zhang.id])
    : 0;
  const citationCount = zhang
    ? await count(db, "SELECT COUNT(*) count FROM generation_citations WHERE student_id=?", [zhang.id])
    : 0;
  add(
    "rag-and-citations",
    retrievalCount >= 1 && citationCount >= 1,
    `${retrievalCount} retrievals, ${citationCount} citations`,
  );

  let teacherAccessOk = false;
  let studentDenied = false;
  if (teacher && zhang) {
    try {
      await teacherAccess.assertTeacherCanAccessStudent({ userId: teacher.id, role: "TEACHER" }, zhang.id);
      teacherAccessOk = true;
    } catch {
      teacherAccessOk = false;
    }
  }
  try {
    teacherAccess.assertTeacherRole({ userId: zhang?.id, role: "STUDENT" });
  } catch {
    studentDenied = true;
  }
  add(
    "access-policy",
    teacherAccessOk && studentDenied,
    `teacherAccess=${teacherAccessOk}; studentDenied=${studentDenied}`,
  );

  let pdfReady = true;
  if (checkPdfDependencies) {
    try {
      await verifyPdfDependencies();
    } catch {
      pdfReady = false;
    }
  }
  add(
    "pdf-dependencies",
    pdfReady,
    checkPdfDependencies
      ? pdfReady
        ? "browser and CJK font available"
        : "browser or CJK font missing"
      : "not required by this check",
  );
  let storageReady = true;
  try {
    await checkStorage();
  } catch {
    storageReady = false;
  }
  add(
    "storage-writable",
    storageReady,
    storageReady ? "resource and report storage writable" : "storage check failed",
  );

  const passed = checks.every((check) => check.passed);
  return { passed, checks, summary: await collectDemoSummary(db) };
}

function assertResetAllowed(env = process.env) {
  if (normalizeNodeEnv(env.NODE_ENV) === "production") {
    throw demoError("Demo reset is disabled in production", "DEMO_RESET_PRODUCTION_DENIED");
  }
  if (env.DEMO_RESET_CONFIRM !== RESET_CONFIRMATION) {
    throw demoError(
      `Set DEMO_RESET_CONFIRM=${RESET_CONFIRMATION} to reset demo data`,
      "DEMO_RESET_CONFIRMATION_REQUIRED",
    );
  }
  return true;
}

async function resetCompetitionDemo(options = {}) {
  const db = options.db || pool;
  return withDemoLock(db, () => resetCompetitionDemoUnlocked({ ...options, db }));
}

async function resetCompetitionDemoUnlocked({ db = pool, env = process.env } = {}) {
  assertResetAllowed(env);
  const users = await loadDemoUsers(db);
  const studentIds = REQUIRED_STUDENT_USERNAMES.concat("wangwu")
    .map((name) => users.get(name)?.id)
    .filter(Boolean);
  const teacherIds = [users.get("teacher_demo")?.id].filter(Boolean);
  if (!studentIds.length && !teacherIds.length)
    return { reset: true, counts: {}, resourceFiles: 0, reportFiles: 0 };

  const studentSql = studentIds.length ? placeholders(studentIds) : "";
  const teacherSql = teacherIds.length ? placeholders(teacherIds) : "";
  const [resourceFiles] = studentIds.length
    ? await db.query(
        `SELECT storage_path FROM learning_resource_files WHERE student_id IN (${studentSql})`,
        studentIds,
      )
    : [[]];
  const [reportFiles] = studentIds.length
    ? await db.query(
        `SELECT storage_path FROM learning_assessment_reports WHERE student_id IN (${studentSql}) AND storage_path IS NOT NULL`,
        studentIds,
      )
    : [[]];
  const counts = {};
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const remove = async (name, sql, params = []) => {
      const [result] = await connection.query(sql, params);
      counts[name] = Number(result.affectedRows || 0);
    };
    if (studentIds.length) {
      await remove(
        "generationCitations",
        `DELETE FROM generation_citations WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "retrievalResults",
        `DELETE rr FROM knowledge_retrieval_results rr JOIN knowledge_retrieval_runs r ON r.id=rr.retrieval_run_id WHERE r.student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "retrievalRuns",
        `DELETE FROM knowledge_retrieval_runs WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "resourceProgress",
        `DELETE FROM learning_resource_progress WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "resourceStageLinks",
        `DELETE FROM learning_resource_stage_links WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "resourceFiles",
        `DELETE FROM learning_resource_files WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "resourceVersions",
        `DELETE FROM learning_resource_versions WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "resources",
        `DELETE FROM learning_resources WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "pathEvents",
        `DELETE FROM learning_path_adjustment_events WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "pathVersions",
        `DELETE FROM learning_path_versions WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "paths",
        `DELETE FROM student_learning_paths WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "quizAnswers",
        `DELETE a FROM quiz_attempt_answers a JOIN quiz_attempts q ON q.id=a.attempt_id WHERE q.student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "quizAttempts",
        `DELETE FROM quiz_attempts WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "profileMessages",
        `DELETE m FROM profile_dialogue_messages m JOIN profile_dialogue_sessions s ON s.id=m.session_id WHERE s.student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "profileSessions",
        `DELETE FROM profile_dialogue_sessions WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "profileVersions",
        `DELETE FROM student_profile_versions WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "profiles",
        `DELETE FROM student_profiles WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "learningEvents",
        `DELETE FROM student_learning_events WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "errorPatterns",
        `DELETE FROM student_error_patterns WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "mastery",
        `DELETE FROM student_knowledge_mastery WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "wrongQuestions",
        `DELETE FROM wrong_questions WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "codeSubmissions",
        `DELETE FROM code_submissions WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "reports",
        `DELETE FROM learning_assessment_reports WHERE student_id IN (${studentSql})`,
        studentIds,
      );
      await remove(
        "studentAgentLogs",
        `DELETE FROM agent_run_logs WHERE student_id IN (${studentSql})`,
        studentIds,
      );
    }
    if (teacherIds.length || studentIds.length) {
      const clauses = [];
      const params = [];
      if (teacherIds.length) {
        clauses.push(`teacher_id IN (${teacherSql})`);
        params.push(...teacherIds);
      }
      if (studentIds.length) {
        clauses.push(`student_id IN (${studentSql})`);
        params.push(...studentIds);
      }
      await remove(
        "classRelations",
        `DELETE FROM teacher_class_students WHERE ${clauses.join(" OR ")}`,
        params,
      );
    }
    if (teacherIds.length) {
      await remove("classes", `DELETE FROM teacher_classes WHERE teacher_id IN (${teacherSql})`, teacherIds);
    }
    const allIds = [...new Set([...studentIds, ...teacherIds])];
    await remove("users", `DELETE FROM users WHERE id IN (${placeholders(allIds)}) AND is_demo=1`, allIds);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const resourceCleanup = await cleanupStoredFiles(resourceFiles, resourceStorage);
  const reportCleanup = await cleanupStoredFiles(reportFiles, reportStorage);
  return {
    reset: true,
    counts,
    resourceFiles: resourceFiles.length,
    reportFiles: reportFiles.length,
    fileCleanupFailures: resourceCleanup.failed + reportCleanup.failed,
  };
}

async function resetSeedAndVerify({ db = pool, env = process.env } = {}) {
  assertPrimaryPool(db);
  return withDemoLock(db, async () => {
    const reset = await resetCompetitionDemoUnlocked({ db, env });
    const seed = await seedCompetitionDemoUnlocked({ db });
    const verification = await verifyCompetitionDemo({ db });
    if (!verification.passed) throw demoError("Demo verification failed after reset", "DEMO_VERIFY_FAILED");
    if (reset.fileCleanupFailures) {
      throw demoError(
        `Demo data was restored, but ${reset.fileCleanupFailures} old stored files could not be removed`,
        "DEMO_FILE_CLEANUP_FAILED",
      );
    }
    return { reset, seed, verification };
  });
}

async function cleanupStoredFiles(rows, storage) {
  let removed = 0;
  let failed = 0;
  for (const row of rows) {
    let file;
    try {
      file = storage.resolveStoredFile(row.storage_path);
      await fs.rm(file, { force: true });
      removed += 1;
      await pruneEmptyParents(path.dirname(file), storage.STORAGE_ROOT);
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}

async function pruneEmptyParents(directory, root) {
  const normalizedRoot = path.resolve(root);
  let current = path.resolve(directory);
  while (current.startsWith(`${normalizedRoot}${path.sep}`)) {
    try {
      await fs.rmdir(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

async function loadDemoUsers(db) {
  const [rows] = await db.query(
    `SELECT id,username,password_hash,COALESCE(role,'STUDENT') role FROM users WHERE is_demo=1 AND username IN (${placeholders(DEMO_USERNAMES)})`,
    DEMO_USERNAMES,
  );
  return new Map(
    rows.map((row) => [
      row.username,
      { id: Number(row.id), role: String(row.role).toUpperCase(), passwordHash: row.password_hash },
    ]),
  );
}

async function ensureDemoResource(db, input) {
  const [[row]] = await db.query(
    `SELECT id,status,current_version FROM learning_resources
    WHERE student_id=? AND path_version=? AND stage_key=? AND resource_type=? LIMIT 1`,
    [input.studentId, input.pathVersion, input.stageKey, input.resourceType],
  );
  if (row && row.status === "approved" && Number(row.current_version) > 0) {
    try {
      const resource = await getResource(input.studentId, row.id);
      const reviewValid = resource.review && resource.review.status !== "rejected";
      const contentValid = resource.content && typeof resource.content === "object";
      const progressValid = resource.progress && typeof resource.progress.status === "string";
      if (reviewValid && contentValid && progressValid) {
        if (input.resourceType !== "pptx") return resource;
        const [[file]] = await db.query(
          `SELECT f.storage_path,f.file_size,f.checksum_sha256,v.content_json,v.review_json
          FROM learning_resource_files f
          JOIN learning_resource_versions v ON v.resource_id=f.resource_id AND v.student_id=f.student_id AND v.version=f.resource_version
          WHERE f.resource_id=? AND f.student_id=? AND f.resource_version=? AND f.file_type='pptx' LIMIT 1`,
          [row.id, input.studentId, row.current_version],
        );
        if (file && (await verifyPptxFile(file))) return resource;
      }
    } catch {
      /* Regenerate through the validated service below. */
    }
  }
  return generateResource(input, { forceArtifactRepair: Boolean(row) });
}

async function ensureDemoPlanningProfile(db, studentId) {
  await db.query(
    `UPDATE student_profiles p JOIN users u ON u.id=p.student_id
    SET p.current_course='数据结构'
    WHERE p.student_id=? AND u.is_demo=1`,
    [studentId],
  );
}

async function ensureDemoCodeSubmission(db, studentId) {
  const [[existing]] = await db.query(
    `SELECT s.id FROM code_submissions s
    JOIN code_exercises e ON e.exercise_id=s.exercise_id
    WHERE s.student_id=? AND s.mode='submit' AND s.status='accepted' AND s.execution_mode='docker' AND e.path_completion_eligible=1 LIMIT 1`,
    [studentId],
  );
  if (existing) return Number(existing.id);
  // The judge runner requires a local Docker engine; when it is unavailable the demo
  // seed continues without a judged submission (verify reports runner_unavailable).
  if (process.env.CODE_EXECUTION_MODE !== "docker") return null;
  const [[exercise]] = await db.query(`SELECT exercise_id,language FROM code_exercises
    WHERE path_completion_eligible=1 ORDER BY exercise_id LIMIT 1`);
  if (!exercise)
    throw demoError("No path-eligible CodeLab exercise is available", "DEMO_CODE_EXERCISE_MISSING");
  const privateConfig = await getExercisePrivateConfig(exercise.exercise_id);
  if (!privateConfig || !privateConfig.referenceSolution) {
    throw demoError("Demo CodeLab private judge data is missing", "DEMO_CODE_PRIVATE_MISSING");
  }
  const result = await judgeSubmission({
    exerciseId: exercise.exercise_id,
    language: exercise.language,
    sourceCode: privateConfig.referenceSolution,
  });
  if (result.status !== "accepted")
    throw demoError("Demo CodeLab submission did not succeed", "DEMO_CODE_SUBMISSION_FAILED");
  const submission = await saveCodeSubmission({
    studentId,
    exerciseId: exercise.exercise_id,
    language: exercise.language,
    sourceCode: privateConfig.referenceSolution,
    stdin: "",
    result,
    mode: "submit",
    executionMode: result.executionMode,
  });
  return Number(submission.id);
}

function findDemoPathStage(learningPath) {
  const stages = Array.isArray(learningPath?.stages) ? learningPath.stages : [];
  return stages.find(
    (stage) =>
      Array.isArray(stage.codeExerciseIds) &&
      stage.codeExerciseIds.includes(DEMO_CODE_EXERCISE_ID) &&
      Array.isArray(stage.knowledgePoints) &&
      stage.knowledgePoints.length,
  );
}

function buildDemoLearningPathCandidate() {
  return {
    title: "比赛 CodeLab 学习路径",
    stages: [
      {
        key: "stage-1",
        title: "红黑树旋转：真实 CodeLab 判题",
        subject: "数据结构",
        durationMinutes: 45,
        goals: ["掌握红黑树左旋的父子指针更新", "通过受控 Docker CodeLab 完成阶段验收"],
        knowledgePoints: ["红黑树旋转"],
        questionIds: [DEMO_CODE_QUESTION_ID],
        codeExerciseIds: [DEMO_CODE_EXERCISE_ID],
        completion: { type: "codelab", ids: [DEMO_CODE_EXERCISE_ID] },
        dependsOn: [],
      },
    ],
  };
}

async function verifyPptxFile(row) {
  try {
    const absolutePath = resourceStorage.resolveStoredFile(row.storage_path);
    const bytes = await fs.readFile(absolutePath);
    if (bytes.length !== Number(row.file_size) || bytes.subarray(0, 2).toString("ascii") !== "PK")
      return false;
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== String(row.checksum_sha256 || ""))
      return false;
    const content = parseJson(row.content_json);
    const review = parseJson(row.review_json);
    const deck = content.content || {};
    const expectedSlideCount = Array.isArray(deck.slides) ? deck.slides.length : undefined;
    const validation = await validatePptxFile(absolutePath, {
      expectedSlideCount,
      expectedTitles: Array.isArray(deck.slides)
        ? deck.slides.map((slide) => slide?.title).filter(Boolean)
        : [],
    });
    const quality = review.quality || review.pptQuality || {};
    const slideCount = Number(validation.slideCount || 0);
    const notesCount = Number(validation.notesCount || 0);
    const minNotes = Math.ceil(Math.max(0, slideCount - 1) * 0.8);
    return (
      review.status !== "rejected" &&
      quality.passed === true &&
      quality.pptxGenerated === true &&
      quality.pptxValid === true &&
      validation.packageValid === true &&
      slideCount >= 14 &&
      slideCount <= 18 &&
      notesCount >= minNotes &&
      Number(row.file_size) > 10000 &&
      !validation.externalRelationships.length &&
      !validation.relationshipErrorCount &&
      !validation.privateFieldLeakCount
    );
  } catch {
    return false;
  }
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

async function collectDemoSummary(db) {
  const users = await loadDemoUsers(db);
  const zhang = users.get("zhangsan");
  return {
    accounts: users.size,
    quizAttempts: zhang
      ? await count(db, "SELECT COUNT(*) count FROM quiz_attempts WHERE student_id=?", [zhang.id])
      : 0,
    resources: zhang
      ? await count(
          db,
          "SELECT COUNT(*) count FROM learning_resources WHERE student_id=? AND status='approved'",
          [zhang.id],
        )
      : 0,
    resourceVersions: zhang
      ? await count(db, "SELECT COUNT(*) count FROM learning_resource_versions WHERE student_id=?", [
          zhang.id,
        ])
      : 0,
    resourceFiles: zhang
      ? await count(db, "SELECT COUNT(*) count FROM learning_resource_files WHERE student_id=?", [zhang.id])
      : 0,
    resourceProgress: zhang
      ? await count(db, "SELECT COUNT(*) count FROM learning_resource_progress WHERE student_id=?", [
          zhang.id,
        ])
      : 0,
    retrievalRuns: zhang
      ? await count(db, "SELECT COUNT(*) count FROM knowledge_retrieval_runs WHERE student_id=?", [zhang.id])
      : 0,
    citations: zhang
      ? await count(db, "SELECT COUNT(*) count FROM generation_citations WHERE student_id=?", [zhang.id])
      : 0,
    agentLogs: zhang
      ? await count(db, "SELECT COUNT(*) count FROM agent_run_logs WHERE student_id=?", [zhang.id])
      : 0,
    reports: zhang
      ? await count(
          db,
          "SELECT COUNT(*) count FROM learning_assessment_reports WHERE student_id=? AND status='approved'",
          [zhang.id],
        )
      : 0,
  };
}

async function count(db, sql, params = []) {
  const [[row]] = await db.query(sql, params);
  return Number(row?.count || 0);
}

function placeholders(values) {
  if (!values.length) throw demoError("A parameterized list cannot be empty", "EMPTY_DEMO_SCOPE");
  return values.map(() => "?").join(",");
}

function assertDemoPassword(value, env = process.env) {
  const password = String(value || "").trim();
  const minimumLength = normalizeNodeEnv(env.NODE_ENV) === "production" ? 12 : 6;
  if (password.length < minimumLength || isMissingOrPlaceholder(password)) {
    throw demoError(
      `DEMO_PASSWORD must contain at least ${minimumLength} non-placeholder characters`,
      "DEMO_PASSWORD_REQUIRED",
    );
  }
}

async function withDemoLock(db, task) {
  if (!db || typeof db.getConnection !== "function") {
    throw demoError("Demo operations require a MySQL pool", "DEMO_DATABASE_SCOPE_INVALID");
  }
  const connection = await db.getConnection();
  const databaseScope = String(process.env.DB_NAME || "learnmate");
  const digest = crypto.createHash("sha256").update(databaseScope).digest("hex").slice(0, 32);
  const lockName = `learnmate-demo-${digest}`;
  let acquired = false;
  try {
    const [[row]] = await connection.query("SELECT GET_LOCK(?, 15) acquired", [lockName]);
    acquired = Number(row?.acquired) === 1;
    if (!acquired)
      throw demoError("Another demo seed or reset operation is still running", "DEMO_OPERATION_LOCKED");
    return await task();
  } finally {
    if (acquired) await connection.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
    connection.release();
  }
}

function assertPrimaryPool(db) {
  if (db !== pool) {
    throw demoError(
      "Competition demo seeding must use the process primary database pool",
      "DEMO_DATABASE_SCOPE_INVALID",
    );
  }
}

function demoError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  DEMO_USERNAMES,
  RESET_CONFIRMATION,
  LEGACY_ADOPT_CONFIRMATION,
  DEMO_QUIZ_KEY,
  adoptLegacyCompetitionDemo,
  seedCompetitionDemo,
  verifyCompetitionDemo,
  assertResetAllowed,
  assertDemoPassword,
  resetCompetitionDemo,
  resetSeedAndVerify,
  cleanupStoredFiles,
};
