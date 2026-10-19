/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { ensureDemoAccount } = require("../services/demoAccountService");
const { normalizeNodeEnv } = require("./runtimeConfig");
const { seedTrustedCodeCaseExercises } = require("./trustedCodeCaseSeeds");

async function initLearningProfileDB(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT,
      student_no VARCHAR(64) NOT NULL,
      username VARCHAR(100) NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'STUDENT',
      is_demo TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_student_no (student_no),
      UNIQUE KEY uq_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureLegacyUsersCompatibility(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_profiles (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      major VARCHAR(120) NULL,
      grade VARCHAR(60) NULL,
      current_course VARCHAR(160) NULL,
      prior_knowledge_json JSON NULL,
      learning_goals_json JSON NULL,
      explanation_preference VARCHAR(255) NULL,
      resource_preferences_json JSON NULL,
      pace_preference VARCHAR(120) NULL,
      weekly_time_budget_minutes INT NULL,
      field_meta_json JSON NULL,
      profile_completeness DECIMAL(5,4) NOT NULL DEFAULT 0,
      current_version INT NOT NULL DEFAULT 0,
      confirmed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_student_profiles_student (student_id),
      KEY idx_student_profiles_updated (student_id, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureLegacyProfilesCompatibility(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_profile_versions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      version INT NOT NULL,
      snapshot_json JSON NOT NULL,
      change_reason VARCHAR(255) NOT NULL,
      evidence_json JSON NULL,
      source_type VARCHAR(60) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_profile_versions_student_version (student_id, version),
      KEY idx_profile_versions_student_created (student_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_dialogue_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'collecting',
      round_count INT NOT NULL DEFAULT 0,
      draft_profile_json JSON NULL,
      field_meta_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      PRIMARY KEY (id),
      KEY idx_profile_dialogue_student_status (student_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_dialogue_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      session_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      extracted_fields_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_profile_messages_session (session_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_learning_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      subject VARCHAR(120) NULL,
      knowledge_point VARCHAR(160) NULL,
      payload_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_learning_events_student_created (student_id, created_at),
      KEY idx_learning_events_student_type (student_id, event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_error_patterns (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      subject VARCHAR(120) NOT NULL,
      knowledge_point VARCHAR(160) NOT NULL,
      error_type VARCHAR(80) NOT NULL,
      occurrence_count INT NOT NULL DEFAULT 1,
      confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
      latest_evidence_json JSON NULL,
      first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_error_patterns_scope (student_id, subject, knowledge_point, error_type),
      KEY idx_error_patterns_student_recent (student_id, last_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      student_id INT NOT NULL,
      idempotency_key VARCHAR(100) NOT NULL,
      subject VARCHAR(120) NULL,
      score INT NOT NULL,
      correct_count INT NOT NULL,
      total_count INT NOT NULL,
      started_at DATETIME NULL,
      submitted_at DATETIME NOT NULL,
      result_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_quiz_attempt_student_key (student_id, idempotency_key),
      KEY idx_quiz_attempts_student_created (student_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      attempt_id BIGINT UNSIGNED NOT NULL,
      question_id VARCHAR(120) NOT NULL,
      selected_answer VARCHAR(20) NOT NULL,
      correct_answer VARCHAR(20) NOT NULL,
      is_correct TINYINT(1) NOT NULL,
      duration_seconds INT NULL,
      error_type VARCHAR(80) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_attempt_answer_question (attempt_id, question_id),
      KEY idx_attempt_answers_attempt (attempt_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn(pool, "question_bank", "option_error_types", "JSON NULL");
  await ensureColumn(pool, "quiz_attempts", "result_json", "JSON NULL");
  await removeLegacyStudentDefaults(pool);
}

async function ensureColumn(pool, table, column, definition) {
  const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (columns.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function ensureLegacyUsersCompatibility(pool) {
  await ensureColumn(pool, "users", "student_no", "VARCHAR(64) NULL");
  await ensureColumn(pool, "users", "display_name", "VARCHAR(100) NULL");
  await ensureColumn(pool, "users", "password_hash", "VARCHAR(255) NULL");
  await ensureColumn(pool, "users", "role", "VARCHAR(20) NOT NULL DEFAULT 'STUDENT'");
  await ensureColumn(pool, "users", "is_demo", "TINYINT(1) NOT NULL DEFAULT 0");
  const [legacyPassword] = await pool.query("SHOW COLUMNS FROM users LIKE 'password'");
  if (legacyPassword.length) await pool.query("ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL");
  const [legacyRealName] = await pool.query("SHOW COLUMNS FROM users LIKE 'real_name'");
  if (legacyRealName.length) await pool.query("ALTER TABLE users MODIFY COLUMN real_name VARCHAR(100) NULL");
  await pool.query(
    `UPDATE users SET student_no = CONCAT('LEGACY-', id) WHERE student_no IS NULL OR student_no = ''`,
  );
  if (legacyRealName.length) {
    await pool.query(
      `UPDATE users SET display_name = COALESCE(NULLIF(real_name, ''), username) WHERE display_name IS NULL OR display_name = ''`,
    );
  } else {
    await pool.query(
      `UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''`,
    );
  }
  await ensureNamedIndex(
    pool,
    "users",
    "uq_users_student_no",
    "ALTER TABLE users ADD UNIQUE KEY uq_users_student_no (student_no)",
  );
}

async function ensureLegacyProfilesCompatibility(pool) {
  const columns = {
    major: "VARCHAR(120) NULL",
    current_course: "VARCHAR(160) NULL",
    prior_knowledge_json: "JSON NULL",
    learning_goals_json: "JSON NULL",
    explanation_preference: "VARCHAR(255) NULL",
    resource_preferences_json: "JSON NULL",
    pace_preference: "VARCHAR(120) NULL",
    weekly_time_budget_minutes: "INT NULL",
    field_meta_json: "JSON NULL",
    profile_completeness: "DECIMAL(5,4) NOT NULL DEFAULT 0",
    current_version: "INT NOT NULL DEFAULT 0",
    confirmed_at: "TIMESTAMP NULL",
  };
  for (const [name, definition] of Object.entries(columns))
    await ensureColumn(pool, "student_profiles", name, definition);
  await ensureNamedIndex(
    pool,
    "student_profiles",
    "uq_student_profiles_student",
    "ALTER TABLE student_profiles ADD UNIQUE KEY uq_student_profiles_student (student_id)",
  );
}

async function ensureNamedIndex(pool, table, name, ddl) {
  const [indexes] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [name]);
  if (indexes.length === 0) await pool.query(ddl);
}

async function removeLegacyStudentDefaults(pool) {
  for (const table of ["wrong_questions", "student_knowledge_mastery", "code_submissions"]) {
    const [[unowned]] = await pool.query(`SELECT COUNT(*) count FROM \`${table}\` WHERE student_id IS NULL`);
    if (Number(unowned.count) > 0) {
      const error = new Error(
        `${table}.student_id contains ${Number(unowned.count)} unowned rows; migration stopped to avoid assigning private data to an arbitrary user`,
      );
      error.code = "UNOWNED_STUDENT_DATA";
      throw error;
    }
    await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN student_id INT NOT NULL`);
  }
}

async function seedDemoUsers(pool) {
  const password = String(process.env.DEMO_PASSWORD || "").trim();
  const minimumLength = normalizeNodeEnv(process.env.NODE_ENV) === "production" ? 12 : 6;
  if (password.length < minimumLength || password.startsWith("请设置") || /^change[-_ ]?me/i.test(password)) {
    throw new Error(
      `DEMO_PASSWORD must contain at least ${minimumLength} non-placeholder characters before seeding demo users`,
    );
  }

  const users = [
    ["20260001", "zhangsan", "张同学"],
    ["20260002", "lisi", "李同学"],
    ["20260003", "wangwu", "王同学"],
  ];
  for (const [studentNo, username, displayName] of users) {
    await ensureDemoAccount(pool, { studentNo, username, displayName, role: "STUDENT", password });
  }
}

async function seedRedBlackTreeDemo(pool) {
  await pool.query(
    `INSERT INTO question_bank (
       question_id, subject, chapter, knowledge_point, question_type, difficulty,
       stem, code_context, option_a, option_b, option_c, option_d, answer,
       analysis, hint, ability_dimension, tags, stage, is_core, source, option_error_types
     ) VALUES (?, ?, ?, ?, 'single_choice', '提高', ?, '', ?, ?, ?, ?, 'A', ?, ?, ?, ?, '核心', 1, 'system_seed', ?)
     ON DUPLICATE KEY UPDATE
       stem = VALUES(stem), option_a = VALUES(option_a), option_b = VALUES(option_b),
       option_c = VALUES(option_c), option_d = VALUES(option_d), answer = VALUES(answer),
       analysis = VALUES(analysis), option_error_types = VALUES(option_error_types)`,
    [
      "DS-RBT-ROTATE-001",
      "数据结构",
      "树",
      "红黑树旋转",
      "对红黑树结点 X 做左旋时，旋转后的局部子树根以及 X 的位置分别是什么？",
      "X 的右孩子成为局部根，X 成为该结点的左孩子",
      "X 的左孩子成为局部根，X 成为该结点的右孩子",
      "X 仍是局部根，只交换左右子树",
      "X 的父结点成为局部根，X 成为其右孩子",
      "左旋以 X 的右孩子为支点：右孩子上升为局部根，X 下沉为其左孩子，同时保持二叉搜索树次序。",
      "画出 X、右孩子 Y 和 Y 的左子树 β，跟踪三条父子指针变化。",
      "操作顺序与结构推演",
      JSON.stringify(["红黑树", "旋转", "学习闭环"]),
      JSON.stringify({ B: "procedure_confusion", C: "concept_misunderstanding", D: "procedure_confusion" }),
    ],
  );

  const additionalQuestions = [
    [
      "DS-RBT-PROP-002",
      "红黑树中从任一结点到其后代 NIL 叶子的路径必须满足什么条件？",
      "包含相同数量的黑结点",
      "包含相同数量的红结点",
      "长度必须完全相同",
      "必须同时经过根结点",
      "该性质称为黑高一致，是红黑树保持近似平衡的核心约束。",
      "只统计黑结点，不要把普通路径长度与黑高混淆。",
    ],
    [
      "DS-RBT-RED-003",
      "如果一个红黑树结点是红色，它的两个子结点应当是什么颜色？",
      "都必须是黑色",
      "至少一个是红色",
      "颜色任意",
      "都必须是红色",
      "红结点不能有红孩子，否则会出现连续红结点并破坏红黑树性质。",
      "回忆红结点与其子结点之间的颜色限制。",
    ],
    [
      "DS-RBT-ROOT-004",
      "一次插入修复结束后，算法通常需要执行哪项最终操作？",
      "把根结点设为黑色",
      "把根结点设为红色",
      "删除所有 NIL 叶子",
      "重新计算所有键值",
      "将根设为黑色可恢复根结点颜色约束，且不会改变各路径黑高关系。",
      "检查根结点必须满足的颜色性质。",
    ],
    [
      "DS-RBT-ORDER-005",
      "红黑树旋转为什么不会破坏二叉搜索树的键次序？",
      "旋转只重新连接局部父子关系并保持中序次序",
      "旋转会重新排序所有键",
      "旋转只交换结点颜色",
      "旋转会删除支点结点",
      "左右旋在局部调整指针，但支点、子树与上升结点的中序排列保持不变。",
      "画出 α、β、γ 三棵子树并比较旋转前后的中序序列。",
    ],
  ];
  for (const [questionId, stem, optionA, optionB, optionC, optionD, analysis, hint] of additionalQuestions) {
    await pool.query(
      `INSERT INTO question_bank (
         question_id, subject, chapter, knowledge_point, question_type, difficulty,
         stem, code_context, option_a, option_b, option_c, option_d, answer,
         analysis, hint, ability_dimension, tags, stage, is_core, source, option_error_types
       ) VALUES (?, '数据结构', '树', '红黑树旋转', 'single_choice', '提高', ?, '', ?, ?, ?, ?, 'A', ?, ?,
         '概念理解与结构推演', ?, '核心', 1, 'system_seed', ?)
       ON DUPLICATE KEY UPDATE stem=VALUES(stem),option_a=VALUES(option_a),option_b=VALUES(option_b),
         option_c=VALUES(option_c),option_d=VALUES(option_d),answer=VALUES(answer),analysis=VALUES(analysis),hint=VALUES(hint),
         option_error_types=VALUES(option_error_types)`,
      [
        questionId,
        stem,
        optionA,
        optionB,
        optionC,
        optionD,
        analysis,
        hint,
        JSON.stringify(["红黑树", "性质", "学习闭环"]),
        JSON.stringify({
          B: "concept_misunderstanding",
          C: "procedure_confusion",
          D: "concept_misunderstanding",
        }),
      ],
    );
  }
  await seedTrustedQuizQuestionPacks(pool);

  await pool.query(
    `INSERT INTO code_exercises (
       exercise_id,subject,knowledge_point,title,description,language,difficulty,starter_code,
       sample_input,sample_output,explanation,tags,source,path_completion_eligible
     ) VALUES (
       'DS_CODE_RBT_001','数据结构','红黑树旋转','红黑树左旋指针更新',
        '补全左旋过程中的父子指针更新，并输出旋转后的局部根、左孩子与左孩子右子树。','c','提高',?,
        '10 20 15','20 10 15','通过可执行的局部树结构练习验证左旋后的父子指针关系。',?,'system_seed',1
     ) ON DUPLICATE KEY UPDATE
       title=VALUES(title),description=VALUES(description),starter_code=VALUES(starter_code),
       sample_input=VALUES(sample_input),sample_output=VALUES(sample_output),explanation=VALUES(explanation),
       tags=VALUES(tags),source=VALUES(source),path_completion_eligible=1`,
    [
      '#include <stdio.h>\n\ntypedef struct Node { int key; struct Node *left, *right, *parent; } Node;\n\nvoid rotateLeft(Node **root, Node *x) {\n    /* TODO: 以 x->right 为支点更新父子指针。 */\n}\n\nint main(void) {\n    int xKey = 0, yKey = 0, betaKey = 0;\n    if (scanf("%d %d %d", &xKey, &yKey, &betaKey) != 3) return 1;\n    Node x = {xKey, 0, 0, 0}, y = {yKey, 0, 0, 0}, beta = {betaKey, 0, 0, 0};\n    x.right = &y; y.parent = &x; y.left = &beta; beta.parent = &y;\n    Node *root = &x;\n    rotateLeft(&root, &x);\n    if (root != &y || y.left != &x || x.parent != &y || x.right != &beta || beta.parent != &x) {\n        printf("invalid");\n        return 0;\n    }\n    printf("%d %d %d", root->key, root->left->key, root->left->right->key);\n    return 0;\n}\n',
      JSON.stringify(["红黑树", "左旋", "指针", "路径验收"]),
    ],
  );
  await seedRedBlackTreeCodeJudgeData(pool);
  await seedTrustedCodeCaseExercises(pool, { exerciseIds: ["DS_CODE_RBT_001"] });

  const [users] = await pool.query("SELECT id FROM users WHERE username = 'zhangsan' AND is_demo=1 LIMIT 1");
  if (users[0]) {
    const studentId = users[0].id;
    await pool.query(
      `INSERT INTO student_knowledge_mastery
         (student_id, subject, knowledge_point, mastery, wrong_count, practice_count)
       VALUES (?, '数据结构', '红黑树旋转', 45, 0, 0)
       ON DUPLICATE KEY UPDATE mastery = IF(practice_count = 0, 45, mastery)`,
      [studentId],
    );
    const draft = {
      majorAndGrade: { major: "计算机科学与技术", grade: "大二" },
      currentCourse: "数据结构",
      priorKnowledge: ["已学习 C 语言、树与二叉搜索树基础"],
      learningGoals: ["掌握数据结构并通过课程考试"],
      explanationPreference: "图解和代码示例",
      resourcePreferences: ["思维导图", "代码练习", "讲义"],
      paceAndTimeBudget: { pacePreference: "稳步", weeklyTimeBudgetMinutes: 300 },
    };
    const fieldMeta = Object.fromEntries(
      Object.keys(draft).map((field) => [
        field,
        {
          confidence: 1,
          evidence: "教师已确认的初始画像",
          source: "demo_seed",
        },
      ]),
    );
    await pool.query(
      `INSERT INTO student_profiles
         (student_id, major, grade, current_course, prior_knowledge_json, learning_goals_json,
          explanation_preference, resource_preferences_json, pace_preference,
          weekly_time_budget_minutes, field_meta_json, profile_completeness, current_version, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         major=IF(current_version=0, VALUES(major), major), grade=IF(current_version=0, VALUES(grade), grade),
         current_course=IF(current_version=0, VALUES(current_course), current_course),
         prior_knowledge_json=IF(current_version=0, VALUES(prior_knowledge_json), prior_knowledge_json),
         learning_goals_json=IF(current_version=0, VALUES(learning_goals_json), learning_goals_json),
         explanation_preference=IF(current_version=0, VALUES(explanation_preference), explanation_preference),
         resource_preferences_json=IF(current_version=0, VALUES(resource_preferences_json), resource_preferences_json),
         pace_preference=IF(current_version=0, VALUES(pace_preference), pace_preference),
         weekly_time_budget_minutes=IF(current_version=0, VALUES(weekly_time_budget_minutes), weekly_time_budget_minutes),
         field_meta_json=IF(current_version=0, VALUES(field_meta_json), field_meta_json),
         profile_completeness=IF(current_version=0, 1, profile_completeness),
         current_version=IF(current_version=0, 1, current_version)`,
      [
        studentId,
        draft.majorAndGrade.major,
        draft.majorAndGrade.grade,
        draft.currentCourse,
        JSON.stringify(draft.priorKnowledge),
        JSON.stringify(draft.learningGoals),
        draft.explanationPreference,
        JSON.stringify(draft.resourcePreferences),
        draft.paceAndTimeBudget.pacePreference,
        draft.paceAndTimeBudget.weeklyTimeBudgetMinutes,
        JSON.stringify(fieldMeta),
      ],
    );
    await pool.query(
      `INSERT IGNORE INTO student_profile_versions
         (student_id, version, snapshot_json, change_reason, evidence_json, source_type)
       VALUES (?, 1, ?, '初始画像初始化', ?, 'demo_seed')`,
      [
        studentId,
        JSON.stringify({
          ...draft,
          knowledgeMastery: [{ subject: "数据结构", knowledgePoint: "红黑树旋转", mastery: 45 }],
          errorPatterns: [],
        }),
        JSON.stringify(fieldMeta),
      ],
    );
  }
}

async function seedRedBlackTreeCodeJudgeData(pool) {
  const exerciseId = "DS_CODE_RBT_001";
  const referenceSolution = [
    "#include <stdio.h>",
    "",
    "typedef struct Node { int key; struct Node *left, *right, *parent; } Node;",
    "",
    "void rotateLeft(Node **root, Node *x) {",
    "    Node *y = x->right;",
    "    if (!y) return;",
    "    x->right = y->left;",
    "    if (y->left) y->left->parent = x;",
    "    y->parent = x->parent;",
    "    if (!x->parent) *root = y;",
    "    else if (x == x->parent->left) x->parent->left = y;",
    "    else x->parent->right = y;",
    "    y->left = x;",
    "    x->parent = y;",
    "}",
    "",
    "int main(void) {",
    "    int xKey = 0, yKey = 0, betaKey = 0;",
    '    if (scanf("%d %d %d", &xKey, &yKey, &betaKey) != 3) return 1;',
    "    Node x = {xKey, 0, 0, 0}, y = {yKey, 0, 0, 0}, beta = {betaKey, 0, 0, 0};",
    "    x.right = &y; y.parent = &x; y.left = &beta; beta.parent = &y;",
    "    Node *root = &x;",
    "    rotateLeft(&root, &x);",
    "    if (root != &y || y.left != &x || x.parent != &y || x.right != &beta || beta.parent != &x) {",
    '        printf("invalid");',
    "        return 0;",
    "    }",
    '    printf("%d %d %d", root->key, root->left->key, root->left->right->key);',
    "    return 0;",
    "}",
  ].join("\n");

  await pool.query(
    `INSERT INTO code_exercise_private (exercise_id,language,reference_solution,judge_config_json)
     VALUES (?, 'c', ?, ?)
     ON DUPLICATE KEY UPDATE language=VALUES(language),reference_solution=VALUES(reference_solution),judge_config_json=VALUES(judge_config_json)`,
    [
      exerciseId,
      referenceSolution,
      JSON.stringify({ judgeVersion: "2.4a-c-v1", outputComparison: "line_endings_and_trailing_line_space" }),
    ],
  );

  const tests = [
    ["public", "10 20 15", "20 10 15", 1],
    ["public", "1 2 0", "2 1 0", 2],
    ["public", "-5 7 3", "7 -5 3", 3],
    ["hidden", "4 9 6", "9 4 6", 1],
    ["hidden", "100 200 150", "200 100 150", 2],
    ["hidden", "0 1 -1", "1 0 -1", 3],
    ["hidden", "8 13 11", "13 8 11", 4],
    ["hidden", "-20 -5 -10", "-5 -20 -10", 5],
    ["hidden", "42 99 77", "99 42 77", 6],
  ];
  for (const [visibility, input, expectedOutput, orderIndex] of tests) {
    await pool.query(
      `INSERT INTO code_test_cases (exercise_id,visibility,input_text,expected_output,order_index)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE input_text=VALUES(input_text),expected_output=VALUES(expected_output)`,
      [exerciseId, visibility, input, expectedOutput, orderIndex],
    );
  }
}

async function seedTrustedQuizQuestionPacks(pool) {
  const packs = [
    {
      subject: "数据结构",
      chapter: "树",
      knowledgePoint: "红黑树旋转",
      prefix: "DS-RBT-TRUST",
      questions: [
        q(
          "LEFT-PARENT",
          "基础",
          "左旋时，如果 X 是原父结点 P 的左孩子，旋转后 P 应该指向哪个结点？",
          ["指向 X 的右孩子 Y", "继续指向 X", "直接指向 Y 的左子树", "删除 P 与局部子树的连接"],
          "A",
          "左旋完成后，Y 上升为局部根，因此原来从 P 指向 X 的边要改为指向 Y。",
          "父结点指针要跟随局部根变化。",
          "指针重连",
          ["左旋指针", "父子关系", "过程推演"],
          { B: "procedure_confusion", C: "pointer_misread", D: "concept_misunderstanding" },
        ),
        q(
          "RIGHT-MIRROR",
          "基础",
          "把左旋过程镜像成右旋时，局部根变化最准确的说法是什么？",
          [
            "左孩子上升，原根下沉为其右孩子",
            "右孩子上升，原根下沉为其左孩子",
            "根结点颜色互换但结构不变",
            "所有键值重新排序",
          ],
          "A",
          "右旋是左旋的镜像，支点是原根的左孩子；该结点上升为局部根，原根成为它的右孩子。",
          "先找支点，再看原根下沉方向。",
          "右旋镜像",
          ["右旋指针", "镜像关系", "误区辨析"],
          { B: "mirror_confusion", C: "color_structure_confusion", D: "concept_misunderstanding" },
        ),
        q(
          "BETA-SUBTREE",
          "提高",
          "左旋中，Y 的左子树 β 在旋转后应放到哪里，才能保持二叉搜索树次序？",
          ["成为 X 的右子树", "成为 X 的左子树", "成为 Y 的右子树", "从树中删除"],
          "A",
          "旋转前满足 X < β < Y，旋转后 β 必须位于 X 右侧且仍在 Y 左侧，因此应接到 X 的右子树位置。",
          "用中序关系 X、β、Y 检查。",
          "中序保持",
          ["BST次序", "子树边界", "过程推演"],
          { B: "order_confusion", C: "pointer_misread", D: "concept_misunderstanding" },
        ),
        q(
          "INSERT-LINE",
          "综合",
          "插入 10、20、30 后触发右右型失衡，红黑树修复通常需要怎样处理？",
          [
            "对祖父结点左旋并调整颜色",
            "对父结点右旋并删除新结点",
            "只把新结点改黑即可",
            "把 NIL 叶子全部染红",
          ],
          "A",
          "10、20、30 形成连续向右的红色链，属于右右型局部结构；修复会围绕祖父结点左旋，并配合重新着色恢复红黑性质。",
          "先识别父、新结点相对祖父的方向。",
          "插入修复",
          ["插入修复", "场景题", "误区辨析"],
          { B: "rotation_direction", C: "color_only_confusion", D: "nil_confusion" },
        ),
        q(
          "UNCLE-RED",
          "基础",
          "插入修复中，如果父结点和叔结点都是红色，优先采用哪种操作？",
          ["父叔变黑、祖父变红并继续向上检查", "立即围绕父结点旋转", "删除叔结点", "保持颜色不变直接结束"],
          "A",
          "父叔同红时，局部旋转不能直接解决祖父向上的冲突；标准处理是父叔变黑、祖父变红，再把检查点上移。",
          "叔结点颜色决定是变色还是旋转。",
          "颜色变换",
          ["颜色变换", "插入修复", "误区辨析"],
          { B: "procedure_confusion", C: "concept_misunderstanding", D: "termination_error" },
        ),
        q(
          "BLACK-HEIGHT",
          "提高",
          "判断一次旋转是否破坏黑高时，最关键的检查对象是什么？",
          [
            "局部子树各路径上的黑结点数量是否保持一致",
            "所有路径长度是否完全相同",
            "红结点总数是否不变",
            "根结点是否一定改变",
          ],
          "A",
          "红黑树要求从任一结点到后代 NIL 叶子的黑结点数量一致，旋转和变色后要核对这条约束，而不是普通路径长度。",
          "黑高只统计黑结点。",
          "黑高约束",
          ["黑高约束", "性质判断", "误区辨析"],
          { B: "height_black_height_confusion", C: "color_count_confusion", D: "concept_misunderstanding" },
        ),
        q(
          "ROOT-FINAL",
          "基础",
          "为什么插入修复最后通常还要把根结点设为黑色？",
          [
            "恢复根结点颜色约束且不破坏黑高一致",
            "让树变成完全二叉树",
            "保证所有红结点都在叶子层",
            "使每条路径长度相等",
          ],
          "A",
          "根必须为黑色是红黑树基本性质；把根置黑只会给所有根到叶路径同步增加或保持黑结点计数，不会破坏黑高一致。",
          "根结点约束和路径黑高要分开看。",
          "根结点约束",
          ["根结点约束", "黑高约束", "概念辨析"],
          { B: "tree_shape_confusion", C: "red_node_confusion", D: "height_black_height_confusion" },
        ),
        q(
          "DELETE-FIX",
          "综合",
          "删除修复中，兄弟结点为红色时，为什么常先围绕父结点旋转？",
          [
            "把红兄弟转换成黑兄弟情形，便于继续按黑兄弟规则处理",
            "直接完成所有修复",
            "减少二叉搜索树的键数量",
            "让新根一定为红色",
          ],
          "A",
          "红兄弟情形本身不便直接借黑高，先旋转并变色可把问题转化为兄弟为黑的标准分支，再继续检查。",
          "把特殊情形转成标准情形。",
          "删除修复",
          ["删除修复", "状态转换", "场景题"],
          { B: "termination_error", C: "concept_misunderstanding", D: "color_confusion" },
        ),
        q(
          "COMPLEXITY",
          "提高",
          "红黑树插入后修复为什么仍是 O(log n) 级别？",
          [
            "旋转次数有限，变色向上推进的高度受树高约束",
            "每次都要重新排序所有结点",
            "需要遍历所有 NIL 叶子",
            "只要有旋转就是 O(1)",
          ],
          "A",
          "红黑树高度保持对数级，插入修复沿祖先链向上推进；旋转次数有限，变色传播也不会超过树高，因此总体为 O(log n)。",
          "把局部旋转次数和向上检查高度分开估计。",
          "复杂度分析",
          ["复杂度分析", "过程推演", "边界判断"],
          { B: "complexity_confusion", C: "nil_confusion", D: "local_global_confusion" },
        ),
      ],
    },
    {
      subject: "操作系统",
      chapter: "进程管理",
      knowledgePoint: "进程、线程、调度与上下文切换",
      prefix: "OS-PTCS-TRUST",
      questions: [
        q(
          "PCB",
          "基础",
          "进程控制块 PCB 的核心作用是什么？",
          [
            "保存进程身份、状态、寄存器和资源等管理信息",
            "只保存源代码文本",
            "替代所有线程栈",
            "只用于记录磁盘文件名",
          ],
          "A",
          "操作系统通过 PCB 识别和管理进程，调度、阻塞、唤醒以及上下文切换都依赖其中的状态、寄存器和资源信息。",
          "想想系统如何在暂停后恢复一个进程。",
          "进程控制块",
          ["PCB", "进程状态", "概念辨析"],
          { B: "concept_misunderstanding", C: "thread_process_confusion", D: "resource_confusion" },
        ),
        q(
          "THREAD-RESOURCE",
          "基础",
          "同一进程内多个线程通常共享哪类资源？",
          [
            "地址空间和打开文件等进程资源",
            "各自完全独立的虚拟地址空间",
            "同一个用户态栈",
            "完全独立的页表和文件表",
          ],
          "A",
          "线程是进程内的执行流，通常共享进程地址空间、全局变量和打开文件，但每个线程有自己的寄存器上下文和栈。",
          "区分共享的进程资源和私有执行上下文。",
          "线程共享资源",
          ["线程共享", "资源边界", "误区辨析"],
          { B: "process_thread_confusion", C: "stack_confusion", D: "resource_confusion" },
        ),
        q(
          "STATE-READY",
          "基础",
          "一个进程获得除 CPU 以外的全部资源，只等待被调度运行时，它处于什么状态？",
          ["就绪态", "运行态", "阻塞态", "终止态"],
          "A",
          "就绪态表示进程已经具备运行条件，只差 CPU；阻塞态则是在等待 I/O、信号量或其他事件。",
          "CPU 是就绪态和运行态的关键差异。",
          "进程状态",
          ["进程状态", "调度条件", "概念辨析"],
          { B: "state_confusion", C: "blocking_ready_confusion", D: "concept_misunderstanding" },
        ),
        q(
          "CONTEXT-SWITCH",
          "提高",
          "上下文切换时，操作系统最需要保存和恢复的内容是哪一类？",
          ["程序计数器、寄存器和栈指针等 CPU 执行上下文", "显示器分辨率", "源程序注释", "所有历史输入命令"],
          "A",
          "上下文切换的目标是让被暂停的执行流之后能从同一点继续运行，因此必须保存 PC、通用寄存器、栈指针和状态字等。",
          "从“恢复执行”倒推需要保存什么。",
          "上下文切换",
          ["上下文切换", "寄存器现场", "过程推演"],
          { B: "irrelevant_resource", C: "concept_misunderstanding", D: "scope_confusion" },
        ),
        q(
          "RR",
          "提高",
          "时间片轮转调度中，时间片过长最可能退化成什么效果？",
          [
            "接近先来先服务，交互响应变差",
            "所有进程同时运行",
            "必然避免饥饿且无切换开销",
            "只适合批处理且不能抢占",
          ],
          "A",
          "时间片过长会减少抢占频率，短作业或交互请求可能长时间等待，效果接近 FCFS；时间片过短又会增加切换开销。",
          "比较时间片长度对响应和开销的双重影响。",
          "时间片轮转",
          ["时间片轮转", "调度场景", "误区辨析"],
          { B: "concurrency_confusion", C: "over_absolute", D: "scheduler_confusion" },
        ),
        q(
          "SJF",
          "提高",
          "短作业优先调度的主要风险是什么？",
          ["长作业可能长期等待而饥饿", "一定产生最多上下文切换", "无法估计任何作业时间", "只会用于实时系统"],
          "A",
          "SJF 优先服务预计运行时间短的作业，平均等待时间可能较低，但长作业在短作业不断到来时可能长期得不到执行。",
          "优化平均等待时间不等于保证公平。",
          "短作业优先",
          ["短作业优先", "饥饿问题", "误区辨析"],
          { B: "over_generalization", C: "concept_misunderstanding", D: "scheduler_confusion" },
        ),
        q(
          "PRIORITY-INVERSION",
          "综合",
          "高优先级线程等待低优先级线程持有的锁，而中优先级线程持续运行，这是什么问题？",
          ["优先级反转", "死锁必然成立", "分页抖动", "忙等待一定消失"],
          "A",
          "低优先级线程持锁阻塞高优先级线程，中优先级线程又抢占低优先级线程，会导致高优先级任务间接受阻，这就是优先级反转。",
          "画出三类优先级线程和锁的等待关系。",
          "优先级反转",
          ["优先级反转", "锁等待", "场景题"],
          { B: "deadlock_confusion", C: "memory_confusion", D: "concept_misunderstanding" },
        ),
        q(
          "KERNEL-USER",
          "基础",
          "从用户态进入内核态处理系统调用时，为什么可能发生上下文相关开销？",
          [
            "需要切换特权级并保存必要现场",
            "因为所有用户变量都会被复制到磁盘",
            "因为 CPU 必须重新编译程序",
            "因为进程一定被终止",
          ],
          "A",
          "系统调用会触发受控陷入，处理器切换到内核态并保存返回所需现场；这类切换和调度切换不同，但都涉及现场维护成本。",
          "区分特权级切换和进程切换。",
          "内核态切换",
          ["系统调用", "内核态", "误区辨析"],
          { B: "resource_confusion", C: "concept_misunderstanding", D: "state_confusion" },
        ),
        q(
          "BLOCKING",
          "基础",
          "进程因等待磁盘 I/O 完成而暂时不能继续执行，应转入什么状态？",
          ["阻塞态", "就绪态", "运行态", "创建态"],
          "A",
          "等待 I/O 属于等待外部事件，进程即使获得 CPU 也无法继续推进，因此应进入阻塞态，事件完成后再回到就绪态。",
          "判断它是在等 CPU 还是等事件。",
          "阻塞唤醒",
          ["阻塞唤醒", "I/O等待", "状态转换"],
          { B: "ready_blocked_confusion", C: "state_confusion", D: "concept_misunderstanding" },
        ),
        q(
          "PREEMPT",
          "提高",
          "抢占式调度与非抢占式调度的关键差异是什么？",
          [
            "系统能否在进程主动放弃 CPU 前强制收回 CPU",
            "是否允许进程创建线程",
            "是否使用虚拟内存",
            "是否存在文件系统",
          ],
          "A",
          "抢占式调度允许时钟中断或高优先级任务到来时强制切换 CPU，非抢占式通常要等运行进程阻塞或主动让出。",
          "关注 CPU 使用权如何被收回。",
          "抢占机制",
          ["抢占调度", "时钟中断", "概念辨析"],
          { B: "thread_process_confusion", C: "memory_confusion", D: "scope_confusion" },
        ),
        q(
          "THREAD-SWITCH",
          "提高",
          "同一进程内线程切换通常比进程切换更轻，主要原因是什么？",
          [
            "不必切换完整地址空间等进程级资源",
            "线程没有任何寄存器现场",
            "线程不需要栈",
            "线程切换不会进入内核",
          ],
          "A",
          "同进程线程共享地址空间和许多资源，切换时主要维护线程执行上下文；进程切换常涉及地址空间和更多资源状态。",
          "轻量不代表没有现场保存。",
          "线程切换",
          ["线程切换", "地址空间", "误区辨析"],
          { B: "register_confusion", C: "stack_confusion", D: "kernel_confusion" },
        ),
        q(
          "MULTICORE",
          "综合",
          "在多核系统中，说“同一时刻只能有一个线程运行”为什么不准确？",
          [
            "多个核可以并行运行多个线程",
            "线程只能在磁盘上运行",
            "并行运行会让进程概念消失",
            "调度器不会处理多核",
          ],
          "A",
          "单核上同一时刻只有一个执行流占用 CPU，但多核系统可以让多个线程真正并行；调度器需要为不同核心分配可运行线程。",
          "区分单核并发和多核并行。",
          "多核并行",
          ["多核调度", "并发并行", "概念辨析"],
          { B: "concept_misunderstanding", C: "process_thread_confusion", D: "scheduler_confusion" },
        ),
        q(
          "LOCK-WAIT",
          "综合",
          "线程 A 持有锁 L 后被抢占，线程 B 随后申请 L 被阻塞，这个场景最能说明什么？",
          [
            "调度、同步和阻塞状态会相互影响",
            "锁会自动复制共享变量",
            "抢占式调度不需要同步",
            "线程阻塞后仍占用 CPU 运行",
          ],
          "A",
          "锁等待会让线程从可运行路径转入阻塞，持锁线程是否及时被调度又影响等待时间，因此调度策略和同步机制并不是互不相关。",
          "把锁状态和线程状态放在一条时间线上看。",
          "锁与调度",
          ["锁等待", "状态转换", "场景题"],
          { B: "lock_confusion", C: "synchronization_confusion", D: "state_confusion" },
        ),
        q(
          "OVERHEAD",
          "基础",
          "频繁上下文切换为什么会降低系统有效吞吐？",
          [
            "保存恢复现场和调度决策会消耗 CPU 时间",
            "它会永久删除缓存中的所有数据",
            "它让每个进程都获得无限时间片",
            "它会禁止中断",
          ],
          "A",
          "上下文切换本身不完成用户任务，却要消耗 CPU 做现场保存、调度和缓存/TLB 相关恢复，因此过于频繁会降低有效工作时间比例。",
          "区分管理开销和真正执行用户代码的时间。",
          "切换开销",
          ["切换开销", "性能分析", "误区辨析"],
          { B: "cache_overstatement", C: "scheduler_confusion", D: "interrupt_confusion" },
        ),
      ],
    },
    {
      subject: "计算机网络",
      chapter: "传输层",
      knowledgePoint: "TCP连接建立、数据传输与连接释放",
      prefix: "NET-TCP-TRUST",
      questions: [
        q(
          "THREE-WAY",
          "基础",
          "TCP 三次握手第三次 ACK 的关键作用是什么？",
          [
            "让服务端确认客户端收到了自己的 SYN 和初始序列号",
            "提高物理链路带宽",
            "替代后续所有确认报文",
            "关闭已有连接",
          ],
          "A",
          "前两次报文只能让客户端确认双向可达，服务端还需要第三次 ACK 确认客户端收到了服务端的 SYN 与初始序列号。",
          "从双方各自确认了什么来判断。",
          "三次握手",
          ["三次握手", "ACK确认", "误区辨析"],
          { B: "throughput_confusion", C: "ack_confusion", D: "state_confusion" },
        ),
        q(
          "SYN-SEQ",
          "提高",
          "握手中双方为什么要交换初始序列号？",
          [
            "为后续字节流编号和确认建立基准",
            "为了协商 IP 地址",
            "为了加密所有数据",
            "为了决定应用层协议名称",
          ],
          "A",
          "TCP 面向字节流，序列号用于标识数据字节位置；握手同步双方初始序列号，后续 ACK 才能准确确认已收到的数据范围。",
          "序列号服务于可靠传输，不是地址协商。",
          "序列号同步",
          ["序列号", "可靠传输", "概念辨析"],
          { B: "layer_confusion", C: "security_confusion", D: "application_confusion" },
        ),
        q(
          "RETRANSMIT",
          "提高",
          "数据段发送后迟迟没有收到 ACK，TCP 通常会怎样处理？",
          ["超时后重传相关数据段", "立即改用 UDP", "认为连接已经正常释放", "删除发送缓冲区所有数据"],
          "A",
          "TCP 通过超时重传处理可能的丢包；发送缓冲区中的未确认数据要保留到确认到达，不能随意删除。",
          "未确认的数据仍要能被重发。",
          "超时重传",
          ["超时重传", "发送缓冲", "过程推演"],
          { B: "protocol_confusion", C: "state_confusion", D: "buffer_confusion" },
        ),
        q(
          "FAST-RETX",
          "综合",
          "连续收到多个重复 ACK 时，TCP 快速重传主要基于什么判断？",
          [
            "某个报文段可能丢失但后续段已到达",
            "接收方窗口一定为零",
            "网络层已经关闭连接",
            "应用层拒绝读取数据",
          ],
          "A",
          "重复 ACK 表明接收方反复期待同一序号的数据，且后续乱序段可能已经到达；发送方可不等超时就重传疑似丢失段。",
          "重复 ACK 暗示缺口位置。",
          "快速重传",
          ["快速重传", "重复ACK", "场景题"],
          { B: "flow_control_confusion", C: "layer_confusion", D: "application_confusion" },
        ),
        q(
          "FLOW",
          "基础",
          "TCP 流量控制主要防止什么问题？",
          ["发送方压垮接收方缓冲区", "网络中路由器必然拥塞", "IP 地址冲突", "应用层语法错误"],
          "A",
          "流量控制由接收窗口等机制表达接收端处理能力，避免发送方超过接收缓冲承载；它不同于关注网络整体负载的拥塞控制。",
          "接收方能力是流量控制关键词。",
          "流量控制",
          ["流量控制", "接收窗口", "误区辨析"],
          { B: "congestion_flow_confusion", C: "layer_confusion", D: "application_confusion" },
        ),
        q(
          "CONGESTION",
          "提高",
          "拥塞控制关注的主要对象是什么？",
          [
            "网络路径中的整体负载和拥塞程度",
            "接收进程的用户态栈大小",
            "本机文件描述符数量",
            "网页 HTML 结构",
          ],
          "A",
          "拥塞控制通过慢启动、拥塞避免等机制估计网络承载能力，目标是减少路径拥塞，不等同于接收端缓冲区限制。",
          "把网络路径和接收端缓冲分开。",
          "拥塞控制",
          ["拥塞控制", "慢启动", "概念辨析"],
          { B: "flow_control_confusion", C: "resource_confusion", D: "layer_confusion" },
        ),
        q(
          "WINDOW",
          "基础",
          "滑动窗口允许发送方在未收到每个 ACK 前连续发送多个段，前提是什么？",
          [
            "未确认数据量不超过窗口限制",
            "所有数据都不需要序列号",
            "接收方关闭确认机制",
            "连接已经进入 TIME_WAIT",
          ],
          "A",
          "滑动窗口通过限制在途未确认数据量兼顾效率与可靠性；发送方可以流水线发送，但不能超过拥塞窗口和接收窗口约束。",
          "窗口限制的是在途未确认数据。",
          "滑动窗口",
          ["滑动窗口", "窗口约束", "过程推演"],
          { B: "seq_confusion", C: "ack_confusion", D: "state_confusion" },
        ),
        q(
          "FOUR-WAY",
          "基础",
          "TCP 连接释放通常需要四次挥手，主要原因是什么？",
          [
            "两端数据发送方向需要分别关闭",
            "为了重新分配 IP 地址",
            "因为 SYN 必须发送四次",
            "为了让 UDP 同步关闭",
          ],
          "A",
          "TCP 是全双工连接，一端发送 FIN 只表示自己不再发送数据，另一端可能仍有数据要发，因此两个方向通常分别 FIN 和 ACK。",
          "关闭发送方向不等于关闭整个双向连接。",
          "四次挥手",
          ["四次挥手", "全双工", "误区辨析"],
          { B: "layer_confusion", C: "handshake_confusion", D: "protocol_confusion" },
        ),
        q(
          "TIME-WAIT",
          "提高",
          "主动关闭方进入 TIME_WAIT 的一个重要目的是什么？",
          ["处理迟到报文并确保最后 ACK 可重传", "提升应用层吞吐量", "让服务端永久占用端口", "取消序列号机制"],
          "A",
          "TIME_WAIT 让连接在一段时间内吸收旧报文，并在对方重发 FIN 时还能重发最后 ACK，从而避免新旧连接报文混淆。",
          "考虑最后一个 ACK 丢失会怎样。",
          "TIME_WAIT",
          ["TIME_WAIT", "连接释放", "场景题"],
          { B: "throughput_confusion", C: "resource_overstatement", D: "seq_confusion" },
        ),
        q(
          "HALF-CLOSE",
          "综合",
          "一端发送 FIN 后仍可能接收对方数据，这体现了 TCP 的什么特性？",
          ["全双工连接两个方向可独立关闭", "TCP 是无连接协议", "ACK 不再有效", "接收窗口必然为零"],
          "A",
          "FIN 关闭的是本端发送方向，接收方向仍可继续接收对端尚未发送完的数据，这就是全双工连接释放的典型表现。",
          "FIN 的含义是本方向不再发送。",
          "半关闭",
          ["半关闭", "全双工", "误区辨析"],
          { B: "protocol_confusion", C: "ack_confusion", D: "flow_control_confusion" },
        ),
        q(
          "CHECKSUM",
          "基础",
          "TCP 校验和主要用于发现什么问题？",
          ["传输过程中比特差错导致的报文损坏", "应用层密码错误", "路由表配置缺失", "进程优先级反转"],
          "A",
          "校验和覆盖 TCP 首部、数据及伪首部相关信息，用于检测传输中的比特错误；发现错误后接收方可丢弃，依靠重传恢复。",
          "校验和是差错检测，不是身份认证。",
          "差错检测",
          ["校验和", "可靠传输", "概念辨析"],
          { B: "security_confusion", C: "routing_confusion", D: "os_confusion" },
        ),
        q(
          "ORDER",
          "提高",
          "TCP 如何让应用层看到有序字节流？",
          [
            "接收端依据序列号重排并按序交付",
            "发送端禁止任何分片",
            "IP 层保证所有包按序到达",
            "应用层必须自己猜测顺序",
          ],
          "A",
          "网络中报文可能乱序到达，TCP 接收端利用序列号缓存和重排，只把连续有序的数据交付给应用层。",
          "可靠有序主要靠 TCP 序列号和接收缓存。",
          "有序交付",
          ["有序交付", "序列号", "过程推演"],
          { B: "fragment_confusion", C: "ip_tcp_confusion", D: "application_confusion" },
        ),
        q(
          "ACK-LOSS",
          "综合",
          "如果第三次握手的 ACK 丢失，服务端最可能先表现为什么状态或行为？",
          [
            "未确认连接完成，超时后可能重传 SYN+ACK",
            "立即认为数据传输成功结束",
            "直接进入 TIME_WAIT",
            "改用广播继续握手",
          ],
          "A",
          "服务端没有收到第三次 ACK 时，不能确认客户端已收到自己的 SYN+ACK，通常会在超时后重传 SYN+ACK；客户端收到重复报文可再次 ACK。",
          "站在服务端看它缺少哪份确认。",
          "握手丢包",
          ["握手丢包", "SYNACK重传", "场景题"],
          { B: "state_confusion", C: "close_confusion", D: "protocol_confusion" },
        ),
        q(
          "ZERO-WINDOW",
          "综合",
          "接收方通告窗口为 0 时，发送方应如何理解？",
          [
            "暂时不能继续发送普通数据，需要等待窗口更新",
            "连接已经被四次挥手释放",
            "以后所有 ACK 都无效",
            "拥塞窗口一定也为 0",
          ],
          "A",
          "零窗口表示接收缓冲暂时没有可用空间，发送方应暂停普通数据发送，并通过窗口探测或后续通告恢复发送。",
          "零窗口来自接收端缓冲状态。",
          "零窗口",
          ["零窗口", "流量控制", "场景题"],
          { B: "close_confusion", C: "ack_confusion", D: "congestion_flow_confusion" },
        ),
      ],
    },
  ];
  for (const pack of packs) {
    for (let index = 0; index < pack.questions.length; index += 1) {
      const item = pack.questions[index];
      await upsertTrustedQuizQuestion(pool, pack, item, index + 1);
    }
  }
}

function q(
  suffix,
  difficulty,
  stem,
  options,
  answer,
  analysis,
  hint,
  abilityDimension,
  tags,
  optionErrorTypes,
) {
  return {
    suffix,
    difficulty,
    stem,
    options,
    answer,
    analysis,
    hint,
    abilityDimension,
    tags,
    optionErrorTypes,
  };
}

async function upsertTrustedQuizQuestion(pool, pack, item, order) {
  const id = `${pack.prefix}-${String(order).padStart(3, "0")}-${item.suffix}`;
  await pool.query(
    `INSERT INTO question_bank (
       question_id, subject, chapter, knowledge_point, question_type, difficulty,
       stem, code_context, option_a, option_b, option_c, option_d, answer,
       analysis, hint, ability_dimension, tags, stage, is_core, source, option_error_types
     ) VALUES (?, ?, ?, ?, 'single_choice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quiz_quality_gate', 1, 'system_seed', ?)
     ON DUPLICATE KEY UPDATE
       subject=VALUES(subject),chapter=VALUES(chapter),knowledge_point=VALUES(knowledge_point),
       question_type=VALUES(question_type),difficulty=VALUES(difficulty),stem=VALUES(stem),
       code_context=VALUES(code_context),option_a=VALUES(option_a),option_b=VALUES(option_b),
       option_c=VALUES(option_c),option_d=VALUES(option_d),answer=VALUES(answer),
       analysis=VALUES(analysis),hint=VALUES(hint),ability_dimension=VALUES(ability_dimension),
       tags=VALUES(tags),stage=VALUES(stage),is_core=VALUES(is_core),source=VALUES(source),
       option_error_types=VALUES(option_error_types)`,
    [
      id,
      pack.subject,
      pack.chapter,
      pack.knowledgePoint,
      item.difficulty,
      item.stem,
      "",
      item.options[0],
      item.options[1],
      item.options[2],
      item.options[3],
      item.answer,
      trustedAnalysis(item.analysis, item.abilityDimension),
      item.hint,
      item.abilityDimension,
      JSON.stringify(item.tags),
      JSON.stringify(item.optionErrorTypes || {}),
    ],
  );
}

function trustedAnalysis(base, abilityDimension) {
  return [
    base,
    `本题属于${abilityDimension}，解题时要先锁定题干中的对象、状态和限制条件，再把每个选项与该条件逐一核对。`,
    "错误选项通常会把概念边界、执行顺序或适用场景混在一起；复盘时建议画出状态变化或关系图，确认自己的判断不是只凭关键词匹配。",
  ].join("");
}

module.exports = { initLearningProfileDB, seedDemoUsers, seedRedBlackTreeDemo };
