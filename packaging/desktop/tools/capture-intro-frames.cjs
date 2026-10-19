/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// 从登录入场动画（登录成功后全屏播放的书页 logo 开场，约 2.4s）里连拍取帧，
// 用于生成桌面端的「应用封面」和安装程序的小图标。
//
// 关键点：Page.captureScreenshot 每次要 1~2 秒，抓 2.4 秒的动画根本不够用，
// 所以这里改用 Page.startScreencast（浏览器主动推帧，约 10~30fps）。
//
// 依赖 backend/node_modules 里的 ws。
// 用法： node packaging\desktop\tools\capture-intro-frames.cjs [appUrl] [outDir]
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const WS_PATH = "D:/Users/29973/Desktop/-/backend/node_modules/ws";
const WebSocket = require(WS_PATH);

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const APP = process.argv[2] || "http://127.0.0.1:8080";
const OUT = process.argv[3] || "D:/demo-deepseeek_harness/.tmp/intro-frames";
const PORT = 9335;
const USERNAME = "zhangsan";
const PASSWORD = "LearnMateLocal2026!";
const VIEW = { width: 1512, height: 982 };
const CAPTURE_MS = 4200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(b));
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
    this.handlers = new Map();
  }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => {
      ws.on("open", res);
      ws.on("error", rej);
    });
    const c = new Cdp(ws);
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method && c.handlers.has(msg.method)) {
        c.handlers.get(msg.method)(msg.params);
      }
    });
    return c;
  }
  on(method, fn) {
    this.handlers.set(method, fn);
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

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) {
    if (/\.(png|jpg|json)$/i.test(f)) fs.rmSync(path.join(OUT, f), { force: true });
  }

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
      "--force-device-scale-factor=1",
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
    deviceScaleFactor: 2,
    mobile: false,
  });

  const url = `${APP}/student`;
  console.log(`打开登录页：${url}`);
  await cdp.send("Page.navigate", { url });
  await sleep(7000);

  const ready = await cdp.send("Runtime.evaluate", {
    expression:
      "Boolean(document.querySelector('#student-identifier') && document.querySelector('#student-password'))",
    returnByValue: true,
  });
  if (!ready.result.value) throw new Error("登录表单没出现，检查前端是否在运行");

  const frames = [];
  const started = Date.now();
  cdp.on("Page.screencastFrame", (params) => {
    const at = Date.now() - started;
    const file = path.join(OUT, `t${String(at).padStart(5, "0")}ms.jpg`);
    try {
      fs.writeFileSync(file, Buffer.from(params.data, "base64"));
    } catch {}
    frames.push({ atMs: at, file, bytes: 0 });
    cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 95,
    maxWidth: VIEW.width,
    maxHeight: VIEW.height,
    everyNthFrame: 1,
  });
  console.log("提交登录，开始录入场动画…");
  await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const setValue = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        };
        setValue(document.querySelector("#student-identifier"), ${JSON.stringify(USERNAME)});
        setValue(document.querySelector("#student-password"), ${JSON.stringify(PASSWORD)});
        document.querySelector(".lm-login-submit").click();
        return "submitted";
      })()
    `,
    returnByValue: true,
  });

  await sleep(CAPTURE_MS);
  await cdp.send("Page.stopScreencast").catch(() => {});

  let total = 0;
  for (const f of frames) {
    if (fs.existsSync(f.file)) {
      f.bytes = fs.statSync(f.file).size;
      total += f.bytes;
    }
  }
  fs.writeFileSync(path.join(OUT, "frames.json"), JSON.stringify(frames, null, 2));
  cdp.close();
  try {
    edge.kill();
  } catch {}
  console.log(`\n共 ${frames.length} 帧，合计 ${(total / 1024 / 1024).toFixed(1)} MB，输出目录：${OUT}`);
  console.log(
    `时间范围：${frames[0] ? frames[0].atMs : 0} ms ~ ${frames[frames.length - 1] ? frames[frames.length - 1].atMs : 0} ms`,
  );
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
