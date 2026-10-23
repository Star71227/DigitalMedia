/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const fs = require("fs");
const services = require("../services/resourceGenerationService");
const progressServices = require("../services/resourceProgressService");
const pptistExport = require("../services/pptistExportService");
const mindMapExport = require("../services/mindMapExportService");
async function generate(req, res) {
  try {
    if (req.body?.async === true) {
      const job = await progressServices.createGenerationJob(req.user.studentId, req.body);
      return res.status(202).json(job);
    }
    return res.json({
      resource: await services.generateResource({ ...req.body, studentId: req.user.studentId }),
    });
  } catch (e) {
    return fail(res, e);
  }
}
async function job(req, res) {
  try {
    return res.json(await progressServices.getGenerationJob(req.user.studentId, req.params.jobId));
  } catch (e) {
    return fail(res, e);
  }
}
async function latestJob(req, res) {
  try {
    return res.json({
      data: await progressServices.findLatestGenerationJob(req.user.studentId, {
        resourceType: req.query.resourceType,
        activeOnly: req.query.activeOnly === "true",
      }),
    });
  } catch (e) {
    return fail(res, e);
  }
}
async function jobEvents(req, res) {
  try {
    const snapshot = await progressServices.getGenerationJob(req.user.studentId, req.params.jobId, {
      includeResource: false,
    });
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    const after = Math.max(0, Number(req.headers["last-event-id"] || req.query.after) || 0);
    const send = (event) => {
      if (event.id && event.id <= after) return;
      res.write(`id: ${event.id || ""}\n`);
      res.write(`event: ${event.eventType || "stage"}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    res.write(`event: job\ndata: ${JSON.stringify(snapshot.job)}\n\n`);
    snapshot.stages.forEach(send);
    if (["completed", "failed"].includes(snapshot.job.status)) {
      res.end();
      return;
    }
    const unsubscribe = progressServices.subscribe(req.params.jobId, (event) => {
      send(event);
      if (event.eventType === "complete" || event.eventType === "error") {
        cleanup();
        res.end();
      }
    });
    const heartbeat = setInterval(
      () => res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`),
      15000,
    );
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on("close", cleanup);
  } catch (e) {
    if (!res.headersSent) return fail(res, e);
    res.end();
  }
}
async function list(req, res) {
  try {
    return res.json({ data: await services.listResources(req.user.studentId, { ...req.query }) });
  } catch (e) {
    return fail(res, e);
  }
}
async function detail(req, res) {
  try {
    return res.json({ resource: await services.getResource(req.user.studentId, req.params.resourceId) });
  } catch (e) {
    return fail(res, e);
  }
}
async function versions(req, res) {
  try {
    return res.json({ data: await services.listVersions(req.user.studentId, req.params.resourceId) });
  } catch (e) {
    return fail(res, e);
  }
}
async function versionDetail(req, res) {
  try {
    return res.json({
      resource: await services.getResource(req.user.studentId, req.params.resourceId, req.params.version),
    });
  } catch (e) {
    return fail(res, e);
  }
}
async function download(req, res) {
  try {
    const file = await services.getDownload(req.user.studentId, req.params.resourceId, req.params.version);
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Length", String(file.file_size));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`,
    );
    return fs.createReadStream(file.absolutePath).pipe(res);
  } catch (e) {
    return fail(res, e);
  }
}
// 导出成 PPTist 本地编辑器可导入的 JSON（纯转换，不调用模型）：学生在已有 PPT 资源页点一下就能下载，
// 再到 http://127.0.0.1:5217/ 导入继续编辑并导出 PPTX。
async function pptistJson(req, res) {
  try {
    const result = await pptistExport.exportPptistDeck(
      req.user.studentId,
      Number(req.params.resourceId),
      req.params.version,
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    );
    res.setHeader("X-Pptist-Slide-Count", String(result.slideCount));
    return res.send(JSON.stringify(result.deck, null, 2));
  } catch (e) {
    return fail(res, e);
  }
}
// 导出成 simple-mind-map（本地「思绪思维导图」127.0.0.1:5317）可导入的 JSON，同样只是格式转换。
async function mindmapJson(req, res) {
  try {
    const result = await mindMapExport.exportMindMapJson(
      req.user.studentId,
      Number(req.params.resourceId),
      req.params.version,
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    );
    res.setHeader("X-Mindmap-Node-Count", String(result.nodeCount));
    return res.send(JSON.stringify(result.deck, null, 2));
  } catch (e) {
    return fail(res, e);
  }
}
async function open(req, res) {
  try {
    return res.json({ resource: await services.openResource(req.user.studentId, req.params.resourceId) });
  } catch (e) {
    return fail(res, e);
  }
}
async function progress(req, res) {
  try {
    return res.json({
      resource: await services.updateProgress(req.user.studentId, req.params.resourceId, req.body || {}),
    });
  } catch (e) {
    return fail(res, e);
  }
}
async function complete(req, res) {
  try {
    return res.json({ resource: await services.completeResource(req.user.studentId, req.params.resourceId) });
  } catch (e) {
    return fail(res, e);
  }
}
async function stageResources(req, res) {
  try {
    return res.json({
      data: await services.stageResources(req.user.studentId, req.query.pathVersion, req.params.stageKey),
    });
  } catch (e) {
    return fail(res, e);
  }
}
function fail(res, e) {
  const status = e.statusCode || 500,
    requestId = res.req?.requestId;
  const publicMessage = e.publicMessage || e.message;
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      status,
      area: "resource",
      code: e.code || "ERROR",
      message:
        status < 500
          ? String(e.message).slice(0, 160)
          : String(publicMessage || "resource operation failed").slice(0, 160),
    }),
  );
  return res
    .status(status)
    .json({
      error: status < 500 || e.publicMessage ? publicMessage : "resource operation failed",
      code: e.code || "ERROR",
      details: status < 500 ? e.details : undefined,
      requestId,
    });
}
module.exports = {
  generate,
  job,
  latestJob,
  jobEvents,
  list,
  detail,
  versions,
  versionDetail,
  download,
  pptistJson,
  mindmapJson,
  open,
  progress,
  complete,
  stageResources,
};
