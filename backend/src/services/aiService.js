/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const crypto = require("crypto");
const WebSocket = require("ws");

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_LOCAL_TIMEOUT_MS = 180000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 20000;
const MAX_LOCAL_TIMEOUT_MS = 600000;
const runtimeMetrics = new Map();

/**
 * 云端单次调用上限。
 * 原来是写死的 20 秒，对「单个模型一问一答」够用；但多智能体协作下一次用户请求会**串行**调用
 * 多个智能体（讲义线 4 个、全链路 8 个，还含审核返修轮次），单步 20 秒会让长讲义直接超时，
 * 于是允许用 LLM_MAX_TIMEOUT_MS 放宽（只在比默认值更大时生效）。
 */
function maxCloudTimeoutMs() {
  const configured = Number(process.env.LLM_MAX_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > MAX_TIMEOUT_MS ? configured : MAX_TIMEOUT_MS;
}

function normalizeTimeout(value, { local = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return local ? DEFAULT_LOCAL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  }
  return Math.min(local ? MAX_LOCAL_TIMEOUT_MS : maxCloudTimeoutMs(), Math.max(MIN_TIMEOUT_MS, parsed));
}

function getSparkConfig() {
  const provider = process.env.LLM_PROVIDER || "spark";
  return {
    appId: process.env.SPARK_APP_ID || "",
    apiKey: process.env.LLM_API_KEY || process.env.SPARK_API_KEY || process.env.AI_API_KEY || "",
    apiSecret: process.env.SPARK_API_SECRET || "",
    apiUrl: process.env.LLM_API_URL || process.env.SPARK_API_URL || process.env.AI_API_URL || "",
    model: process.env.LLM_MODEL || process.env.SPARK_MODEL || process.env.AI_MODEL || "lite",
    // Do not let a stale environment value keep every chat request pending for a minute.
    // Grounded chats can fall back to the local answer when the provider is slow.
    timeoutMs: normalizeTimeout(process.env.LLM_TIMEOUT_MS || process.env.SPARK_TIMEOUT_MS, {
      local: isLocalProvider({ provider }),
    }),
    provider,
  };
}

function isWebSocketUrl(url) {
  return /^wss?:\/\//i.test(url);
}

function isLocalProvider(config) {
  return /^local(?:-|_)?llamafactory$/i.test(String(config.provider || "").trim());
}

function isLoopbackUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function isPrivateNetworkUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
    const match = hostname.match(/^172\.(\d{1,2})\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  } catch {
    return false;
  }
}

function isTrustedLocalModelEndpoint(config) {
  if (isLoopbackUrl(config.apiUrl)) return true;
  return (
    /^true$/i.test(String(process.env.LLM_LOCAL_ALLOW_PRIVATE || "").trim()) &&
    isPrivateNetworkUrl(config.apiUrl)
  );
}

function isAIEnabled() {
  if (!/^true$/i.test(String(process.env.AI_ENABLED || "").trim())) {
    return false;
  }
  const config = getSparkConfig();

  if (!config.apiUrl) {
    return false;
  }

  if (isWebSocketUrl(config.apiUrl)) {
    return Boolean(config.appId && config.apiKey && config.apiSecret);
  }

  if (isLocalProvider(config)) {
    // A keyless endpoint is accepted only on this machine. This avoids silently
    // treating an unauthenticated public service as a trusted local model. WSL2
    // NAT addresses require an explicit opt-in from the local launcher.
    return isTrustedLocalModelEndpoint(config);
  }

  return Boolean(config.apiKey);
}

function getAIStatus() {
  const config = getSparkConfig();
  const websocket = isWebSocketUrl(config.apiUrl);
  let endpointHost = "";
  try {
    endpointHost = config.apiUrl ? new URL(config.apiUrl).hostname : "";
  } catch {
    endpointHost = "invalid";
  }
  return {
    enabled: /^true$/i.test(String(process.env.AI_ENABLED || "").trim()),
    available: isAIEnabled(),
    provider: config.provider,
    model: config.model,
    endpointHost,
    transport: websocket ? "websocket" : "http",
    credentialsComplete: websocket
      ? Boolean(config.appId && config.apiKey && config.apiSecret)
      : isLocalProvider(config)
        ? isTrustedLocalModelEndpoint(config)
        : Boolean(config.apiKey),
  };
}

async function generateText(options = {}) {
  const { messages, prompt, temperature = 0.5, maxTokens = 2048, model, jsonMode } = options;
  const config = getSparkConfig();

  if (!isAIEnabled()) {
    return null;
  }

  const normalizedMessages = normalizeMessages(messages, prompt);
  const capability = normalizeCapability(options.capability || options.agentName || "general");
  const startedAt = Date.now();

  try {
    const output = isWebSocketUrl(config.apiUrl)
      ? await callSparkWebSocket(config, normalizedMessages, { temperature, maxTokens, model })
      : await callSparkHttp(config, normalizedMessages, {
          temperature,
          maxTokens,
          model,
          jsonMode,
          onDelta: options.onDelta,
          signal: options.signal,
        });
    recordRuntimeMetric(capability, {
      success: true,
      durationMs: Date.now() - startedAt,
      model: model || config.model,
      provider: config.provider,
    });
    return output;
  } catch (error) {
    recordRuntimeMetric(capability, {
      success: false,
      durationMs: Date.now() - startedAt,
      model: model || config.model,
      provider: config.provider,
      error,
    });
    throw error;
  }
}

async function probeAIService({ timeoutMs = 5000 } = {}) {
  const status = getAIStatus();
  const config = getSparkConfig();
  const checkedAt = new Date().toISOString();
  if (!status.available) {
    return { ...status, reachable: false, ready: false, checkedAt, reason: "configuration_required" };
  }
  if (status.transport === "websocket") {
    return {
      ...status,
      reachable: null,
      ready: status.available,
      checkedAt,
      reason: "websocket_probe_not_supported",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(15000, Math.max(1000, Number(timeoutMs) || 5000)),
  );
  try {
    const headers = {};
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    const response = await fetch(toModelsUrl(config.apiUrl), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const payload = tryParseJson(await response.text());
    const models = Array.isArray(payload?.data)
      ? payload.data.map((item) => String(item?.id || "").trim()).filter(Boolean)
      : [];
    return {
      ...status,
      reachable: response.ok,
      ready: response.ok,
      checkedAt,
      httpStatus: response.status,
      models,
      reason: response.ok ? "ready" : "model_endpoint_error",
    };
  } catch (error) {
    return {
      ...status,
      reachable: false,
      ready: false,
      checkedAt,
      reason: error?.name === "AbortError" ? "probe_timeout" : "connection_failed",
      error: String(error?.message || error).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

function toModelsUrl(apiUrl) {
  const url = new URL(apiUrl);
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/i, "/models");
  url.search = "";
  return url.toString();
}

function normalizeCapability(value) {
  return (
    String(value || "general")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .slice(0, 80) || "general"
  );
}

function recordRuntimeMetric(capability, event) {
  const current = runtimeMetrics.get(capability) || {
    capability,
    calls: 0,
    successes: 0,
    failures: 0,
    totalDurationMs: 0,
    lastUsedAt: null,
    lastError: null,
    model: null,
    provider: null,
  };
  current.calls += 1;
  current.successes += event.success ? 1 : 0;
  current.failures += event.success ? 0 : 1;
  current.totalDurationMs += Number(event.durationMs) || 0;
  current.lastDurationMs = Number(event.durationMs) || 0;
  current.lastUsedAt = new Date().toISOString();
  current.lastError = event.success
    ? null
    : String(event.error?.message || event.error || "unknown error").slice(0, 200);
  current.model = event.model || current.model;
  current.provider = event.provider || current.provider;
  runtimeMetrics.set(capability, current);
}

function getAIRuntimeMetrics() {
  return [...runtimeMetrics.values()].map((item) => ({
    ...item,
    averageDurationMs: item.calls ? Math.round(item.totalDurationMs / item.calls) : 0,
  }));
}

async function generateJson(options) {
  // 标记 JSON 场景：开启 LLM_JSON_MODE 时会给请求带上 response_format
  const text = await generateText({ ...options, jsonMode: true });

  if (!text) {
    return null;
  }

  return parseJsonFromText(text);
}

function normalizeMessages(messages, prompt) {
  if (Array.isArray(messages) && messages.length > 0) {
    return messages.map((item) => ({
      role: item.role || "user",
      content: normalizeMessageContent(item.content),
    }));
  }

  return [{ role: "user", content: String(prompt || "") }];
}

function normalizeMessageContent(content) {
  if (!Array.isArray(content)) return String(content || "");
  return content.slice(0, 12).map((part) => {
    if (!part || typeof part !== "object") return { type: "text", text: String(part || "") };
    if (part.type === "image_url" && part.image_url && typeof part.image_url.url === "string") {
      return {
        type: "image_url",
        image_url: { url: part.image_url.url, detail: part.image_url.detail || "auto" },
      };
    }
    return { type: "text", text: String(part.text || "") };
  });
}

async function callSparkHttp(config, messages, options) {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node.js 版本不支持 fetch，请使用 Node.js 18 或更高版本。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers = { "Content-Type": "application/json" };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    // 结构化输出：出题/评估等场景要求模型只吐 JSON。各服务商对 response_format 支持不一，
    // 因此默认关闭，显式设置 LLM_JSON_MODE=response_format 才带上（智谱 OpenAI 兼容接口支持）。
    const jsonModeEnabled =
      String(process.env.LLM_JSON_MODE || "")
        .trim()
        .toLowerCase() === "response_format";
    const body = {
      model: options.model || config.model,
      messages,
      stream: Boolean(options.onDelta),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };
    if (jsonModeEnabled && options.jsonMode && !options.onDelta) {
      body.response_format = { type: "json_object" };
    }
    // 推理型模型（glm-5.3 系列等）先输出 reasoning_content，再输出正文。预算偏小时会出现
    // 「推理吃光 token → 正文为空 → finish_reason=length」。时间允许时自动扩一次预算重试。
    const startedAt = Date.now();
    let truncationError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
      });

      if (
        response.ok &&
        options.onDelta &&
        /text\/event-stream/i.test(response.headers.get("content-type") || "")
      ) {
        return await require("./modelStream").readModelStream(response.body, options.onDelta);
      }
      const bodyText = await response.text();

      if (!response.ok) {
        throw new Error(`Spark HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
      }

      const payload = tryParseJson(bodyText);

      // 关键修复：当返回体是标准的 OpenAI 兼容结构（含 choices）时，绝不把原始响应体当作模型正文返回。
      // 旧逻辑 `|| bodyText` 会在正文为空时返回整个 JSON 响应体，导致下游 JSON.parse 解析出
      // choices/usage 等字段，报出「unknown fields」这类误导性错误。
      if (!payload || !Array.isArray(payload.choices) || !payload.choices.length) {
        return extractSparkContent(payload) || bodyText;
      }

      const text = extractSparkContent(payload);

      if (text && String(text).trim()) {
        return text;
      }

      const choice = payload.choices[0] || {};
      const finishReason = choice.finish_reason || "unknown";
      const usage = payload.usage || {};
      const reasoningTokens =
        usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens;
      const error = new Error(
        `模型未返回正文（finish_reason=${finishReason}${reasoningTokens ? `，reasoning_tokens=${reasoningTokens}` : ""}）。` +
          (finishReason === "length" ? "输出上限被推理过程耗尽，请提高 maxTokens 或关闭思考模式。" : ""),
      );
      error.code = finishReason === "length" ? "LLM_OUTPUT_TRUNCATED" : "LLM_EMPTY_CONTENT";
      error.statusCode = 502;
      error.details = { finishReason, usage };

      const budget = Number(body.max_tokens || 0);
      const canEscalate =
        attempt === 0 &&
        finishReason === "length" &&
        !options.onDelta &&
        !options.signal &&
        budget > 0 &&
        budget < 32000 &&
        Date.now() - startedAt < config.timeoutMs / 2;

      if (!canEscalate) {
        throw error;
      }

      truncationError = error;
      body.max_tokens = Math.min(Math.max(budget * 3, 16000), 32000);
    }

    throw truncationError || new Error("模型未返回正文。");
  } finally {
    clearTimeout(timer);
  }
}

function callSparkWebSocket(config, messages, options) {
  return new Promise((resolve, reject) => {
    const authUrl = createSparkAuthUrl(config.apiUrl, config.apiKey, config.apiSecret);
    const ws = new WebSocket(authUrl);
    let answer = "";
    let finished = false;

    const timer = setTimeout(() => {
      finish(new Error("Spark WebSocket request timeout"));
    }, config.timeoutMs);

    function finish(error, value) {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timer);

      try {
        ws.close();
      } catch (closeError) {
        // Ignore close errors after the response has settled.
      }

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    ws.on("open", () => {
      ws.send(JSON.stringify(buildSparkWebSocketPayload(config, messages, options)));
    });

    ws.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        const code = payload.header && payload.header.code;

        if (typeof code === "number" && code !== 0) {
          finish(new Error(`Spark WebSocket ${code}: ${payload.header.message || "unknown error"}`));
          return;
        }

        const textItems =
          payload.payload && payload.payload.choices && Array.isArray(payload.payload.choices.text)
            ? payload.payload.choices.text
            : [];

        for (const item of textItems) {
          answer += item.content || "";
        }

        const status =
          (payload.header && payload.header.status) ||
          (payload.payload && payload.payload.choices && payload.payload.choices.status);

        if (status === 2) {
          finish(null, answer);
        }
      } catch (error) {
        finish(error);
      }
    });

    ws.on("error", (error) => finish(error));
  });
}

function createSparkAuthUrl(rawUrl, apiKey, apiSecret) {
  const url = new URL(rawUrl);
  const host = url.host;
  const date = new Date().toUTCString();
  const path = url.pathname || "/";
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = crypto.createHmac("sha256", apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;

  url.searchParams.set("authorization", Buffer.from(authorizationOrigin).toString("base64"));
  url.searchParams.set("date", date);
  url.searchParams.set("host", host);

  return url.toString();
}

function buildSparkWebSocketPayload(config, messages, options) {
  return {
    header: {
      app_id: config.appId,
      uid: "edusmart-backend",
    },
    parameter: {
      chat: {
        domain: options.model || config.model,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      },
    },
    payload: {
      message: {
        text: messages.map((item) => ({ ...item, content: flattenMessageContent(item.content) })),
      },
    },
  };
}

function flattenMessageContent(content) {
  if (!Array.isArray(content)) return String(content || "");
  return content
    .map((part) => (part.type === "text" ? String(part.text || "") : "[图片附件仅支持 HTTP 多模态接口]"))
    .join("\n");
}

function parseJsonFromText(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const arrayStart = cleaned.indexOf("[");
    const objectStart = cleaned.indexOf("{");
    const starts = [arrayStart, objectStart].filter((index) => index >= 0);

    if (starts.length === 0) {
      throw error;
    }

    const start = Math.min(...starts);
    const endChar = cleaned[start] === "[" ? "]" : "}";
    const end = cleaned.lastIndexOf(endChar);

    if (end <= start) {
      throw error;
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function extractSparkContent(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (Array.isArray(payload.choices) && payload.choices[0]) {
    const choice = payload.choices[0];
    return (
      (choice.message && choice.message.content) ||
      (choice.delta && choice.delta.content) ||
      choice.text ||
      ""
    );
  }

  if (payload.payload && payload.payload.choices && Array.isArray(payload.payload.choices.text)) {
    return payload.payload.choices.text.map((item) => item.content || "").join("");
  }

  return payload.content || payload.text || "";
}

module.exports = {
  generateText,
  generateJson,
  isAIEnabled,
  getAIStatus,
  isLoopbackUrl,
  isPrivateNetworkUrl,
  isTrustedLocalModelEndpoint,
  normalizeTimeout,
  probeAIService,
  getAIRuntimeMetrics,
  toModelsUrl,
};
