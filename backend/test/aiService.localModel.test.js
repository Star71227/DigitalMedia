/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateText,
  getAIStatus,
  getAIRuntimeMetrics,
  isAIEnabled,
  isLoopbackUrl,
  isPrivateNetworkUrl,
  isTrustedLocalModelEndpoint,
  normalizeTimeout,
  probeAIService,
  toModelsUrl,
} = require("../src/services/aiService");
const { getAgentCatalog } = require("../src/services/agentCatalogService");

function withEnvironment(values, callback) {
  const before = {};
  for (const [key, value] of Object.entries(values)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("local LLaMA Factory endpoint can run without an API key only on loopback", async () => {
  await withEnvironment(
    {
      AI_ENABLED: "true",
      LLM_PROVIDER: "local-llamafactory",
      LLM_API_URL: "http://127.0.0.1:8000/v1/chat/completions",
      LLM_API_KEY: undefined,
    },
    () => {
      assert.equal(isAIEnabled(), true);
      assert.equal(getAIStatus().credentialsComplete, true);
    },
  );

  await withEnvironment(
    {
      AI_ENABLED: "true",
      LLM_PROVIDER: "local-llamafactory",
      LLM_API_URL: "http://model.example/v1/chat/completions",
      LLM_API_KEY: undefined,
    },
    () => assert.equal(isAIEnabled(), false),
  );
});

test("local request omits an empty Authorization header", async () => {
  const originalFetch = global.fetch;
  let received;
  global.fetch = async (_url, options) => {
    received = options;
    return {
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: "本地模型正常" } }] }),
    };
  };
  try {
    await withEnvironment(
      {
        AI_ENABLED: "true",
        LLM_PROVIDER: "local-llamafactory",
        LLM_MODEL: "Qwen3-VL-2B-Instruct",
        LLM_API_URL: "http://localhost:8000/v1/chat/completions",
        LLM_API_KEY: undefined,
      },
      async () => {
        assert.equal(await generateText({ prompt: "测试" }), "本地模型正常");
        assert.equal(received.headers.Authorization, undefined);
        assert.equal(JSON.parse(received.body).model, "Qwen3-VL-2B-Instruct");
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("loopback URL detection rejects lookalike hosts", () => {
  assert.equal(isLoopbackUrl("http://localhost:8000/v1"), true);
  assert.equal(isLoopbackUrl("http://127.0.0.1:8000/v1"), true);
  assert.equal(isLoopbackUrl("http://localhost.example:8000/v1"), false);
});

test("WSL private endpoint needs an explicit local opt-in", () => {
  const original = process.env.LLM_LOCAL_ALLOW_PRIVATE;
  try {
    assert.equal(isPrivateNetworkUrl("http://172.24.16.1:8000/v1/chat/completions"), true);
    assert.equal(isPrivateNetworkUrl("https://example.com/v1/chat/completions"), false);
    delete process.env.LLM_LOCAL_ALLOW_PRIVATE;
    assert.equal(
      isTrustedLocalModelEndpoint({ apiUrl: "http://172.24.16.1:8000/v1/chat/completions" }),
      false,
    );
    process.env.LLM_LOCAL_ALLOW_PRIVATE = "true";
    assert.equal(
      isTrustedLocalModelEndpoint({ apiUrl: "http://172.24.16.1:8000/v1/chat/completions" }),
      true,
    );
  } finally {
    if (original === undefined) delete process.env.LLM_LOCAL_ALLOW_PRIVATE;
    else process.env.LLM_LOCAL_ALLOW_PRIVATE = original;
  }
});

test("local model timeout allows realistic generation latency", () => {
  assert.equal(normalizeTimeout(undefined, { local: true }), 180000);
  assert.equal(normalizeTimeout(900000, { local: true }), 600000);
  assert.equal(normalizeTimeout(900000), 20000);
});

test("model probe uses the OpenAI-compatible models endpoint", async () => {
  const originalFetch = global.fetch;
  let requestedUrl = "";
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ id: "Qwen3-VL-2B-Instruct" }] }),
    };
  };
  try {
    await withEnvironment(
      {
        AI_ENABLED: "true",
        LLM_PROVIDER: "local-llamafactory",
        LLM_MODEL: "Qwen3-VL-2B-Instruct",
        LLM_API_URL: "http://127.0.0.1:8000/v1/chat/completions",
        LLM_API_KEY: undefined,
      },
      async () => {
        const result = await probeAIService();
        assert.equal(result.ready, true);
        assert.deepEqual(result.models, ["Qwen3-VL-2B-Instruct"]);
        assert.equal(requestedUrl, "http://127.0.0.1:8000/v1/models");
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("agent catalog maps every learning-loop agent to a concrete endpoint", async () => {
  await withEnvironment(
    {
      AI_ENABLED: "true",
      LLM_PROVIDER: "local-llamafactory",
      LLM_MODEL: "Qwen3-VL-2B-Instruct",
      LLM_API_URL: "http://127.0.0.1:8000/v1/chat/completions",
    },
    () => {
      const agents = getAgentCatalog();
      assert.ok(agents.length >= 10);
      assert.ok(agents.every((agent) => agent.endpoints.length > 0));
      assert.equal(agents.find((agent) => agent.key === "tutor").model, "Qwen3-VL-2B-Instruct");
    },
  );
});

test("capability calls are observable for student-side diagnostics", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
  });
  try {
    await withEnvironment(
      {
        AI_ENABLED: "true",
        LLM_PROVIDER: "local-llamafactory",
        LLM_MODEL: "Qwen3-VL-2B-Instruct",
        LLM_API_URL: "http://127.0.0.1:8000/v1/chat/completions",
      },
      () => generateText({ prompt: "test", capability: "tutor" }),
    );
    const metric = getAIRuntimeMetrics().find((item) => item.capability === "tutor");
    assert.ok(metric && metric.successes >= 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("models URL conversion preserves origin", () => {
  assert.equal(toModelsUrl("http://localhost:8000/v1/chat/completions"), "http://localhost:8000/v1/models");
});
