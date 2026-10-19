/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/*
 * 智课研伴 LearnMate — 桌面端主进程（Electron 外壳）
 *
 * 职责：
 *   1. 找到软件根目录（本文件位于 <根>\resources\app\main.js）
 *   2. 用包内 scripts\start-learnmate.ps1 拉起内置 MySQL + 后端 + 学生端/教师端静态服务
 *   3. 启动期间显示启动画面（首次启动要建库灌数据，1~3 分钟）
 *   4. 服务就绪后用应用窗口（不是浏览器）加载学生端页面；教师端可另开窗口
 *   5. 退出时优雅停掉所有服务（走 scripts\stop-learnmate.ps1，让 MySQL 正常关闭）
 */
"use strict";

const { app, BrowserWindow, Menu, shell, dialog, Tray, nativeImage } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const SHELL_DIR = __dirname;

/* 启动参数：--teacher 直接打开教师端（安装程序会分别建「学生端」「教师端」两个快捷方式） */
const START_MODE = process.argv.slice(1).some((arg) => /^--teacher$/i.test(arg)) ? "teacher" : "student";

/* ------------------------------------------------------------------ 环境 */

function findRoot() {
  let dir = SHELL_DIR;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "scripts", "start-learnmate.ps1"))) return dir;
    const up = path.resolve(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(SHELL_DIR, "..", "..");
}

const ROOT = findRoot();
const PATHS = {
  root: ROOT,
  scripts: path.join(ROOT, "scripts"),
  start: path.join(ROOT, "scripts", "start-learnmate.ps1"),
  stop: path.join(ROOT, "scripts", "stop-learnmate.ps1"),
  config: path.join(ROOT, "runtime", "config.json"),
  logs: path.join(ROOT, "logs"),
  data: path.join(ROOT, "data"),
};

const DEFAULT_PORTS = { mysql: 13306, backend: 5800, student: 8080, teacher: 8081 };

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {
    /* ignore */
  }
}

function readConfig() {
  try {
    const raw = fs.readFileSync(PATHS.config, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function ports() {
  const cfg = readConfig();
  const p = (cfg && cfg.ports) || {};
  return {
    mysql: Number(p.mysql) || DEFAULT_PORTS.mysql,
    backend: Number(p.backend) || DEFAULT_PORTS.backend,
    student: Number(p.student) || DEFAULT_PORTS.student,
    teacher: Number(p.teacher) || DEFAULT_PORTS.teacher,
  };
}

function isFirstRun() {
  const cfg = readConfig();
  return !(cfg && cfg.seeded === true);
}

const urls = () => {
  const p = ports();
  return {
    ports: p,
    student: `http://127.0.0.1:${p.student}/student`,
    teacher: `http://127.0.0.1:${p.teacher}/`,
  };
};

/* ------------------------------------------------------------------ 日志 */

ensureDir(PATHS.logs);
const SHELL_LOG = path.join(PATHS.logs, "desktop-shell.log");
function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
  try {
    fs.appendFileSync(SHELL_LOG, line);
  } catch (_) {
    /* ignore */
  }
  process.stdout.write(line);
}

/* --------------------------------------------------------------- 状态窗口 */

let splash = null;
let mainWindow = null;
let teacherWindow = null;
let tray = null;
let quitting = false;
let servicesStarted = false;

function setSplashStatus(text) {
  if (!splash || splash.isDestroyed()) return;
  const payload = JSON.stringify(String(text));
  splash.webContents
    .executeJavaScript(`window.__setStatus && window.__setStatus(${payload});`)
    .catch(() => {});
}

function showSplash(title) {
  if (splash && !splash.isDestroyed()) {
    setSplashStatus(title);
    return splash;
  }
  splash = new BrowserWindow({
    width: 560,
    height: 368,
    frame: false,
    resizable: false,
    show: false,
    center: true,
    backgroundColor: "#0b1220",
    icon: iconPath(),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadFile(path.join(SHELL_DIR, "pages", "splash.html"), {
    search: `?title=${encodeURIComponent(title)}`,
  });
  splash.once("ready-to-show", () => splash.show());
  splash.on("closed", () => {
    splash = null;
  });
  return splash;
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close();
  splash = null;
}

function iconPath() {
  const candidates = [
    path.join(ROOT, "LearnMate.ico"),
    path.join(SHELL_DIR, "assets", "LearnMate.ico"),
    path.join(ROOT, "web", "student", "logo.png"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return undefined;
}

/* ------------------------------------------------------------ 获取/启动服务 */

function psCommand(scriptPath, extraArgs) {
  const escaped = String(scriptPath).replace(/'/g, "''");
  const args = (extraArgs || []).join(" ");
  return [
    '$ErrorActionPreference="Continue";',
    "try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {};",
    `& '${escaped}' ${args}`,
    "; exit $LASTEXITCODE",
  ].join(" ");
}

function runPowerShell(scriptPath, extraArgs, opts) {
  const options = opts || {};
  return spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      psCommand(scriptPath, extraArgs),
    ],
    {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    },
  );
}

function startServices() {
  return new Promise((resolve) => {
    if (!fs.existsSync(PATHS.start)) {
      resolve({ ok: false, error: `找不到启动脚本：${PATHS.start}` });
      return;
    }

    const first = isFirstRun();
    setSplashStatus(
      first
        ? "首次启动：正在初始化内置数据库并导入演示数据（约 1~3 分钟，请稍候）…"
        : "正在启动内置数据库与后端服务…",
    );

    const child = runPowerShell(PATHS.start, ["-NoBrowser", "-Quiet"]);
    let buffer = "";
    let lastStatus = "";

    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        log("start:", line);
        if (line.includes("[智课研伴]")) {
          const text = line.replace(/^\[智课研伴\]\s*/, "");
          if (text && text !== lastStatus) {
            lastStatus = text;
            setSplashStatus(text);
          }
        }
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const killer = setTimeout(
      () => {
        log("start script timed out after 20 minutes, killing");
        try {
          child.kill();
        } catch (_) {
          /* ignore */
        }
      },
      20 * 60 * 1000,
    );

    child.on("error", (err) => {
      clearTimeout(killer);
      resolve({ ok: false, error: `无法启动服务：${err.message}` });
    });

    child.on("exit", (code) => {
      clearTimeout(killer);
      if (code === 0) {
        servicesStarted = true;
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: lastStatus || `启动脚本退出码 ${code}` });
      }
    });
  });
}

function stopServices() {
  return new Promise((resolve) => {
    if (!fs.existsSync(PATHS.stop)) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const child = runPowerShell(PATHS.stop, ["-Quiet"]);
    child.stdout.on("data", (d) => log("stop:", d.toString("utf8").trim()));
    child.stderr.on("data", (d) => log("stop:", d.toString("utf8").trim()));
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(finish, 60000);
  });
}

function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 120000);
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get(url, { timeout: 4000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() > deadline) resolve(false);
        else setTimeout(tick, 1000);
      });
      req.on("timeout", () => {
        req.destroy();
      });
    };
    tick();
  });
}

/* ------------------------------------------------------------------ 窗口 */

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#f4f7fc",
    title: "智课研伴 LearnMate",
    icon: iconPath(),
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  /* 页面里的 <title> 会覆盖窗口标题，两个窗口在任务栏上就分不清了，这里锁死自己的标题 */
  mainWindow.on("page-title-updated", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url)) return { action: "allow" };
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  return mainWindow;
}

function loadStudent() {
  const { student } = urls();
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  mainWindow.setTitle("智课研伴 LearnMate — 学生端");
  mainWindow.loadURL(student).catch((err) => log("load student failed:", err.message));
}

function loadTeacher() {
  const { teacher } = urls();
  if (teacherWindow && !teacherWindow.isDestroyed()) {
    teacherWindow.focus();
    return;
  }
  teacherWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#f4f7fc",
    title: "智课研伴 LearnMate — 教师端",
    icon: iconPath(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  teacherWindow.on("page-title-updated", (event) => event.preventDefault());
  teacherWindow.once("ready-to-show", () => teacherWindow.show());
  teacherWindow.on("closed", () => {
    teacherWindow = null;
  });
  teacherWindow.loadURL(teacher).catch((err) => log("load teacher failed:", err.message));
}

function openInBrowser(url) {
  shell.openExternal(url).catch((err) => log("openExternal failed:", err.message));
}

function buildMenu() {
  const template = [
    {
      label: "页面(&P)",
      submenu: [
        { label: "学生端", accelerator: "CmdOrCtrl+1", click: () => loadStudent() },
        { label: "教师端（新窗口）", accelerator: "CmdOrCtrl+2", click: () => loadTeacher() },
        { type: "separator" },
        { label: "在浏览器中打开学生端", click: () => openInBrowser(urls().student) },
        { label: "在浏览器中打开教师端", click: () => openInBrowser(urls().teacher) },
        { type: "separator" },
        { label: "刷新当前页面", accelerator: "F5", click: (item, win) => win && win.reload() },
        { label: "返回学生端首页", click: () => loadStudent() },
      ],
    },
    {
      label: "服务(&S)",
      submenu: [
        {
          label: "重启后台服务",
          click: async () => {
            showSplash("正在重启后台服务…");
            await stopServices();
            const result = await startServices();
            closeSplash();
            if (result.ok) loadStudent();
            else showStartupError(result.error);
          },
        },
        {
          label: "导入云端数据（恢复成和云端一致）…",
          click: () => importCloudSeed(),
        },
        {
          label: "启用代码判题（Docker / 本机 VS）…",
          click: () => setupCodeJudge(),
        },
        { label: "打开日志文件夹", click: () => shell.openPath(PATHS.logs) },
        { label: "打开数据文件夹", click: () => shell.openPath(PATHS.data) },
        { type: "separator" },
        {
          label: "配置 AI 模型（千问/智谱等）",
          click: () => openInBrowser("") === undefined && runConfigTool(),
        },
        { type: "separator" },
        { label: "停止服务并退出", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "帮助(&H)",
      submenu: [
        { label: "使用说明", click: () => openDocs() },
        { label: "演示账号", click: () => showAccounts() },
        { label: "关于", click: () => showAbout() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function runConfigTool() {
  const bat = path.join(ROOT, "配置AI模型.bat");
  if (fs.existsSync(bat)) {
    spawn("cmd.exe", ["/c", "start", "", bat], { cwd: ROOT, windowsHide: false, detached: true }).unref();
  } else {
    dialog.showMessageBox({ type: "info", title: "配置 AI 模型", message: "未找到「配置AI模型.bat」" });
  }
}

function runScriptAndWait(scriptPath, extraArgs) {
  return new Promise((resolve) => {
    const child = runPowerShell(scriptPath, extraArgs || []);
    let output = "";
    child.stdout.on("data", (d) => {
      output += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      output += d.toString("utf8");
    });
    child.on("exit", (code) => resolve({ ok: code === 0, code, output }));
    child.on("error", (err) => resolve({ ok: false, code: -1, output: String(err.message) }));
  });
}

/* 把本机数据替换成安装包内置的云端快照（装在已有数据的目录、或数据被灌成演示数据时用） */
async function importCloudSeed() {
  const script = path.join(PATHS.scripts, "import-cloud-seed.ps1");
  if (!fs.existsSync(script)) {
    dialog.showMessageBox({
      type: "info",
      title: "导入云端数据",
      message: "安装包里没有导入脚本：scripts\\import-cloud-seed.ps1",
    });
    return;
  }
  const confirm = await dialog.showMessageBox({
    type: "warning",
    title: "导入云端数据",
    message: "把本机数据替换成安装包内置的云端快照？",
    detail: [
      "本机现有的账号、班级、作业、题库、资源、报告都会被云端那份替换；",
      "data\\storage 里的资源与报告文件也会被快照覆盖。",
      "",
      "想保留本机数据，请先备份安装目录下的 data 文件夹。",
    ].join("\n"),
    buttons: ["取消", "导入并重启"],
    defaultId: 0,
    cancelId: 0,
  });
  if (confirm.response !== 1) return;

  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  showSplash("正在导入云端数据…（约 1~3 分钟，请勿关闭）");
  await stopServices();
  const result = await runScriptAndWait(script, ["-Force"]);
  if (!result.ok) {
    closeSplash();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    dialog.showMessageBox({
      type: "error",
      title: "导入失败",
      message: "导入云端数据没有成功",
      detail: `${(result.output || "").slice(-1200)}\n\n详见 ${path.join(PATHS.logs, "desktop-shell.log")}`,
    });
    return;
  }
  const started = await startServices();
  closeSplash();
  if (started.ok) {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
    mainWindow.show();
    loadStudent();
  } else {
    showStartupError(started.error);
  }
}

/* 探测并启用代码判题执行器（Docker 优先，其次本机 Visual Studio），然后重启服务 */
async function setupCodeJudge() {
  const script = path.join(PATHS.scripts, "setup-code-judge.ps1");
  if (!fs.existsSync(script)) {
    dialog.showMessageBox({
      type: "info",
      title: "启用代码判题",
      message: "安装包里没有脚本：scripts\\setup-code-judge.ps1",
    });
    return;
  }
  const confirm = await dialog.showMessageBox({
    type: "question",
    title: "启用代码判题",
    message: "探测并启用代码判题执行器？",
    detail:
      "优先用 Docker（与云端一致，缺镜像会自动构建，需要几分钟）；没有可用 Docker 时改用本机 Visual Studio 的 C 编译器。结束后会自动重启后台服务。",
    buttons: ["取消", "开始"],
    defaultId: 1,
    cancelId: 0,
  });
  if (confirm.response !== 1) return;

  showSplash("正在探测并启用代码判题…（构建镜像时可能需要几分钟）");
  const result = await runScriptAndWait(script, ["-Restart"]);
  closeSplash();
  dialog.showMessageBox({
    type: result.ok ? "info" : "warning",
    title: "启用代码判题",
    message: result.ok ? "代码判题已启用" : "没有找到可用的执行器，或执行失败",
    detail: (result.output || "").trim().slice(-1500) || "（无输出）",
    buttons: ["好"],
  });
}

function openDocs() {
  const doc = path.join(ROOT, "使用说明.txt");
  if (fs.existsSync(doc)) shell.openPath(doc);
  else dialog.showMessageBox({ type: "info", title: "使用说明", message: "未找到使用说明文件。" });
}

function showAccounts() {
  const cfg = readConfig() || {};
  const password = cfg.demoPassword || "LearnMateLocal2026!";
  dialog.showMessageBox({
    type: "info",
    title: "演示账号",
    message: "本机演示账号",
    detail: [
      `学生端：zhangsan / lisi`,
      `教师端：teacher_demo`,
      `密码：${password}`,
      "",
      `学生端地址：${urls().student}`,
      `教师端地址：${urls().teacher}`,
    ].join("\n"),
    buttons: ["好"],
  });
}

function showAbout() {
  dialog.showMessageBox({
    type: "info",
    title: "关于",
    message: "智课研伴 LearnMate",
    detail: [
      `桌面端版本：${app.getVersion()}`,
      `安装目录：${ROOT}`,
      `Electron ${process.versions.electron} / Chromium ${process.versions.chrome} / Node ${process.versions.node}`,
      "",
      "全部服务只监听 127.0.0.1，数据保存在软件目录下的 data 文件夹。",
    ].join("\n"),
    buttons: ["好"],
  });
}

function createTray() {
  try {
    const source = iconPath();
    if (!source) return;
    const image = nativeImage.createFromPath(source);
    if (image.isEmpty()) return;
    tray = new Tray(image.resize({ width: 16, height: 16 }));
    tray.setToolTip("智课研伴 LearnMate");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开学生端", click: () => loadStudent() },
        { label: "打开教师端", click: () => loadTeacher() },
        { type: "separator" },
        { label: "退出（停止服务）", click: () => app.quit() },
      ]),
    );
    tray.on("double-click", () => loadStudent());
  } catch (err) {
    log("tray failed:", err.message);
  }
}

/* -------------------------------------------------------------- 错误处理 */

function showStartupError(message) {
  closeSplash();
  const detail = [
    message || "未知错误",
    "",
    `日志目录：${PATHS.logs}`,
    "常见原因：端口被占用、杀毒软件拦截、磁盘空间不足。",
    "可先双击软件目录里的「停止智课研伴.bat」再重新启动。",
  ].join("\n");
  dialog
    .showMessageBox({
      type: "error",
      title: "智课研伴启动失败",
      message: "后台服务没有启动成功",
      detail,
      buttons: ["打开日志文件夹", "关闭"],
      defaultId: 0,
      cancelId: 1,
    })
    .then((res) => {
      if (res.response === 0) shell.openPath(PATHS.logs);
      app.quit();
    });
}

function gracefulQuit() {
  if (quitting) return;
  quitting = true;
  showSplash("正在停止后台服务…");
  const hardExit = setTimeout(() => app.exit(0), 70000);
  stopServices()
    .then(() => {
      clearTimeout(hardExit);
      app.exit(0);
    })
    .catch(() => {
      clearTimeout(hardExit);
      app.exit(0);
    });
}

/* -------------------------------------------------------------- 启动流程 */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    /* 关键：桌面/开始菜单上的「学生端」和「教师端」是两个快捷方式，都指向同一个 exe。
       程序已经在跑时再点另一个快捷方式，只会走到这里——必须看新进程带没带 --teacher，
       否则「点教师端却弹回学生端」（就是这么来的）。 */
    const args = Array.isArray(argv) ? argv : [];
    const wantsTeacher = args.some((arg) => /^--teacher$/i.test(String(arg)));
    log("second instance", args.join(" ") || "(no args)", wantsTeacher ? "=> teacher" : "=> student");
    if (wantsTeacher) {
      loadTeacher();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    createMainWindow();
    loadStudent();
  });

  app.on("window-all-closed", () => {
    if (!quitting) app.quit();
  });

  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    gracefulQuit();
  });

  app.whenReady().then(async () => {
    log("LearnMate desktop shell starting", `root=${ROOT}`, `electron=${process.versions.electron}`);
    buildMenu();
    showSplash(isFirstRun() ? "正在准备首次启动…" : "正在启动智课研伴…");

    const result = await startServices();
    if (!result.ok) {
      log("startup failed:", result.error);
      showStartupError(result.error);
      return;
    }

    const target = urls();
    log("services ready", `student=${target.student}`, `teacher=${target.teacher}`);
    const ready = await waitForUrl(`http://127.0.0.1:${target.ports.backend}/api/health`, 120000);
    if (!ready) log("health check did not pass within 2 minutes, loading UI anyway");

    if (START_MODE === "teacher") {
      log("start mode: teacher (no student window)");
      loadTeacher();
    } else {
      createMainWindow();
      loadStudent();
    }
    createTray();
    setTimeout(closeSplash, 600);
  });
}
