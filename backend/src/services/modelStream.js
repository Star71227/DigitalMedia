/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// Incremental UTF-8 SSE decoding. Only public content is forwarded, never reasoning_content.
async function readModelStream(body, onDelta) {
  const decoder = new TextDecoder();
  let pending = "",
    answer = "",
    complete = false;
  function line(value) {
    if (!value.startsWith("data:")) return;
    const data = value.slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") {
      complete = true;
      return;
    }
    const event = JSON.parse(data);
    if (event.error) throw new Error("Model stream returned an error");
    const choice = event.choices?.[0];
    const text = choice?.delta?.content;
    if (typeof text === "string" && text) {
      answer += text;
      onDelta(text);
    }
    if (choice?.finish_reason) {
      if (choice.finish_reason === "length")
        throw Object.assign(new Error("回答超过模型输出上限，请缩小问题范围后重试。"), {
          code: "AI_RESPONSE_QUALITY_FAILED",
        });
      complete = true;
    }
  }
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const value of lines) line(value.trimEnd());
  }
  pending += decoder.decode();
  if (pending.trim()) line(pending.trim());
  if (!complete) throw new Error("Model stream interrupted");
  return answer;
}
module.exports = { readModelStream };
