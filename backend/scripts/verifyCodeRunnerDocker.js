/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { runDockerTask } = require("../src/services/dockerCodeRunnerService");

process.env.CODE_EXECUTION_MODE = process.env.CODE_EXECUTION_MODE || "docker";
process.env.CODE_RUNNER_IMAGE = process.env.CODE_RUNNER_IMAGE || "learnmate/code-runner-c:2.4a";

async function main() {
  const sourceCode = [
    "#include <stdio.h>",
    "int main(void) {",
    "  char input[64] = {0};",
    '  if (fgets(input, sizeof(input), stdin)) printf("hello %s", input);',
    "  return 0;",
    "}",
  ].join("\n");
  const result = await runDockerTask({
    language: "c",
    sourceCode,
    tests: [
      { id: "hello-public-1", visibility: "public", input: "runner\n", expectedOutput: "hello runner" },
    ],
  });
  const passed = result.compile.status === "success" && result.execution.status === "accepted";
  console.log(
    JSON.stringify(
      {
        passed,
        executionMode: "docker",
        image: process.env.CODE_RUNNER_IMAGE,
        compile: result.compile.status,
        status: result.execution.status,
        passedCount: result.execution.passedCount,
        totalCount: result.execution.totalCount,
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
  const checks = [
    {
      name: "custom-input",
      sourceCode:
        '#include <stdio.h>\nint main(void){int a,b;if(scanf("%d%d",&a,&b)==2)printf("%d",a+b);return 0;}',
      input: "7 8",
      compareOutput: false,
      status: "accepted",
      stdout: "15",
    },
    {
      name: "wrong-answer",
      sourceCode: '#include <stdio.h>\nint main(void){puts("wrong");return 0;}',
      status: "wrong_answer",
    },
    { name: "compile-error", sourceCode: "int main(void){ syntax error }", status: "compile_error" },
    { name: "time-limit", sourceCode: "int main(void){for(;;){}return 0;}", status: "timeout" },
    {
      name: "output-limit",
      sourceCode: '#include <stdio.h>\nint main(void){for(;;)puts("0123456789");}',
      status: "output_limit",
    },
    { name: "runtime-error", sourceCode: "int main(void){return 7;}", status: "runtime_error" },
  ];
  for (const check of checks) {
    const actual = await runDockerTask({
      language: "c",
      sourceCode: check.sourceCode,
      tests: [
        {
          id: check.name,
          visibility: "public",
          input: check.input || "",
          expectedOutput: "expected",
          compareOutput: check.compareOutput !== false,
        },
      ],
    });
    const ok =
      actual.execution.status === check.status &&
      (check.stdout === undefined || actual.execution.cases[0]?.stdout === check.stdout);
    console.log(JSON.stringify({ check: check.name, passed: ok, status: actual.execution.status }));
    if (!ok) process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.code || "CODE_RUNNER_VERIFY_FAILED");
    console.error(error.message);
    process.exitCode = 1;
  });
}
