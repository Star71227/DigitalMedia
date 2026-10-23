/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
// 支持 RAG 本地知识库的学科集合。
// 取值必须与 chatIntentService 的 SUBJECT_RULES、以及各课程目录 catalog.json / md front matter 的 subject 完全一致。
const KNOWLEDGE_SUBJECTS = ["数据结构", "操作系统", "计算机组成原理", "计算机网络", "C语言"];

const KNOWLEDGE_SUBJECT_SET = new Set(KNOWLEDGE_SUBJECTS);

module.exports = { KNOWLEDGE_SUBJECTS, KNOWLEDGE_SUBJECT_SET };
