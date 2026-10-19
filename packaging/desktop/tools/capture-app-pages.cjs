/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// 用无头 Edge + CDP 真实登录桌面版的学生端 / 教师端，并截图（用于核对"两端都能登、效果和云端一致"）
//
// 用法：
//   node packaging\desktop\tools\capture-app-pages.cjs --student 8082 --teacher 8083 --out D:\tmp\shots
// 可选：--studentUser zhangsan --studentPass LearnMateLocal2026! --teacherUser teacher_demo --teacherPass LearnMateLocal2026!
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const WebSocket = require("D:/Users/29973/Desktop/-/backend/node_modules/ws");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const STUDENT_PORT = arg("student", "8080");
const STUDENT_URL = arg("studentUrl", `http://127.0.0.1:${STUDENT_PORT}/student`);
const TEACHER_URL = arg("teacherUrl", `http://127.0.0.1:${arg("teacher", "8081")}/`);
const TEACHER_PORT = arg("teacher", "8081");
const OUT = arg("out", "D:/demo-deepseeek_harness/.tmp/app-pages");
const STUDENT_USER = arg("studentUser", "zhangsan");
const STUDENT_PASS = arg("studentPass", "LearnMateLocal2026!");
const TEACHER_USER = arg("teacherUser", "teacher_demo");
const TEACHER_PASS = arg("teacherPass", "LearnMateLocal2026!");
const VIEW = { width: 1512, height: 982 };
const PORT = 9336;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
  }
  static async connect(url) {
    const ws = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => {
      ws.on("open", res);
      ws.on("error", rej);
    });
    const cdp = new Cdp(ws);
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
    return cdp;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 60000);
    });
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

const FILL_AND_SUBMIT = (user, pass) => `
  (() => {
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const all = Array.from(document.querySelectorAll("input")).filter((el) => el.type !== "hidden" && !el.disabled);
    const passInput = document.querySelector('input[name="teacher-password"], #student-password, input[type="password"]')
      || all.find((el) => el.type === "password");
    const userInput = document.querySelector('input[name="teacher-identifier"], #student-identifier, input[name="identifier"]')
      || all.find((el) => el.type !== "password" && el.type !== "checkbox" && el.type !== "radio");
    if (!userInput || !passInput) return "no-form";
    setValue(userInput, ${JSON.stringify(user)});
    setValue(passInput, ${JSON.stringify(pass)});
    const form = passInput.closest("form");
    if (!form) return "no-form";
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.querySelector('button[type="submit"], .lm-login-submit').click();
    return "submitted";
  })()
`;

async function shoot(cdp, name) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
  return file;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(OUT, "profile");
  fs.rmSync(profile, { recursive: true, force: true });

  const edge = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      `--window-size=${VIEW.width},${VIEW.height}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let target = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
      target = list.find((t) => t.type === "page");
      if (target && target.webSocketDebuggerUrl) break;
    } catch {}
  }
  if (!target) throw new Error("无法连接 Edge 调试端口");

  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const results = [];
  for (const site of [
    { key: "student", label: "学生端", url: STUDENT_URL, user: STUDENT_USER, pass: STUDENT_PASS },
    { key: "teacher", label: "教师端", url: TEACHER_URL, user: TEACHER_USER, pass: TEACHER_PASS },
  ]) {
    console.log(`\n=== ${site.label} ${site.url} （${site.user}）===`);
    await cdp.send("Page.navigate", { url: site.url });
    await sleep(7000);
    const loginShot = await shoot(cdp, `${site.key}-1-login`);
    console.log(`  登录页截图：${loginShot}`);

    const filled = await cdp.send("Runtime.evaluate", {
      expression: FILL_AND_SUBMIT(site.user, site.pass),
      returnByValue: true,
    });
    console.log(`  填表结果：${filled.result.value}`);
    await sleep(9000); // 学生端登录后有 ~3.2s 入场动画

    const homeShot = await shoot(cdp, `${site.key}-2-home`);
    const title = await cdp.send("Runtime.evaluate", { expression: "document.title", returnByValue: true });
    const text = await cdp.send("Runtime.evaluate", {
      expression: "document.body.innerText.replace(/\\s+/g,' ').slice(0,200)",
      returnByValue: true,
    });
    const url = await cdp.send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
    console.log(`  页面：${title.result.value} | ${url.result.value}`);
    console.log(`  正文：${text.result.value}`);
    console.log(`  首页截图：${homeShot}`);
    results.push({
      site: site.key,
      loginShot,
      homeShot,
      title: title.result.value,
      url: url.result.value,
      text: text.result.value,
    });
  }

  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(results, null, 2));
  cdp.close();
  try {
    edge.kill();
  } catch {}
  console.log(`\n截图目录：${OUT}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
