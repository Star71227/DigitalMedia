/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const { Readable, Writable } = require("stream");

process.env.NODE_ENV = "test";

const {
  buildDockerRunArgs,
  dockerCommand,
  runDockerTask,
  sanitizeDiagnostic,
} = require("../src/services/dockerCodeRunnerService");
const { assertSupportedLanguage, toApiResult } = require("../src/services/codeJudgeService");

const dockerConfig = {
  mode: "docker",
  image: "learnmate/code-runner-c:2.4a",
  memory: "128m",
  memorySwap: "128m",
  cpus: 0.5,
  pidsLimit: 64,
  nofileLimit: 64,
  nprocLimit: 64,
  maxSourceBytes: 64,
  maxInputBytes: 32,
  maxOutputBytes: 64,
  maxTests: 2,
  compileTimeoutMs: 5000,
  caseTimeoutMs: 2000,
  totalTimeoutMs: 15000,
  workTmpfsSize: "64m",
  tmpTmpfsSize: "16m",
  user: "10001:10001",
};

test("only c language is accepted", () => {
  assert.equal(assertSupportedLanguage("c"), "c");
  for (const language of ["cpp", "c++", "python", "java", "javascript", "rust", ""]) {
    assert.throws(
      () => assertSupportedLanguage(language),
      (error) => error.code === "UNSUPPORTED_CODE_LANGUAGE",
    );
  }
});

test("WSL transport passes arguments directly and preserves Docker isolation", () => {
  const args = buildDockerRunArgs({ containerName: "test", config: dockerConfig });
  const command = dockerCommand({ transport: "wsl", wslDistribution: "Ubuntu-24.04" }, args);
  assert.equal(command.file, "wsl.exe");
  assert.deepEqual(command.args.slice(0, 6), ["-d", "Ubuntu-24.04", "--user", "root", "--exec", "docker"]);
  assert.deepEqual(command.args.slice(6), args);
});

test("custom input disables output comparison only for public execution", async () => {
  const capture = {};
  await runDockerTask(
    {
      sourceCode: "int main(void){return 0;}",
      tests: [
        { ...publicCase(), input: "7 8", compareOutput: false },
        { ...publicCase(), visibility: "hidden", compareOutput: false },
      ],
    },
    { config: dockerConfig, spawnFn: fakeSpawn(acceptedRunnerResult(), capture), execFileFn: fakeExecFile },
  );
  const task = JSON.parse(capture.stdin);
  assert.equal(task.tests[0].input, "7 8");
  assert.equal(task.tests[0].compareOutput, false);
  assert.equal(task.tests[1].compareOutput, true);
  const result = toApiResult(acceptedRunnerResult(), {
    mode: "run",
    executionMode: "docker",
    includePublicStdout: true,
    judgedBy: "custom_input",
  });
  assert.equal(result.status, "success");
  assert.equal(result.judgedBy, "custom_input");
});

test("docker args are fixed restrictions and do not include student input", () => {
  const args = buildDockerRunArgs({ containerName: "learnmate-code-runner-test", config: dockerConfig });
  const joined = args.join(" ");
  for (const required of [
    "--network none",
    "--read-only",
    "--cap-drop ALL",
    "--security-opt no-new-privileges",
    "--pids-limit 64",
    "--memory 128m",
    "--memory-swap 128m",
    "--cpus 0.5",
    "--user 10001:10001",
  ]) {
    assert.equal(joined.includes(required), true, required);
  }
  assert.equal(joined.includes("--privileged"), false);
  assert.equal(joined.includes("--mount"), false);
  assert.equal(joined.includes("-v"), false);
  assert.equal(joined.includes("/work:rw,exec,nosuid,nodev,mode=1777,size=64m"), true);
  assert.equal(joined.includes('printf("secret")'), false);
});

test("runner task rejects empty source, oversized source, too many tests, and oversized input", async () => {
  await assert.rejects(
    () => runDockerTask({ sourceCode: "", tests: [publicCase()] }, { config: dockerConfig }),
    (error) => error.code === "EMPTY_CODE_SOURCE",
  );
  await assert.rejects(
    () => runDockerTask({ sourceCode: "x".repeat(65), tests: [publicCase()] }, { config: dockerConfig }),
    (error) => error.code === "CODE_SOURCE_TOO_LARGE",
  );
  await assert.rejects(
    () =>
      runDockerTask(
        { sourceCode: "int main(void){return 0;}", tests: [publicCase(), publicCase(), publicCase()] },
        { config: dockerConfig },
      ),
    (error) => error.code === "CODE_TEST_COUNT_LIMIT",
  );
  await assert.rejects(
    () =>
      runDockerTask(
        { sourceCode: "int main(void){return 0;}", tests: [{ ...publicCase(), input: "x".repeat(33) }] },
        { config: dockerConfig },
      ),
    (error) => error.code === "CODE_TEST_INPUT_TOO_LARGE",
  );
});

test("student supplied limits, image, and commands do not reach docker args or runner json", async () => {
  const capture = {};
  await runDockerTask(
    {
      sourceCode: "int main(void){return 0;}",
      image: "evil/image",
      runCommand: "cat /etc/passwd",
      limits: { caseTimeoutMs: 999999, maxOutputBytes: 999999 },
      tests: [publicCase()],
    },
    {
      config: dockerConfig,
      spawnFn: fakeSpawn(acceptedRunnerResult(), capture),
      execFileFn: fakeExecFile,
    },
  );
  assert.equal(capture.file, "docker");
  assert.equal(capture.options.shell, false);
  assert.equal(capture.args.includes("evil/image"), false);
  assert.equal(capture.args.includes("cat /etc/passwd"), false);
  const task = JSON.parse(capture.stdin);
  assert.equal(task.limits.caseTimeoutMs, dockerConfig.caseTimeoutMs);
  assert.equal(task.limits.maxOutputBytes, dockerConfig.maxOutputBytes);
  assert.equal(JSON.stringify(task).includes("runCommand"), false);
});

test("runner invalid output and disabled mode fail safely", async () => {
  await assert.rejects(
    () =>
      runDockerTask(
        { sourceCode: "int main(void){return 0;}", tests: [publicCase()] },
        {
          config: { ...dockerConfig, mode: "disabled" },
        },
      ),
    (error) => error.code === "CODE_EXECUTION_UNAVAILABLE",
  );
  await assert.rejects(
    () =>
      runDockerTask(
        { sourceCode: "int main(void){return 0;}", tests: [publicCase()] },
        {
          config: dockerConfig,
          spawnFn: fakeSpawnRaw("not-json", {}),
          execFileFn: fakeExecFile,
        },
      ),
    (error) => error.code === "CODE_EXECUTION_UNAVAILABLE",
  );
  await assert.rejects(
    () =>
      runDockerTask(
        { sourceCode: "int main(void){return 0;}", tests: [publicCase()] },
        {
          config: dockerConfig,
          spawnFn: fakeSpawnRaw("", {}),
          execFileFn: fakeExecFile,
        },
      ),
    (error) => error.code === "CODE_EXECUTION_UNAVAILABLE",
  );
});

test("result projection maps statuses and keeps hidden tests private", () => {
  const result = toApiResult(
    {
      compile: { status: "success", message: "", durationMs: 12 },
      execution: {
        status: "wrong_answer",
        passedCount: 1,
        totalCount: 2,
        cases: [
          {
            id: "public-1",
            visibility: "public",
            status: "accepted",
            stdout: "ok",
            stderr: "",
            durationMs: 1,
          },
          {
            id: "hidden-1",
            visibility: "hidden",
            status: "wrong_answer",
            stdout: "secret input",
            stderr: "secret",
            message: "expected hidden",
            durationMs: 1,
          },
        ],
      },
    },
    { mode: "submit", executionMode: "docker", includePublicStdout: true },
  );
  assert.equal(result.status, "wrong_answer");
  assert.equal(result.stdout, "ok");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret input"), false);
  assert.equal(serialized.includes("expected hidden"), false);
  assert.equal(serialized.includes("expectedOutput"), false);
});

test("diagnostics redact Windows paths, container paths, docker commands, and ids", () => {
  const text = sanitizeDiagnostic(
    "C:\\Users\\demo\\main.c /work/case-1/main.c docker run secret abcdef1234567890",
  );
  assert.equal(text.includes("C:\\Users"), false);
  assert.equal(text.includes("/work/case"), false);
  assert.equal(text.includes("docker run secret"), false);
  assert.equal(text.includes("abcdef1234567890"), false);
});

function publicCase() {
  return { id: "public-1", visibility: "public", input: "", expectedOutput: "" };
}

function acceptedRunnerResult() {
  return {
    protocolVersion: "code-runner-c.v1",
    compile: { status: "success", message: "", durationMs: 1 },
    execution: {
      status: "accepted",
      passedCount: 1,
      totalCount: 1,
      cases: [
        { id: "public-1", visibility: "public", status: "accepted", stdout: "", stderr: "", durationMs: 1 },
      ],
    },
  };
}

function fakeSpawn(result, capture) {
  return fakeSpawnRaw(JSON.stringify(result), capture);
}

function fakeSpawnRaw(stdoutText, capture) {
  return (file, args, options) => {
    capture.file = file;
    capture.args = args;
    capture.options = options;
    capture.stdin = "";
    const child = new EventEmitter();
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        capture.stdin += chunk.toString("utf8");
        callback();
      },
    });
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = () => {
      capture.killed = true;
    };
    process.nextTick(() => {
      child.stdout.push(stdoutText);
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("close", 0));
    });
    return child;
  };
}

function fakeExecFile(file, args, options, callback) {
  callback(null, "", "");
}
