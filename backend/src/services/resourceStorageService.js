/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const STORAGE_ROOT = resolveStorageRoot("RESOURCE_STORAGE_DIR", "../../storage/resources");
// Keep temporary files on the same filesystem as the final file so rename remains atomic
// when RESOURCE_STORAGE_DIR is a Docker volume.
const TEMP_ROOT = path.join(STORAGE_ROOT, ".tmp");
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`invalid ${name}`);
  return number;
}
function safeFileName(fileType) {
  if (fileType === "pptx") return "courseware.pptx";
  if (fileType === "mindmap_svg") return "mind-map.svg";
  if (fileType === "mindmap_png") return "mind-map.png";
  throw new Error("unsupported file type");
}
async function prepareTempFile(fileType) {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  return path.join(TEMP_ROOT, `${crypto.randomUUID()}-${safeFileName(fileType)}`);
}
async function finalizeFile(tempPath, { studentId, resourceId, version, fileType }) {
  const ids = [
    safeInteger(studentId, "studentId"),
    safeInteger(resourceId, "resourceId"),
    safeInteger(version, "version"),
  ];
  const directory = path.join(STORAGE_ROOT, String(ids[0]), String(ids[1]), `v${ids[2]}`);
  await fs.mkdir(directory, { recursive: true });
  const finalPath = path.join(directory, safeFileName(fileType));
  const stat = await fs.stat(tempPath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_SIZE)
    throw new Error("generated file size is invalid");
  const bytes = await fs.readFile(tempPath);
  if (bytes.length !== stat.size || bytes.length > MAX_FILE_SIZE)
    throw new Error("generated file size changed while finalizing");
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  await fs.rename(tempPath, finalPath);
  return {
    absolutePath: finalPath,
    storagePath: path.relative(STORAGE_ROOT, finalPath).split(path.sep).join("/"),
    fileSize: bytes.length,
    checksum,
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
    throw new Error("invalid storage path");
  const resolved = path.resolve(STORAGE_ROOT, normalized);
  if (!resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)) throw new Error("storage path escapes root");
  return resolved;
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
  cleanupFile,
  STORAGE_ROOT,
  TEMP_ROOT,
  MAX_FILE_SIZE,
};
