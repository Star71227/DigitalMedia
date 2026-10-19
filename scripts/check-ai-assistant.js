#!/usr/bin/env node
/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * AI 学习助手自检：一条命令确认"我这台机器的助手效果"和已调通的机器是否一致。
 *
 * 用法（在仓库根目录）：
 *   node scripts/check-ai-assistant.js
 *   node scripts/check-ai-assistant.js --base http://127.0.0.1:5801 --user zhangsan
 *
 * 会在不打印密钥的前提下检查：
 *   1. backend/.env 里 LLM_API_KEY / 三个开关是否配好
 *   2. 后端 /api/ai-learning/model-health 是否报告模型可用
 *   3. 用「你好」「今天天气怎么样？」两个真实提问验证助手是否真在调用模型
 *
 * 退出码 0 = 与已调通机器一致；1 = 还有配置没做（下面会直接写明缺什么）。
 */
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const BASE = arg("base", "http://127.0.0.1:5801").replace(/\/$/, "");
const USERNAME = arg("user", "zhangsan");
const PASSWORD = arg("password", "LearnMateLocal2026!");

function readEnv() {
  const envPath = path.resolve(__dirname, "..", "backend", ".env");
  if (!fs.existsSync(envPath)) return { envPath, exists: false, values: {} };
  const values = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return { envPath, exists: true, values };
}

const problems = [];

function checkEnv() {
  const { envPath, exists, values } = readEnv();
  console.log(`\n[1/3] 检查配置：${envPath}`);
  if (!exists) {
    problems.push("backend/.env 不存在：请复制 backend/.env.example 为 backend/.env");
    return;
  }
  const key = values.LLM_API_KEY || "";
  if (!key) {
    problems.push(
      "LLM_API_KEY 为空：登录智谱 BigModel 控制台拿一个 API Key 填进去（见 backend/.env.example 的智谱示例）",
    );
  } else {
    console.log(`  ✓ LLM_API_KEY 已填写（长度 ${key.length}，不打印内容）`);
  }
  for (const flag of ["AI_ENABLED", "MULTIMODAL_RESOURCE_AI_ENABLED", "MULTIMODAL_REVIEW_AI_ENABLED"]) {
    const value = String(values[flag] || "false").toLowerCase();
    if (value === "true") console.log(`  ✓ ${flag}=true`);
    else problems.push(`${flag} 不是 true：不打开会安静地走确定性兜底，看起来就像"模型没生效"`);
  }
  console.log(
    `  · LLM_PROVIDER=${values.LLM_PROVIDER || "(未设置)"} LLM_MODEL=${values.LLM_MODEL || "(未设置)"}`,
  );
  console.log(
    `  · LLM_API_URL=${values.LLM_API_URL || "(未设置)"} LLM_TIMEOUT_MS=${values.LLM_TIMEOUT_MS || "(未设置)"}`,
  );
}

async function login() {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const payload = await response.json().catch(() => ({}));
  const token = payload.token || (payload.data && payload.data.token);
  if (!token)
    throw new Error(`登录失败（http=${response.status}）：${JSON.stringify(payload).slice(0, 160)}`);
  return token;
}

async function checkHealth(token) {
  console.log(`\n[2/3] 检查后端模型状态：${BASE}/api/ai-learning/model-health`);
  const response = await fetch(`${BASE}/api/ai-learning/model-health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  const ai = body.ai || {};
  console.log(
    `  http=${response.status} enabled=${ai.enabled} available=${ai.available} provider=${ai.provider || "-"} model=${ai.model || "-"} credentialsComplete=${ai.credentialsComplete}`,
  );
  if (!ai.available || ai.credentialsComplete === false) {
    problems.push(
      "model-health 显示模型不可用：多半是 key 没填或填错（credentialsComplete=false），或后端没重启",
    );
  }
}

async function checkAssistant(token) {
  console.log("\n[3/3] 真实提问验证（这就是组员和你的效果对比点）");
  const questions = ["你好", "今天天气怎么样？"];
  for (const question of questions) {
    const response = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: question }),
    });
    const body = await response.json().catch(() => ({}));
    const mode = body.sourceMode || body.code || "-";
    const chars = String(body.answerMarkdown || "").length;
    const ok = response.status === 200 && ["model_only", "rag_model"].includes(mode) && chars > 30;
    console.log(`  ${ok ? "✓" : "✗"} 「${question}」http=${response.status} mode=${mode} 字数=${chars}`);
    if (!ok) {
      problems.push(`「${question}」没有得到模型回答（mode=${mode}）：说明这台机器还没和已调通的机器对齐`);
    }
  }
}

(async () => {
  console.log("AI 学习助手自检开始（不会打印任何密钥）");
  checkEnv();
  try {
    const token = await login();
    await checkHealth(token);
    await checkAssistant(token);
  } catch (error) {
    problems.push(`无法连接后端 ${BASE}：${error.message}（先启动后端：cd backend && node src/index.js）`);
  }

  console.log("\n================ 结论 ================");
  if (!problems.length) {
    console.log("✅ 通过：这台机器上的 AI 助手效果与已调通的机器一致。");
    process.exit(0);
  }
  console.log("❌ 还需要处理：");
  for (const item of problems) console.log(`  - ${item}`);
  console.log(
    "\n参考 backend/.env.example 里的「智谱 BigModel（GLM）示例」段落逐项配置，改完重启后端再跑一次本脚本。",
  );
  process.exit(1);
})();
