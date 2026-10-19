/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function resolveBrowser() {
  const candidates = [
    process.env.REPORT_BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  const executable = candidates.map((value) => path.resolve(value)).find(isExecutableFile);
  if (!executable) throw new Error("未找到可用于生成 PDF 的 Edge/Chrome，请配置 REPORT_BROWSER_PATH");
  return executable;
}
function resolveFont() {
  const configured = String(process.env.REPORT_FONT_PATH || "").trim();
  const candidates = [
    configured,
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
  ].filter(Boolean);
  const font = candidates.map((value) => path.resolve(value)).find(isReadableFile);
  if (!font) throw new Error("未找到中文 PDF 字体，请配置 REPORT_FONT_PATH");
  return font;
}
async function generateAssessmentPdf(report, filePath) {
  const browser = resolveBrowser();
  resolveFont();
  const htmlPath = `${filePath}.html`,
    profilePath = `${filePath}.profile`;
  let generationError;
  try {
    await fs.writeFile(htmlPath, buildHtml(report), "utf8");
    await fs.mkdir(profilePath, { recursive: true });
    await run(browser, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--no-first-run",
      "--no-pdf-header-footer",
      `--user-data-dir=${profilePath}`,
      `--print-to-pdf=${path.resolve(filePath)}`,
      pathToFileUrl(htmlPath),
    ]);
  } catch (error) {
    generationError = error;
  }
  const cleanup = await Promise.allSettled([
    fs.rm(htmlPath, { force: true }),
    fs.rm(profilePath, { recursive: true, force: true }),
  ]);
  if (generationError) throw generationError;
  if (cleanup.some((item) => item.status === "rejected")) throw new Error("PDF 临时文件清理失败");
}
const { buildHtml } = require("./assessmentHtmlService");
async function verifyPdfDependencies() {
  const browser = resolveBrowser();
  resolveFont();
  await run(browser, ["--version"], { timeoutMs: 5000, label: "PDF 浏览器依赖检查" });
  return true;
}
function run(executable, args, { timeoutMs = 30000, label = "PDF 生成" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      detached: process.platform !== "win32",
    });
    let stderr = "",
      timedOut = false,
      settled = false,
      hardTimer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child).catch(() => undefined);
      hardTimer = setTimeout(() => finish(new Error(`${label}超时`)), 5000);
      hardTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (timedOut) return finish(new Error(`${label}超时`));
      if (code === 0) return finish();
      return finish(new Error(`${label}失败 (${code}): ${stderr.slice(-300)}`));
    });
  });
}
async function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", resolve);
      killer.once("close", resolve);
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}
function isExecutableFile(value) {
  try {
    const stat = fsSync.statSync(value);
    if (!stat.isFile()) return false;
    if (process.platform !== "win32") fsSync.accessSync(value, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function isReadableFile(value) {
  try {
    const stat = fsSync.statSync(value);
    if (!stat.isFile() || stat.size <= 0) return false;
    fsSync.accessSync(value, fsSync.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
function pathToFileUrl(value) {
  return `file:///${path.resolve(value).replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")}`.replace(
    "file:////",
    "file:///",
  );
}
function e(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}
function percent(value) {
  return value === null || value === undefined ? "暂无数据" : `${Math.round(Number(value) * 10) / 10}%`;
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}
module.exports = { generateAssessmentPdf, resolveBrowser, resolveFont, verifyPdfDependencies, buildHtml };
