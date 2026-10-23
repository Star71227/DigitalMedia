/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 错误类型标签：后端既会写中文错误类型（题库判定），也会写英文枚举（模型归因、历史数据）。
 * 图表和列表统一走这里，避免「常见错误类型」里混着 memory_confusion 这种原始枚举名。
 */
const ERROR_TYPE_LABELS: Record<string, string> = {
  unknown: "未分类",
  concept_misunderstanding: "概念理解偏差",
  procedure_confusion: "步骤混淆",
  implementation_error: "实现错误",
  memory_confusion: "记忆混淆",
  boundary_condition: "边界条件遗漏",
  calculation_error: "计算失误",
  formula_misuse: "公式/条件误用",
  mirror_confusion: "相似概念混淆",
  condition_omission: "遗漏条件",
  ordering_error: "步骤顺序错误",
  terminology_misuse: "术语使用不当",
  careless_reading: "审题遗漏",
  time_management: "时间分配不当",
};

export function errorTypeLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "未分类";
  return ERROR_TYPE_LABELS[raw] || raw;
}

export default ERROR_TYPE_LABELS;
