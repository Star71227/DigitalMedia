/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// 知识块安全检查：识别真正的提示注入意图。
// 设计原则：必须同时出现"指令式动词 + 敏感目标"才判为注入。
// 收紧原因：原规则中的 /JWT_SECRET|API_KEY|password|secret/i 与 /执行.{0,8}(命令|代码|工具)/i
// 会把 "int password = 1234;"、"执行这段代码"、"指令执行" 等正常课程内容误判为注入，
// 导致合法知识块被隔离、无法进入检索。
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*prompt/i,
  /(泄露|透露|告诉我|输出|打印|重复|复述).{0,12}(密钥|密码|口令|令牌|token|api[_ -]?key|系统提示|提示词)/i,
  /忽略(以上|上述|前面|之前|此前|所有这些).{0,8}(指令|规则|要求|设定)/,
  /(执行|运行)(以下|下面|这段|该)(命令|脚本|工具调用|shell|cmd)/i,
  /(你现在是|从现在起你是|请扮演|pretend\s+to\s+be|you\s+are\s+now)/i,
];

function inspectKnowledgeText(text) {
  const matches = INJECTION_PATTERNS.filter((pattern) => pattern.test(String(text || ""))).map(String);
  return { safe: matches.length === 0, status: matches.length ? "prompt_injection" : "safe", matches };
}

function sanitizeEvidence(text, maxLength = 1800) {
  return String(text || "")
    .replace(/<\/?(?:script|iframe|object)[^>]*>/gi, "")
    .slice(0, maxLength);
}

module.exports = { inspectKnowledgeText, sanitizeEvidence, INJECTION_PATTERNS };
