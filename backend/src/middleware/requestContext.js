/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function requestContext(req, res, next) {
  const supplied = String(req.get("X-Request-Id") || "").trim();
  req.requestId = SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not Found", code: "NOT_FOUND", requestId: req.requestId });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = normalizeStatus(err?.statusCode || err?.status);
  const requestId = req.requestId || crypto.randomUUID();
  const code = status >= 500 ? "INTERNAL_ERROR" : String(err?.code || "REQUEST_FAILED");
  const message =
    status >= 500 ? "Internal Server Error" : String(err?.message || "Request failed").slice(0, 240);

  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      method: req.method,
      path: req.path,
      status,
      code: String(err?.code || "UNHANDLED_ERROR").slice(0, 80),
      message: status >= 500 ? "Unhandled backend error" : message,
    }),
  );

  return res.status(status).json({ error: message, code, requestId });
}

function normalizeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

module.exports = { requestContext, notFoundHandler, errorHandler, SAFE_REQUEST_ID };
