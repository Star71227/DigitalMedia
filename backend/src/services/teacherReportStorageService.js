/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const STORAGE_ROOT = resolveStorageRoot("REPORT_STORAGE_DIR", "../../storage/reports");
// Keep temporary files on the report volume to preserve atomic rename semantics.
const TEMP_ROOT = path.join(STORAGE_ROOT, ".tmp");
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function positive(value, name) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`invalid ${name}`);
  return id;
}
async function prepareTempFile() {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  return path.join(TEMP_ROOT, `${crypto.randomUUID()}.pdf`);
}
async function finalizeFile(tempPath, { teacherId, studentId, reportId, version }) {
  const values = [
    positive(teacherId, "teacherId"),
    positive(studentId, "studentId"),
    positive(reportId, "reportId"),
    positive(version, "version"),
  ];
  const directory = path.join(STORAGE_ROOT, String(values[0]), String(values[1]), String(values[2]));
  await fs.mkdir(directory, { recursive: true });
  const finalPath = path.join(directory, `v${values[3]}.pdf`);
  const stat = await fs.stat(tempPath);
  if (!stat.isFile() || stat.size < 5 || stat.size > MAX_FILE_SIZE)
    throw new Error("generated PDF size is invalid");
  const bytes = await fs.readFile(tempPath);
  if (bytes.length !== stat.size || bytes.length > MAX_FILE_SIZE)
    throw new Error("generated PDF size changed while finalizing");
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new Error("generated file is not a PDF");
  await fs.rename(tempPath, finalPath);
  return {
    absolutePath: finalPath,
    storagePath: path.relative(STORAGE_ROOT, finalPath).split(path.sep).join("/"),
    fileSize: bytes.length,
    checksum: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}
function resolveStoredFile(storagePath) {
  const raw = String(storagePath || "");
  const normalized = raw.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.includes("..") ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(raw) ||
    /^[A-Za-z]:/.test(normalized)
  )
    throw new Error("invalid report storage path");
  const resolved = path.resolve(STORAGE_ROOT, normalized);
  if (!resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)) throw new Error("report path escapes root");
  return resolved;
}
async function verifyStoredFile(filePath, { fileSize, checksum }) {
  const bytes = await fs.readFile(filePath);
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new Error("stored report is not a PDF");
  if (bytes.length !== Number(fileSize)) throw new Error("stored report size mismatch");
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (!checksum || actual !== String(checksum)) throw new Error("stored report checksum mismatch");
  return true;
}
async function cleanupFile(filePath) {
  if (filePath) await fs.rm(filePath, { force: true }).catch(() => undefined);
}
function resolveStorageRoot(variableName, fallback) {
  const configured = String(process.env[variableName] || "").trim();
  return configured ? path.resolve(configured) : path.resolve(__dirname, fallback);
}
module.exports = {
  prepareTempFile,
  finalizeFile,
  resolveStoredFile,
  verifyStoredFile,
  cleanupFile,
  STORAGE_ROOT,
  TEMP_ROOT,
  MAX_FILE_SIZE,
};
