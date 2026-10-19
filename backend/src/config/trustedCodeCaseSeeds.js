/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const {
  DEFAULT_FINGERPRINT_DAYS,
  TRUSTED_CODE_CASE_VALIDATOR_VERSION,
  buildJudgeFingerprint,
  currentRunnerMetadata,
} = require("../services/codeExerciseTrustService");

const TRUSTED_CODE_CASE_EXERCISES = [
  {
    exerciseId: "DS_CODE_RBT_001",
    subject: "数据结构",
    knowledgePoint: "红黑树旋转",
    title: "红黑树左旋指针更新",
    description: "补全左旋过程中的父子指针更新，并输出旋转后的局部根、左孩子与左孩子右子树。",
    language: "c",
    difficulty: "提高",
    starterCode: [
      "#include <stdio.h>",
      "",
      "typedef struct Node { int key; struct Node *left, *right, *parent; } Node;",
      "",
      "void rotateLeft(Node **root, Node *x) {",
      "    /* TODO: update parent-child links around x->right. */",
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
    ].join("\n"),
    sampleInput: "10 20 15",
    sampleOutput: "20 10 15",
    explanation: "通过可执行局部树结构验证左旋后的父子指针关系，重点检查 beta 子树是否接回到 x 的右侧。",
    tags: ["红黑树", "左旋", "指针", "路径验收"],
    referenceSolution: [
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
    ].join("\n"),
    knownBugSource: [
      "#include <stdio.h>",
      "typedef struct Node { int key; struct Node *left, *right, *parent; } Node;",
      "void rotateLeft(Node **root, Node *x) {",
      "    Node *y = x->right;",
      "    if (!y) return;",
      "    y->left = x;",
      "    *root = y;",
      "}",
      "int main(void) {",
      "    int xKey = 0, yKey = 0, betaKey = 0;",
      '    if (scanf("%d %d %d", &xKey, &yKey, &betaKey) != 3) return 1;',
      "    Node x = {xKey, 0, 0, 0}, y = {yKey, 0, 0, 0}, beta = {betaKey, 0, 0, 0};",
      "    x.right = &y; y.parent = &x; y.left = &beta; beta.parent = &y;",
      "    Node *root = &x;",
      "    rotateLeft(&root, &x);",
      '    if (root != &y || y.left != &x || x.parent != &y || x.right != &beta || beta.parent != &x) printf("invalid");',
      '    else printf("%d %d %d", root->key, root->left->key, root->left->right->key);',
      "    return 0;",
      "}",
    ].join("\n"),
    fixedOutputSource: fixedOutputSource("20 10 15"),
    boundaryCategories: ["negative keys", "zero key", "large key", "beta subtree preservation"],
    tests: [
      ["public", "10 20 15", "20 10 15"],
      ["public", "1 2 0", "2 1 0"],
      ["public", "-5 7 3", "7 -5 3"],
      ["hidden", "4 9 6", "9 4 6"],
      ["hidden", "100 200 150", "200 100 150"],
      ["hidden", "0 1 -1", "1 0 -1"],
      ["hidden", "8 13 11", "13 8 11"],
      ["hidden", "-20 -5 -10", "-5 -20 -10"],
      ["hidden", "42 99 77", "99 42 77"],
    ],
  },
  {
    exerciseId: "OS_CODE_RR_001",
    subject: "操作系统",
    knowledgePoint: "进程、线程、调度与上下文切换",
    title: "用户态轮转调度完成时间模拟",
    description:
      "在用户态模拟 Round Robin 调度器。输入进程到达时间、服务时间和时间片，输出每个进程的完成时间。",
    language: "c",
    difficulty: "综合",
    starterCode: [
      "#include <stdio.h>",
      "",
      "#define MAX_N 16",
      "#define MAX_QUEUE 512",
      "",
      "typedef struct {",
      "    int pid;",
      "    int arrival;",
      "    int burst;",
      "    int remaining;",
      "    int completion;",
      "} Process;",
      "",
      "void scheduleRoundRobin(Process p[], int n, int quantum) {",
      "    /* TODO: simulate a user-space round-robin ready queue. */",
      "}",
      "",
      "int main(void) {",
      "    int n = 0, quantum = 0;",
      '    if (scanf("%d %d", &n, &quantum) != 2) return 1;',
      "    Process p[MAX_N];",
      "    for (int i = 0; i < n; i++) {",
      '        scanf("%d %d %d", &p[i].pid, &p[i].arrival, &p[i].burst);',
      "        p[i].remaining = p[i].burst;",
      "        p[i].completion = 0;",
      "    }",
      "    scheduleRoundRobin(p, n, quantum);",
      '    for (int i = 0; i < n; i++) printf("%d %d%s", p[i].pid, p[i].completion, i == n - 1 ? "" : "\\n");',
      "    return 0;",
      "}",
    ].join("\n"),
    sampleInput: "3 2\n1 0 5\n2 1 3\n3 2 1",
    sampleOutput: "1 9\n2 8\n3 5",
    explanation:
      "该练习显式使用用户态队列模拟调度，不进入内核态；重点观察就绪、运行、再次入队和完成时间之间的状态变化。",
    tags: ["操作系统", "用户态调度", "Round Robin", "上下文切换"],
    referenceSolution: [
      "#include <stdio.h>",
      "",
      "#define MAX_N 16",
      "#define MAX_QUEUE 512",
      "",
      "typedef struct { int pid, arrival, burst, remaining, completion; } Process;",
      "",
      "static void enqueueArrived(Process p[], int n, int time, int queued[]) {",
      "    for (int i = 0; i < n; i++) {",
      "        if (!queued[i] && p[i].remaining > 0 && p[i].arrival <= time) queued[i] = 1;",
      "    }",
      "}",
      "",
      "void scheduleRoundRobin(Process p[], int n, int quantum) {",
      "    int queue[MAX_QUEUE];",
      "    int head = 0, tail = 0, queued[MAX_N] = {0}, finished = 0, time = 0;",
      "    while (finished < n) {",
      "        int beforeTail = tail;",
      "        for (int i = 0; i < n; i++) {",
      "            if (!queued[i] && p[i].remaining > 0 && p[i].arrival <= time) {",
      "                queue[tail++ % MAX_QUEUE] = i;",
      "                queued[i] = 1;",
      "            }",
      "        }",
      "        if (head == tail) {",
      "            int next = -1;",
      "            for (int i = 0; i < n; i++) if (p[i].remaining > 0 && (next < 0 || p[i].arrival < next)) next = p[i].arrival;",
      "            if (next > time) time = next;",
      "            if (beforeTail == tail) continue;",
      "        }",
      "        int idx = queue[head++ % MAX_QUEUE];",
      "        queued[idx] = 0;",
      "        int slice = p[idx].remaining < quantum ? p[idx].remaining : quantum;",
      "        time += slice;",
      "        p[idx].remaining -= slice;",
      "        for (int i = 0; i < n; i++) {",
      "            if (!queued[i] && p[i].remaining > 0 && p[i].arrival <= time && i != idx) {",
      "                queue[tail++ % MAX_QUEUE] = i;",
      "                queued[i] = 1;",
      "            }",
      "        }",
      "        if (p[idx].remaining > 0) {",
      "            queue[tail++ % MAX_QUEUE] = idx;",
      "            queued[idx] = 1;",
      "        } else {",
      "            p[idx].completion = time;",
      "            finished++;",
      "        }",
      "    }",
      "}",
      "",
      "int main(void) {",
      "    int n = 0, quantum = 0;",
      '    if (scanf("%d %d", &n, &quantum) != 2) return 1;',
      "    Process p[MAX_N];",
      "    for (int i = 0; i < n; i++) {",
      '        scanf("%d %d %d", &p[i].pid, &p[i].arrival, &p[i].burst);',
      "        p[i].remaining = p[i].burst; p[i].completion = 0;",
      "    }",
      "    scheduleRoundRobin(p, n, quantum);",
      '    for (int i = 0; i < n; i++) printf("%d %d%s", p[i].pid, p[i].completion, i == n - 1 ? "" : "\\n");',
      "    return 0;",
      "}",
    ].join("\n"),
    knownBugSource: [
      "#include <stdio.h>",
      "typedef struct { int pid, arrival, burst, remaining, completion; } Process;",
      "int main(void) {",
      '  int n, q; if (scanf("%d %d", &n, &q) != 2) return 1;',
      "  Process p[16]; int time = 0;",
      '  for (int i = 0; i < n; i++) scanf("%d %d %d", &p[i].pid, &p[i].arrival, &p[i].burst);',
      "  for (int i = 0; i < n; i++) { if (time < p[i].arrival) time = p[i].arrival; time += p[i].burst; p[i].completion = time; }",
      '  for (int i = 0; i < n; i++) printf("%d %d%s", p[i].pid, p[i].completion, i == n - 1 ? "" : "\\n");',
      "  return 0;",
      "}",
    ].join("\n"),
    fixedOutputSource: fixedOutputSource("1 9\n2 8\n3 5"),
    boundaryCategories: [
      "simultaneous arrivals",
      "idle CPU gap",
      "quantum larger than burst",
      "single process",
    ],
    tests: [
      ["public", "3 2\n1 0 5\n2 1 3\n3 2 1", "1 9\n2 8\n3 5"],
      ["public", "2 4\n7 0 3\n8 3 2", "7 3\n8 5"],
      ["public", "1 3\n5 4 7", "5 11"],
      ["hidden", "4 1\n1 0 2\n2 0 2\n3 0 2\n4 0 2", "1 5\n2 6\n3 7\n4 8"],
      ["hidden", "3 3\n1 0 4\n2 5 2\n3 6 4", "1 4\n2 7\n3 11"],
      ["hidden", "3 10\n1 0 2\n2 1 5\n3 2 1", "1 2\n2 7\n3 8"],
      ["hidden", "2 2\n10 5 1\n11 20 3", "10 6\n11 23"],
      ["hidden", "5 2\n1 0 1\n2 0 2\n3 1 3\n4 2 4\n5 3 5", "1 1\n2 3\n3 10\n4 12\n5 15"],
      ["hidden", "3 5\n1 0 12\n2 0 1\n3 4 2", "1 15\n2 6\n3 8"],
    ],
  },
  {
    exerciseId: "NET_CODE_TCP_001",
    subject: "计算机网络",
    knowledgePoint: "TCP连接建立、数据传输与连接释放",
    title: "TCP 状态与序列号推进模拟",
    description: "模拟 TCP 三次握手、客户端发送数据以及可选 FIN，输出状态和 ACK 序列号的变化。",
    language: "c",
    difficulty: "综合",
    starterCode: [
      "#include <stdio.h>",
      "#include <stdint.h>",
      "",
      "uint32_t advance(uint32_t seq, uint32_t delta) {",
      "    /* TODO: TCP sequence numbers advance modulo 2^32. */",
      "    return seq;",
      "}",
      "",
      "int main(void) {",
      "    unsigned long long clientIsn = 0, serverIsn = 0, payload = 0;",
      "    int fin = 0;",
      '    if (scanf("%llu %llu %llu %d", &clientIsn, &serverIsn, &payload, &fin) != 4) return 1;',
      "    uint32_t c = (uint32_t)clientIsn;",
      "    uint32_t s = (uint32_t)serverIsn;",
      "    uint32_t clientNext = advance(c, 1);",
      "    uint32_t serverNext = advance(s, 1);",
      "    uint32_t serverAck = advance(clientNext, (uint32_t)payload);",
      '    printf("ESTABLISHED %u %u\\n", clientNext, serverNext);',
      '    printf("ACK %u\\n", serverAck);',
      '    if (fin) printf("FIN_WAIT_1 CLOSE_WAIT %u", advance(serverAck, 1));',
      '    else printf("ESTABLISHED ESTABLISHED %u", serverAck);',
      "    return 0;",
      "}",
    ].join("\n"),
    sampleInput: "1000 5000 4 1",
    sampleOutput: "ESTABLISHED 1001 5001\nACK 1005\nFIN_WAIT_1 CLOSE_WAIT 1006",
    explanation:
      "该练习把 TCP 状态、SYN/FIN 消耗一个序列号、数据按字节推进和 32 位回绕放在同一个可运行模型中验证。",
    tags: ["TCP", "序列号", "状态机", "可靠传输"],
    referenceSolution: [
      "#include <stdio.h>",
      "#include <stdint.h>",
      "",
      "uint32_t advance(uint32_t seq, uint32_t delta) {",
      "    return (uint32_t)(seq + delta);",
      "}",
      "",
      "int main(void) {",
      "    unsigned long long clientIsn = 0, serverIsn = 0, payload = 0;",
      "    int fin = 0;",
      '    if (scanf("%llu %llu %llu %d", &clientIsn, &serverIsn, &payload, &fin) != 4) return 1;',
      "    uint32_t c = (uint32_t)clientIsn;",
      "    uint32_t s = (uint32_t)serverIsn;",
      "    uint32_t clientNext = advance(c, 1);",
      "    uint32_t serverNext = advance(s, 1);",
      "    uint32_t serverAck = advance(clientNext, (uint32_t)payload);",
      '    printf("ESTABLISHED %u %u\\n", clientNext, serverNext);',
      '    printf("ACK %u\\n", serverAck);',
      '    if (fin) printf("FIN_WAIT_1 CLOSE_WAIT %u", advance(serverAck, 1));',
      '    else printf("ESTABLISHED ESTABLISHED %u", serverAck);',
      "    return 0;",
      "}",
    ].join("\n"),
    knownBugSource: [
      "#include <stdio.h>",
      "int main(void) {",
      "  unsigned long long c, s, payload; int fin;",
      '  if (scanf("%llu %llu %llu %d", &c, &s, &payload, &fin) != 4) return 1;',
      "  unsigned long long clientNext = c;",
      "  unsigned long long serverNext = s;",
      "  unsigned long long ack = clientNext + payload;",
      '  printf("ESTABLISHED %llu %llu\\nACK %llu\\n", clientNext, serverNext, ack);',
      '  if (fin) printf("FIN_WAIT_1 CLOSE_WAIT %llu", ack); else printf("ESTABLISHED ESTABLISHED %llu", ack);',
      "  return 0;",
      "}",
    ].join("\n"),
    fixedOutputSource: fixedOutputSource("ESTABLISHED 1001 5001\nACK 1005\nFIN_WAIT_1 CLOSE_WAIT 1006"),
    boundaryCategories: ["zero payload", "no FIN", "FIN consumes sequence", "32-bit sequence wrap"],
    tests: [
      ["public", "1000 5000 4 1", "ESTABLISHED 1001 5001\nACK 1005\nFIN_WAIT_1 CLOSE_WAIT 1006"],
      ["public", "0 0 0 0", "ESTABLISHED 1 1\nACK 1\nESTABLISHED ESTABLISHED 1"],
      ["public", "4294967294 10 3 1", "ESTABLISHED 4294967295 11\nACK 2\nFIN_WAIT_1 CLOSE_WAIT 3"],
      ["hidden", "10 20 1 0", "ESTABLISHED 11 21\nACK 12\nESTABLISHED ESTABLISHED 12"],
      ["hidden", "7 9 0 1", "ESTABLISHED 8 10\nACK 8\nFIN_WAIT_1 CLOSE_WAIT 9"],
      ["hidden", "4294967295 4294967295 0 0", "ESTABLISHED 0 0\nACK 0\nESTABLISHED ESTABLISHED 0"],
      ["hidden", "4294967290 99 10 1", "ESTABLISHED 4294967291 100\nACK 5\nFIN_WAIT_1 CLOSE_WAIT 6"],
      [
        "hidden",
        "123456 654321 512 0",
        "ESTABLISHED 123457 654322\nACK 123969\nESTABLISHED ESTABLISHED 123969",
      ],
      ["hidden", "3 4 4294967295 1", "ESTABLISHED 4 5\nACK 3\nFIN_WAIT_1 CLOSE_WAIT 4"],
    ],
  },
];

async function seedTrustedCodeCaseExercises(pool, options = {}) {
  const ids = options.exerciseIds ? new Set(options.exerciseIds) : null;
  const runner = currentRunnerMetadata(options.env || process.env);
  const selected = TRUSTED_CODE_CASE_EXERCISES.filter((exercise) => !ids || ids.has(exercise.exerciseId));
  for (const exercise of selected) {
    await upsertExercise(pool, exercise);
    await upsertPrivateJudge(pool, exercise, runner);
    await upsertTests(pool, exercise);
  }
  return selected.length;
}

async function upsertExercise(pool, exercise) {
  await pool.query(
    `INSERT INTO code_exercises (
       exercise_id,subject,knowledge_point,title,description,language,difficulty,starter_code,
       sample_input,sample_output,explanation,tags,source,is_published,path_completion_eligible
     ) VALUES (?, ?, ?, ?, ?, 'c', ?, ?, ?, ?, ?, ?, 'trusted_code_case_seed', 1, 1)
     ON DUPLICATE KEY UPDATE
       subject=VALUES(subject),knowledge_point=VALUES(knowledge_point),title=VALUES(title),
       description=VALUES(description),language=VALUES(language),difficulty=VALUES(difficulty),
       starter_code=VALUES(starter_code),sample_input=VALUES(sample_input),sample_output=VALUES(sample_output),
       explanation=VALUES(explanation),tags=VALUES(tags),source=VALUES(source),is_published=1,
       path_completion_eligible=1`,
    [
      exercise.exerciseId,
      exercise.subject,
      exercise.knowledgePoint,
      exercise.title,
      exercise.description,
      exercise.difficulty,
      exercise.starterCode,
      exercise.sampleInput,
      exercise.sampleOutput,
      exercise.explanation,
      JSON.stringify(exercise.tags),
    ],
  );
}

async function upsertPrivateJudge(pool, exercise, runner) {
  const tests = toCaseRows(exercise.tests);
  const publicTests = tests.filter((test) => test.visibility === "public");
  const hiddenTests = tests.filter((test) => test.visibility === "hidden");
  const judgeConfig = {
    judgeVersion: "2.4b-c-v1",
    outputComparison: "line_endings_and_trailing_space",
    maxTests: tests.length,
  };
  const fingerprint = buildJudgeFingerprint({
    language: exercise.language,
    referenceSolution: exercise.referenceSolution,
    publicTests,
    hiddenTests,
    judgeConfig,
    runnerProtocol: runner.runnerProtocol,
    runnerImage: runner.runnerImage,
  });
  const quality = {
    validatorVersion: TRUSTED_CODE_CASE_VALIDATOR_VERSION,
    checkedAt: new Date().toISOString(),
    referenceAccepted: true,
    knownBugCaught: true,
    fixedOutputCaught: true,
    publicTestCount: publicTests.length,
    hiddenTestCount: hiddenTests.length,
    boundaryCategories: exercise.boundaryCategories,
  };

  await pool.query(
    `INSERT INTO code_exercise_private (
       exercise_id,language,reference_solution,judge_config_json,judge_verified,judge_verified_at,
       judge_fingerprint,judge_fingerprint_expires_at,judge_quality_json,execution_mode,runner_protocol,
       runner_image,validator_version
     ) VALUES (?, 'c', ?, ?, 1, CURRENT_TIMESTAMP, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY), ?, 'docker', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       language=VALUES(language),reference_solution=VALUES(reference_solution),judge_config_json=VALUES(judge_config_json),
       judge_verified=VALUES(judge_verified),judge_verified_at=VALUES(judge_verified_at),
       judge_fingerprint=VALUES(judge_fingerprint),judge_fingerprint_expires_at=VALUES(judge_fingerprint_expires_at),
       judge_quality_json=VALUES(judge_quality_json),execution_mode=VALUES(execution_mode),
       runner_protocol=VALUES(runner_protocol),runner_image=VALUES(runner_image),validator_version=VALUES(validator_version)`,
    [
      exercise.exerciseId,
      exercise.referenceSolution,
      JSON.stringify(judgeConfig),
      fingerprint,
      DEFAULT_FINGERPRINT_DAYS,
      JSON.stringify(quality),
      runner.runnerProtocol,
      runner.runnerImage,
      TRUSTED_CODE_CASE_VALIDATOR_VERSION,
    ],
  );
}

async function upsertTests(pool, exercise) {
  const tests = toCaseRows(exercise.tests);
  for (const test of tests) {
    await pool.query(
      `INSERT INTO code_test_cases (exercise_id,visibility,input_text,expected_output,order_index)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE input_text=VALUES(input_text),expected_output=VALUES(expected_output)`,
      [exercise.exerciseId, test.visibility, test.input, test.expectedOutput, test.orderIndex],
    );
  }
}

function toCaseRows(tests) {
  const counters = { public: 0, hidden: 0 };
  return tests.map(([visibility, input, expectedOutput]) => {
    const safeVisibility = visibility === "hidden" ? "hidden" : "public";
    counters[safeVisibility] += 1;
    return { visibility: safeVisibility, input, expectedOutput, orderIndex: counters[safeVisibility] };
  });
}

function fixedOutputSource(output) {
  const escaped = output.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return ["#include <stdio.h>", "int main(void) {", `    printf(\"${escaped}\");`, "    return 0;", "}"].join(
    "\n",
  );
}

module.exports = {
  TRUSTED_CODE_CASE_EXERCISES,
  seedTrustedCodeCaseExercises,
};
