/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("child_process");
const { promisify } = require("util");

process.env.CODE_EXECUTION_MODE = process.env.CODE_EXECUTION_MODE || "docker";
process.env.CODE_RUNNER_IMAGE = process.env.CODE_RUNNER_IMAGE || "learnmate/code-runner-c:2.4a";

const { runDockerTask } = require("../src/services/dockerCodeRunnerService");

const execFileAsync = promisify(execFile);

test("docker runner compiles and runs a fixed hello program", async () => {
  const result = await runC(
    `#include <stdio.h>
int main(void){ printf("hello"); return 0; }`,
    [{ input: "", expectedOutput: "hello" }],
  );
  assert.equal(result.compile.status, "success");
  assert.equal(result.execution.status, "accepted");
});

test("correct red-black left rotation solution passes public and hidden tests", async () => {
  const result = await runC(correctRotationSource(), rotationTests());
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
  assert.equal(result.execution.passedCount, result.execution.totalCount);
});

test("syntax error maps to compile_error", async () => {
  const result = await runC("int main(void) { syntax error }", [{ input: "", expectedOutput: "" }]);
  assert.equal(result.compile.status, "compile_error");
  assert.equal(result.execution.status, "compile_error");
});

test("wrong output maps to wrong_answer", async () => {
  const result = await runC(
    `#include <stdio.h>
int main(void){ printf("bad"); return 0; }`,
    [{ input: "", expectedOutput: "ok" }],
  );
  assert.equal(result.execution.status, "wrong_answer");
});

test("fixed-output speculative program is caught by hidden tests", async () => {
  const result = await runC(
    `#include <stdio.h>
int main(void){
  int a,b,c;
  if (scanf("%d %d %d",&a,&b,&c) != 3) return 0;
  if (a==10 && b==20 && c==15) printf("20 10 15");
  else if (a==1 && b==2 && c==0) printf("2 1 0");
  else printf("20 10 15");
  return 0;
}`,
    rotationTests(),
  );
  assert.equal(result.execution.status, "wrong_answer");
  assert.equal(
    result.execution.cases.some((item) => item.visibility === "hidden" && item.status !== "accepted"),
    true,
  );
});

test("runtime error maps to runtime_error", async () => {
  const result = await runC(
    `#include <stdlib.h>
int main(void){ abort(); return 0; }`,
    [{ input: "", expectedOutput: "" }],
  );
  assert.equal(result.execution.status, "runtime_error");
});

test("infinite loop maps to timeout", async () => {
  const result = await runC("int main(void){ while(1){} return 0; }", [{ input: "", expectedOutput: "" }], {
    caseTimeoutMs: 700,
    totalTimeoutMs: 4000,
  });
  assert.equal(result.execution.status, "timeout");
});

test("huge stdout maps to output_limit", async () => {
  const result = await runC(
    `#include <stdio.h>
int main(void){ for(int i=0;i<20000;i++) putchar('x'); return 0; }`,
    [{ input: "", expectedOutput: "" }],
    { maxOutputBytes: 1024 },
  );
  assert.equal(result.execution.status, "output_limit");
});

test("network none prevents external connection", async () => {
  const result = await runC(
    `#include <stdio.h>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>
int main(void){
  alarm(1);
  int s=socket(AF_INET,SOCK_STREAM,0);
  struct sockaddr_in a; a.sin_family=AF_INET; a.sin_port=htons(80); inet_pton(AF_INET,"1.1.1.1",&a.sin_addr);
  int rc=connect(s,(struct sockaddr*)&a,sizeof(a));
  printf("%s", rc==0 ? "network-open" : "no-network");
  return 0;
}`,
    [{ input: "", expectedOutput: "no-network" }],
    { caseTimeoutMs: 1500 },
  );
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
});

test("container runs as non-root", async () => {
  const result = await runC(
    `#include <stdio.h>
#include <unistd.h>
int main(void){ printf("%s", getuid()==0 ? "root" : "nonroot"); return 0; }`,
    [{ input: "", expectedOutput: "nonroot" }],
  );
  assert.equal(result.execution.status, "accepted");
});

test("root filesystem is read-only and workdir is writable tmpfs", async () => {
  const result = await runC(
    `#include <stdio.h>
int main(void){
  FILE *root=fopen("/probe-learnmate","w");
  FILE *work=fopen("/work/probe","w");
  if(work){ fputs("ok", work); fclose(work); }
  printf("%s", root==NULL && work!=NULL ? "readonly-tmpfs" : "bad");
  if(root) fclose(root);
  return 0;
}`,
    [{ input: "", expectedOutput: "readonly-tmpfs" }],
  );
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
});

test("linux capabilities are dropped", async () => {
  const result = await runC(statusProbeSource("CapEff", "0000000000000000", "caps-dropped"), [
    { input: "", expectedOutput: "caps-dropped" },
  ]);
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
});

test("no-new-privileges is enabled", async () => {
  const result = await runC(statusProbeSource("NoNewPrivs", "1", "nnp-on"), [
    { input: "", expectedOutput: "nnp-on" },
  ]);
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
});

test("memory cgroup limit exists", async () => {
  const result = await runC(cgroupProbeSource("/sys/fs/cgroup/memory.max", "memory-limited"), [
    { input: "", expectedOutput: "memory-limited" },
  ]);
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
});

test("cpu cgroup limit exists", async () => {
  const result = await runC(cgroupProbeSource("/sys/fs/cgroup/cpu.max", "cpu-limited"), [
    { input: "", expectedOutput: "cpu-limited" },
  ]);
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
});

test("pid cgroup limit exists", async () => {
  const result = await runC(cgroupProbeSource("/sys/fs/cgroup/pids.max", "pid-limited"), [
    { input: "", expectedOutput: "pid-limited" },
  ]);
  assert.equal(result.execution.status, "accepted", JSON.stringify(result));
});

test("runner containers are removed after task", async () => {
  await runC(
    `#include <stdio.h>
int main(void){ printf("clean"); return 0; }`,
    [{ input: "", expectedOutput: "clean" }],
  );
  const { stdout } = await execFileAsync(
    "docker",
    ["ps", "-a", "--filter", "name=learnmate-code-runner-", "--format", "{{.Names}}"],
    { shell: false },
  );
  assert.equal(stdout.trim(), "");
});

test("files do not persist between tasks", async () => {
  const first = await runC(
    `#include <stdio.h>
int main(void){ FILE *f=fopen("/work/leak","w"); if(f){fputs("x",f); fclose(f);} printf("wrote"); return 0; }`,
    [{ input: "", expectedOutput: "wrote" }],
  );
  assert.equal(first.execution.status, "accepted");
  const second = await runC(
    `#include <stdio.h>
int main(void){ FILE *f=fopen("/work/leak","r"); printf("%s", f ? "leaked" : "isolated"); if(f) fclose(f); return 0; }`,
    [{ input: "", expectedOutput: "isolated" }],
  );
  assert.equal(second.execution.status, "accepted");
});

test("normal task still works after a timeout", async () => {
  await runC("int main(void){ while(1){} return 0; }", [{ input: "", expectedOutput: "" }], {
    caseTimeoutMs: 500,
    totalTimeoutMs: 3000,
  });
  const result = await runC(
    `#include <stdio.h>
int main(void){ printf("after-timeout"); return 0; }`,
    [{ input: "", expectedOutput: "after-timeout" }],
  );
  assert.equal(result.execution.status, "accepted");
});

test("hidden case output is not returned by the runner", async () => {
  const result = await runC(
    `#include <stdio.h>
int main(void){ char s[64]; if(scanf("%63s", s)==1) printf("%s", s); return 0; }`,
    [{ visibility: "hidden", input: "secret-hidden-input", expectedOutput: "secret-hidden-input" }],
  );
  const serialized = JSON.stringify(result);
  assert.equal(result.execution.status, "accepted");
  assert.equal(serialized.includes("secret-hidden-input"), false);
});

async function runC(sourceCode, tests, overrides = {}) {
  return runDockerTask(
    {
      language: "c",
      sourceCode,
      tests: tests.map((item, index) => ({
        id: item.id || `${item.visibility || "public"}-${index + 1}`,
        visibility: item.visibility || "public",
        input: item.input || "",
        expectedOutput: item.expectedOutput || "",
      })),
    },
    { config: runnerConfig(overrides) },
  );
}

function runnerConfig(overrides = {}) {
  return {
    mode: "docker",
    image: process.env.CODE_RUNNER_IMAGE || "learnmate/code-runner-c:2.4a",
    memory: "128m",
    memorySwap: "128m",
    cpus: 0.5,
    pidsLimit: 64,
    nofileLimit: 64,
    nprocLimit: 64,
    maxSourceBytes: 65536,
    maxInputBytes: 32768,
    maxOutputBytes: 65536,
    maxTests: 20,
    compileTimeoutMs: 5000,
    caseTimeoutMs: 2000,
    totalTimeoutMs: 15000,
    workTmpfsSize: "64m",
    tmpTmpfsSize: "16m",
    user: "10001:10001",
    ...overrides,
  };
}

function rotationTests() {
  return [
    { visibility: "public", input: "10 20 15", expectedOutput: "20 10 15" },
    { visibility: "public", input: "1 2 0", expectedOutput: "2 1 0" },
    { visibility: "hidden", input: "4 9 6", expectedOutput: "9 4 6" },
    { visibility: "hidden", input: "100 200 150", expectedOutput: "200 100 150" },
    { visibility: "hidden", input: "0 1 -1", expectedOutput: "1 0 -1" },
  ];
}

function correctRotationSource() {
  return `#include <stdio.h>
typedef struct Node { int key; struct Node *left, *right, *parent; } Node;
void rotateLeft(Node **root, Node *x) {
  Node *y = x->right;
  if (!y) return;
  x->right = y->left;
  if (y->left) y->left->parent = x;
  y->parent = x->parent;
  if (!x->parent) *root = y;
  else if (x == x->parent->left) x->parent->left = y;
  else x->parent->right = y;
  y->left = x;
  x->parent = y;
}
int main(void) {
  int xKey=0,yKey=0,betaKey=0;
  if (scanf("%d %d %d", &xKey, &yKey, &betaKey) != 3) return 1;
  Node x={xKey,0,0,0}, y={yKey,0,0,0}, beta={betaKey,0,0,0};
  x.right=&y; y.parent=&x; y.left=&beta; beta.parent=&y;
  Node *root=&x; rotateLeft(&root,&x);
  if (root != &y || y.left != &x || x.parent != &y || x.right != &beta || beta.parent != &x) { printf("invalid"); return 0; }
  printf("%d %d %d", root->key, root->left->key, root->left->right->key);
  return 0;
}`;
}

function statusProbeSource(key, expected, label) {
  return `#include <stdio.h>
#include <string.h>
int main(void){
  FILE *f=fopen("/proc/self/status","r");
  char line[256];
  int ok=0;
  while(f && fgets(line,sizeof(line),f)){
    if(strncmp(line,"${key}:",${key.length + 1})==0 && strstr(line,"${expected}")) ok=1;
  }
  if(f) fclose(f);
  printf("%s", ok ? "${label}" : "bad");
  return 0;
}`;
}

function cgroupProbeSource(filePath, label) {
  return `#include <stdio.h>
#include <string.h>
int main(void){
  FILE *f=fopen("${filePath}","r");
  char value[128]={0};
  if(f){ fgets(value,sizeof(value),f); fclose(f); }
  printf("%s", value[0] && strncmp(value,"max",3)!=0 ? "${label}" : "bad");
  return 0;
}`;
}
