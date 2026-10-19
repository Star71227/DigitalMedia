/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { generateText } = require("../aiService");

const FeedbackAgent = {
  name: "FeedbackAgent",
  description: "学习反馈更新智能体",
  systemPrompt:
    "你是智课研伴的学习反馈智能体。你需要根据错题、学生答案、标准答案、解析和开放追问题库评分点，输出结构化错因分析。",
  async run(context = {}, extraPrompt = "") {
    const prompt = [
      this.systemPrompt,
      "",
      "请只返回 JSON 对象，不要使用 Markdown，不要输出额外解释。",
      "JSON 字段必须是：",
      '{"error_reason":"错因分析","feedback_suggestion":"复习建议","recommended_action":"下一步行动"}',
      "",
      "如果上下文中有 openQuestionCheckpoints，请优先对照这些评分点判断学生漏掉了什么。",
      "",
      "【上下文】",
      JSON.stringify(context, null, 2),
      "",
      "【任务】",
      extraPrompt || "分析本次错题原因，并给出可执行的复习建议。",
    ].join("\n");

    try {
      const content = await generateText({
        capability: "feedback",
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.25,
        maxTokens: 800,
      });

      return normalizeFeedback(content, context);
    } catch (error) {
      return buildFeedbackFallback(context);
    }
  },
};

function normalizeFeedback(content, context = {}) {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return completeFeedback(content, context);
  }

  const parsed = extractJsonObject(content);
  if (parsed) {
    return completeFeedback(parsed, context);
  }

  const text = ensureText(content);
  if (text) {
    return completeFeedback(
      {
        error_reason:
          pickLabeledText(text, ["error_reason", "错因分析", "错误原因", "错因"]) || firstLine(text),
        feedback_suggestion:
          pickLabeledText(text, ["feedback_suggestion", "复习建议", "反馈建议", "建议"]) || secondLine(text),
        recommended_action:
          pickLabeledText(text, ["recommended_action", "下一步行动", "行动", "同类练习"]) || thirdLine(text),
      },
      context,
    );
  }

  return buildFeedbackFallback(context);
}

function completeFeedback(value, context = {}) {
  const fallback = buildFeedbackFallback(context);

  return {
    error_reason:
      ensureText(value.error_reason || value.errorReason || value.reason) || fallback.error_reason,
    feedback_suggestion:
      ensureText(value.feedback_suggestion || value.feedbackSuggestion || value.suggestion) ||
      fallback.feedback_suggestion,
    recommended_action:
      ensureText(value.recommended_action || value.recommendedAction || value.action) ||
      fallback.recommended_action,
  };
}

function buildFeedbackFallback(context = {}) {
  const subject = ensureText(context.subject || context.domain) || "当前科目";
  const topic = ensureText(context.knowledgePoint || context.topic) || "当前知识点";
  const selected = ensureText(context.selectedAnswer || context.selected_answer);
  const correct = ensureText(context.correctAnswer || context.correct_answer);
  const analysis = shorten(
    ensureText(context.analysis || (context.question && context.question.analysis)),
    120,
  );
  const checkpoints = normalizeCheckpoints(context.openQuestionCheckpoints);
  const checkpointText = checkpoints.slice(0, 3).join("；");
  const answerCompare =
    selected && correct ? `你选择了 ${selected}，正确答案是 ${correct}` : "本次作答与标准答案不一致";
  const keyBasis = checkpointText || analysis || `需要回到 ${topic} 的定义、适用条件和解题步骤重新核对`;

  return {
    error_reason: `本题属于 ${subject} 的 ${topic}。${answerCompare}；主要差距在于：${keyBasis}。`,
    feedback_suggestion: checkpointText
      ? `先对照开放追问题库评分点复盘：${checkpointText}。再结合本题解析，把每个评分点改写成自己的判断规则。`
      : `先复习 ${topic} 的核心定义和适用条件，再结合本题解析复盘为什么标准答案成立。`,
    recommended_action: `重做本题并写出 1 句排除错误选项的理由；随后完成 2 道 ${topic} 同类基础题，确认掌握度回升。`,
  };
}

function normalizeCheckpoints(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object") {
        return (
          item.checkpoint || item.content || item.text || item.label || item.name || JSON.stringify(item)
        );
      }

      return "";
    })
    .map((item) => shorten(ensureText(item), 80))
    .filter(Boolean);
}

function pickLabeledText(text, labels) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.、\s]+/, "").trim())
    .filter(Boolean);

  for (const label of labels) {
    const loweredLabel = label.toLowerCase();
    const matched = lines.find((line) => line.toLowerCase().includes(loweredLabel));
    if (matched) {
      return matched.replace(new RegExp(`^${escapeRegExp(label)}\\s*[:：-]?\\s*`, "i"), "").trim();
    }
  }

  return "";
}

function firstLine(text) {
  return getLine(text, 0);
}

function secondLine(text) {
  return getLine(text, 1);
}

function thirdLine(text) {
  return getLine(text, 2);
}

function getLine(text, index) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[index] || "";
}

function extractJsonObject(text) {
  const source = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  if (!source) {
    return null;
  }

  for (let index = source.indexOf("{"); index >= 0; index = source.indexOf("{", index + 1)) {
    const end = findMatchingBracket(source, index);
    if (end < 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(source.slice(index, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      // Try the next JSON-looking slice.
    }
  }

  return null;
}

function findMatchingBracket(text, start) {
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function shorten(text, maxLength) {
  const normalized = ensureText(text).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

module.exports = {
  FeedbackAgent,
};
