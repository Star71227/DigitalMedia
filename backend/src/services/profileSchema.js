/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const DIALOGUE_FIELDS = [
  "majorAndGrade",
  "currentCourse",
  "priorKnowledge",
  "learningGoals",
  "explanationPreference",
  "resourcePreferences",
  "paceAndTimeBudget",
];

function emptyProfileDraft() {
  return {
    majorAndGrade: { major: "", grade: "" },
    currentCourse: "",
    priorKnowledge: [],
    learningGoals: [],
    explanationPreference: "",
    resourcePreferences: [],
    paceAndTimeBudget: { pacePreference: "", weeklyTimeBudgetMinutes: null },
  };
}

function normalizeDraft(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const majorAndGrade =
    source.majorAndGrade && typeof source.majorAndGrade === "object" ? source.majorAndGrade : {};
  const pace =
    source.paceAndTimeBudget && typeof source.paceAndTimeBudget === "object" ? source.paceAndTimeBudget : {};

  return {
    majorAndGrade: {
      major: cleanText(majorAndGrade.major, 120),
      grade: cleanText(majorAndGrade.grade, 60),
    },
    currentCourse: cleanText(source.currentCourse, 160),
    priorKnowledge: cleanStringArray(source.priorKnowledge, 12, 200),
    learningGoals: cleanStringArray(source.learningGoals, 10, 240),
    explanationPreference: cleanText(source.explanationPreference, 255),
    resourcePreferences: cleanStringArray(source.resourcePreferences, 10, 100),
    paceAndTimeBudget: {
      pacePreference: cleanText(pace.pacePreference, 120),
      weeklyTimeBudgetMinutes: normalizeMinutes(pace.weeklyTimeBudgetMinutes),
    },
  };
}

function validatePatchValue(field, value) {
  const normalized = normalizeDraft({ [field]: value });
  return normalized[field];
}

function getMissingFields(draft) {
  const value = normalizeDraft(draft);
  return DIALOGUE_FIELDS.filter((field) => {
    if (field === "majorAndGrade") return !value.majorAndGrade.major || !value.majorAndGrade.grade;
    if (field === "paceAndTimeBudget") {
      return !value.paceAndTimeBudget.pacePreference || !value.paceAndTimeBudget.weeklyTimeBudgetMinutes;
    }
    if (Array.isArray(value[field])) return value[field].length === 0;
    return !value[field];
  });
}

function calculateCompleteness(draft) {
  return Number(
    ((DIALOGUE_FIELDS.length - getMissingFields(draft).length) / DIALOGUE_FIELDS.length).toFixed(4),
  );
}

function mergeDraft(current, patch) {
  const merged = { ...normalizeDraft(current) };
  for (const field of DIALOGUE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) continue;
    const value = validatePatchValue(field, patch[field]);
    if (field === "majorAndGrade") {
      merged.majorAndGrade = { ...merged.majorAndGrade, ...value };
    } else if (field === "paceAndTimeBudget") {
      merged.paceAndTimeBudget = { ...merged.paceAndTimeBudget, ...value };
    } else if (Array.isArray(value)) {
      merged[field] = value.length ? value : merged[field];
    } else if (value) {
      merged[field] = value;
    }
  }
  return normalizeDraft(merged);
}

function cleanStringArray(value, maxItems, maxLength) {
  const items = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value] : [];
  return Array.from(new Set(items.map((item) => cleanText(item, maxLength)).filter(Boolean))).slice(
    0,
    maxItems,
  );
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.round(minutes), 10080) : null;
}

module.exports = {
  DIALOGUE_FIELDS,
  emptyProfileDraft,
  normalizeDraft,
  validatePatchValue,
  getMissingFields,
  calculateCompleteness,
  mergeDraft,
  cleanText,
};
