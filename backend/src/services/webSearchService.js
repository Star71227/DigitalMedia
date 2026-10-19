/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
function getWebSearchStatus() {
  let endpointHost = "";
  try {
    endpointHost = process.env.WEB_SEARCH_API_URL ? new URL(process.env.WEB_SEARCH_API_URL).hostname : "";
  } catch {
    endpointHost = "invalid";
  }
  return {
    enabled: /^true$/i.test(String(process.env.WEB_SEARCH_ENABLED || "")),
    available: isWebSearchAvailable(),
    provider: process.env.WEB_SEARCH_PROVIDER || "generic-json",
    endpointHost:
      process.env.WEB_SEARCH_PROVIDER === "bing-rss"
        ? "www.bing.com"
        : process.env.WEB_SEARCH_PROVIDER === "baidu-html"
          ? "www.baidu.com"
          : endpointHost,
  };
}

function isWebSearchAvailable() {
  if (
    /^true$/i.test(String(process.env.WEB_SEARCH_ENABLED || "")) &&
    ["bing-rss", "baidu-html"].includes(process.env.WEB_SEARCH_PROVIDER)
  )
    return true;
  return (
    /^true$/i.test(String(process.env.WEB_SEARCH_ENABLED || "")) &&
    Boolean(String(process.env.WEB_SEARCH_API_URL || "").trim()) &&
    Boolean(String(process.env.WEB_SEARCH_API_KEY || "").trim())
  );
}

async function searchWeb(query, { count = 8 } = {}) {
  if (!isWebSearchAvailable()) return [];
  if (["bing-rss", "baidu-html"].includes(process.env.WEB_SEARCH_PROVIDER)) {
    const providers =
      process.env.WEB_SEARCH_PROVIDER === "baidu-html"
        ? [searchBaiduHtml, searchBingRss]
        : [searchBingRss, searchBaiduHtml];
    return Promise.any(
      providers.map(async (search) => {
        const results = await search(query, count);
        if (!results.length) throw providerError("搜索服务没有返回结果");
        return results;
      }),
    );
  }
  const endpoint = String(process.env.WEB_SEARCH_API_URL).trim();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(20000, Math.max(3000, Number(process.env.WEB_SEARCH_TIMEOUT_MS || 12000))),
  );
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WEB_SEARCH_API_KEY}`,
        "X-API-Key": process.env.WEB_SEARCH_API_KEY,
      },
      body: JSON.stringify({
        query: String(query).slice(0, 500),
        count: Math.min(12, Math.max(3, Number(count) || 8)),
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw providerError(`联网检索服务返回 HTTP ${response.status}`);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw providerError("联网检索服务没有返回 JSON");
    }
    return normalizeResults(payload).slice(0, Math.min(12, Number(count) || 8));
  } finally {
    clearTimeout(timer);
  }
}

function normalizeResults(payload) {
  const candidates = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.web?.results)
          ? payload.web.results
          : [];
  return candidates
    .map((item) => ({
      title: String(item.title || item.name || "")
        .trim()
        .slice(0, 255),
      url: safeHttpUrl(item.url || item.link),
      snippet: String(item.snippet || item.description || item.content || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1600),
      publishedAt: item.publishedAt || item.date || null,
      sourceName: String(item.source || item.siteName || "")
        .trim()
        .slice(0, 120),
    }))
    .filter((item) => item.title && item.url && item.snippet);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}
function providerError(message) {
  const error = new Error(message);
  error.code = "WEB_SEARCH_UNAVAILABLE";
  error.statusCode = 503;
  return error;
}

module.exports = { getWebSearchStatus, isWebSearchAvailable, searchWeb, normalizeResults };

// Public search feed: no API secret or student identity is transmitted.
async function searchBingRss(query, count) {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("format", "rss");
  url.searchParams.set("q", String(query).slice(0, 500));
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/rss+xml" },
  });
  if (!response.ok) throw providerError("搜索服务暂时不可用，请稍后重试");
  const xml = await response.text();
  if (xml.length > 2000000 || !xml.includes("<rss"))
    throw providerError("搜索服务未返回可用结果，请配置正式搜索 API");
  const field = (item, name) =>
    decodeXml(item.match(new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">"))?.[1] || "");
  const results = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => ({
    title: field(match[1], "title"),
    url: field(match[1], "link"),
    snippet: field(match[1], "description"),
    source: "Bing 公共搜索摘要",
  }));
  return normalizeResults({ results }).slice(0, Math.min(12, Math.max(1, Number(count) || 8)));
}
function decodeXml(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(
      /&(?:amp|lt|gt|quot|apos);/g,
      (v) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[v],
    )
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => {
      const c = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return c <= 0x10ffff ? String.fromCodePoint(c) : "";
    });
}
module.exports.searchBingRss = searchBingRss;

async function searchBaiduHtml(query, count) {
  const url = new URL("https://www.baidu.com/s");
  url.searchParams.set("wd", String(query).slice(0, 500));
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; LearnMate/1.0; local educational search)",
    },
  });
  if (!response.ok) throw providerError(`搜索服务返回 HTTP ${response.status}`);
  const html = await response.text();
  if (html.length > 2500000 || !/result c-container/.test(html))
    throw providerError("搜索服务未返回可用结果");
  return normalizeBaiduHtml(html).slice(0, Math.min(12, Math.max(1, Number(count) || 8)));
}

function normalizeBaiduHtml(html) {
  const results = [];
  const pattern =
    /<div[^>]+class="[^"]*result c-container[^"]*"[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>([\s\S]*?)(?=<div[^>]+class="[^"]*result c-container|$)/g;
  for (const match of String(html || "").matchAll(pattern)) {
    const title = stripHtml(match[2]).slice(0, 255);
    const snippet = stripHtml(match[3])
      .replace(/\}\],?"clamp"[\s\S]*$/, "")
      .slice(0, 1600);
    const url = safeHttpUrl(decodeHtml(match[1]));
    if (title && snippet && url)
      results.push({ title, url, snippet, publishedAt: null, sourceName: "百度公开搜索摘要" });
  }
  return results;
}

function stripHtml(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (item) =>
        ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[item],
    )
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, number) =>
      String.fromCodePoint(number[0].toLowerCase() === "x" ? parseInt(number.slice(1), 16) : Number(number)),
    );
}

module.exports.searchBaiduHtml = searchBaiduHtml;
module.exports.normalizeBaiduHtml = normalizeBaiduHtml;
