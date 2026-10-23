/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { normalizeMindMapContent } = require("./mindMapNormalizationService");

const VALIDATOR_VERSION = "mind-map-structure-quality-v1";
const NORMAL_LIMITS = {
  minNodes: 20,
  maxNodes: 50,
  minFirstLevel: 4,
  maxFirstLevel: 6,
  minSecondLevel: 15,
  maxSecondLevel: 30,
  minDepth: 3,
  maxDepth: 5,
  minCrossLinks: 3,
  minExamples: 2,
  minMisconceptions: 3,
  minProcessBranches: 1,
};
const DEEP_LIMITS = {
  ...NORMAL_LIMITS,
  minNodes: 30,
  maxNodes: 60,
  minFirstLevel: 5,
  maxFirstLevel: 7,
  minSecondLevel: 20,
  maxSecondLevel: 40,
  minDepth: 4,
  maxDepth: 6,
  minCrossLinks: 5,
  minExamples: 3,
  minMisconceptions: 5,
  minProcessBranches: 2,
};
const GENERIC_TITLES = new Set([
  "概述",
  "基本概念",
  "核心内容",
  "应用场景",
  "优缺点",
  "总结",
  "其他",
  "补充",
  "更多内容",
  "相关知识",
  "学习目标",
  "核心概念",
  "练习与验证",
  "常见错误",
]);
const PLACEHOLDER_PATTERN =
  /TODO|TBC|待补充|placeholder|\{\{[^}]+\}|\$\{[^}]+\}|\[待填写\]|知识点\d+|子主题|内容[一二三四五六]|示例A|其他情况|更多细节|未完成|继续生成|略$/i;
const INTERNAL_PATTERN =
  /(?:ResourceAgent|ReviewAgent|Prompt|system prompt|chain[- ]?of[- ]?thought|api[_-]?key|SPARK_API_KEY|数据库ID|retrievalRunId|chunkId|generation_id|provider)/i;
const UNSAFE_PATTERN =
  /<\/?(?:script|iframe|object|embed|svg|form|style|img|a)\b|\bon\w+\s*=|javascript:|data:text\/html|vbscript:|https?:\/\//i;

function validateMindMapQuality(input = {}) {
  const content = input.content && input.content.content ? input.content.content : input.content;
  const context = input.context || {};
  const citations = Array.isArray(input.citations) ? input.citations : [];
  const retrievalResults = Array.isArray(input.retrieval?.results) ? input.retrieval.results : [];
  const limits = input.depth === "deep" || context.depth === "deep" ? DEEP_LIMITS : NORMAL_LIMITS;
  const issues = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return failedResult(
      "invalid_content",
      "mind_map内容必须是对象。",
      limits,
      context,
      citations,
      retrievalResults,
    );
  }

  let normalized;
  try {
    normalized = normalizeMindMapContent(content, { repairIds: false });
  } catch (error) {
    return failedResult(
      "invalid_content",
      "mind_map缺少可解析的root结构。",
      limits,
      context,
      citations,
      retrievalResults,
    );
  }

  const analysis = analyzeMindMap(normalized, content);
  const allText = analysis.nodes.map((node) => `${node.id} ${node.label} ${node.description}`).join("\n");
  const rawText = safeStringify(content);
  const profileFacts = extractProfileFacts(context);
  const profileMatches = matchedProfileFacts(profileFacts, analysis.nodes);
  const citationCheck = validateCitationUse({ nodes: analysis.nodes, citations, retrievalResults });
  const metrics = {
    rootCount: analysis.rootCount,
    totalNodes: analysis.nodes.length,
    firstLevelNodes: analysis.nodes.filter((node) => node.depth === 2).length,
    secondLevelNodes: analysis.nodes.filter((node) => node.depth === 3).length,
    maxDepth: analysis.maxDepth,
    leafNodes: analysis.nodes.filter((node) => node.childIds.length === 0).length,
    hierarchyEdges: analysis.edges.length,
    crossLinks: Array.isArray(normalized.crossLinks) ? normalized.crossLinks.length : 0,
    validCrossLinks: analysis.validCrossLinks.length,
    noDescriptionNodes: analysis.nodes.filter((node) => !node.description.trim()).length,
    shortDescriptionNodes: analysis.nodes.filter(
      (node) => node.depth > 1 && countEffectiveChinese(node.description) < 20,
    ).length,
    descriptionCoverage: analysis.nodes.length
      ? Number(
          (
            analysis.nodes.filter((node) => hasMeaningfulDescription(node)).length / analysis.nodes.length
          ).toFixed(3),
        )
      : 0,
    duplicateIdCount: analysis.duplicateIdCount,
    emptyIdCount: analysis.nodes.filter((node) => !node.id.trim()).length,
    duplicateNameNodes: duplicateNameCount(analysis.nodes),
    siblingDuplicateNodes: siblingDuplicateCount(analysis.nodes),
    orphanNodes: analysis.orphanNodes,
    unreachableNodes: analysis.unreachableNodes,
    selfLoops: analysis.selfLoops,
    duplicateEdges: analysis.duplicateEdges,
    hierarchyCycles: analysis.hierarchyCycles,
    invalidEdges: analysis.invalidEdges,
    genericTemplateNodes: analysis.nodes.filter(
      (node) => node.depth === 2 && GENERIC_TITLES.has(node.label.trim()),
    ).length,
    placeholderMatches: analysis.nodes.filter((node) =>
      PLACEHOLDER_PATTERN.test(`${node.id} ${node.label} ${node.description}`),
    ).length,
    duplicateDescriptionRatio: duplicateDescriptionRatio(analysis.nodes),
    exampleCount: analysis.nodes.filter(isSpecificExample).length,
    misconceptionCount: analysis.nodes.filter(isSpecificMisconception).length,
    processBranchCount: countProcessBranches(analysis.nodes),
    summaryBranchCount: analysis.nodes.filter(isSummaryNode).length,
    citationCount: citations.length,
    nodeCitationCount: analysis.nodes.reduce((sum, node) => sum + node.citations.length, 0),
    citationsAvailable: retrievalResults.length > 0,
    profileFactCount: profileMatches.count,
    profileFactCategories: profileMatches.categories,
    profileFactBranchCount: profileMatches.branchCount,
    personalizationAvailable: profileFacts.length > 0,
    internalTermMatches: countPattern(`${rawText}\n${allText}`, INTERNAL_PATTERN),
    unsafeMatches: countPattern(`${rawText}\n${allText}`, UNSAFE_PATTERN),
    truncated: isTruncated(content),
  };

  requireMetric(
    issues,
    metrics.rootCount === 1,
    "invalid_root_count",
    `主题root数量为 ${metrics.rootCount}，必须恰好为1。`,
  );
  requireMetric(
    issues,
    metrics.firstLevelNodes >= limits.minFirstLevel && metrics.firstLevelNodes <= limits.maxFirstLevel,
    "invalid_first_level_count",
    `一级主题节点 ${metrics.firstLevelNodes}，应为 ${limits.minFirstLevel} 至 ${limits.maxFirstLevel} 个。`,
  );
  requireMetric(
    issues,
    metrics.secondLevelNodes >= limits.minSecondLevel && metrics.secondLevelNodes <= limits.maxSecondLevel,
    "invalid_second_level_count",
    `二级节点 ${metrics.secondLevelNodes}，应为 ${limits.minSecondLevel} 至 ${limits.maxSecondLevel} 个。`,
  );
  requireMetric(
    issues,
    metrics.totalNodes >= limits.minNodes && metrics.totalNodes <= limits.maxNodes,
    "invalid_total_node_count",
    `总知识节点 ${metrics.totalNodes}，应为 ${limits.minNodes} 至 ${limits.maxNodes} 个。`,
  );
  requireMetric(
    issues,
    metrics.maxDepth >= limits.minDepth,
    "max_depth_too_shallow",
    `最大深度 ${metrics.maxDepth}，低于 ${limits.minDepth}。`,
  );
  requireMetric(
    issues,
    metrics.maxDepth <= limits.maxDepth,
    "max_depth_too_deep",
    `最大深度 ${metrics.maxDepth}，超过 ${limits.maxDepth}。`,
  );
  requireMetric(issues, metrics.emptyIdCount === 0, "empty_node_id", "存在空节点ID。");
  requireMetric(
    issues,
    metrics.duplicateIdCount === 0,
    "duplicate_node_id",
    `存在 ${metrics.duplicateIdCount} 个重复节点ID。`,
  );
  requireMetric(
    issues,
    analysis.nodes.every((node) => node.label.trim()),
    "empty_title",
    "存在空标题节点。",
  );
  requireMetric(
    issues,
    metrics.descriptionCoverage >= 0.9,
    "insufficient_description_coverage",
    `有意义description覆盖率 ${metrics.descriptionCoverage}，低于90%。`,
  );
  requireMetric(
    issues,
    metrics.shortDescriptionNodes === 0,
    "short_description",
    `存在 ${metrics.shortDescriptionNodes} 个短description节点。`,
  );
  requireMetric(
    issues,
    analysis.nodes
      .filter((node) => node.depth === 2)
      .every((node) => countEffectiveChinese(node.description) >= 40),
    "first_level_description_too_short",
    "一级主题description必须不少于40个有效中文字符。",
  );
  requireMetric(
    issues,
    metrics.validCrossLinks >= limits.minCrossLinks,
    "insufficient_cross_links",
    `有效跨分支联系 ${metrics.validCrossLinks}，低于 ${limits.minCrossLinks}。`,
  );
  requireMetric(
    issues,
    metrics.exampleCount >= limits.minExamples,
    "insufficient_examples",
    `具体示例节点 ${metrics.exampleCount}，低于 ${limits.minExamples}。`,
  );
  requireMetric(
    issues,
    metrics.misconceptionCount >= limits.minMisconceptions,
    "insufficient_misconceptions",
    `具体易错点或辨析节点 ${metrics.misconceptionCount}，低于 ${limits.minMisconceptions}。`,
  );
  requireMetric(
    issues,
    metrics.processBranchCount >= limits.minProcessBranches,
    "missing_process_branch",
    `过程、协议或代码分支 ${metrics.processBranchCount}，低于 ${limits.minProcessBranches}。`,
  );
  requireMetric(
    issues,
    metrics.summaryBranchCount >= 1,
    "missing_summary_branch",
    "缺少总结或复习顺序分支。",
  );
  requireMetric(
    issues,
    metrics.orphanNodes === 0,
    "orphan_nodes",
    `存在 ${metrics.orphanNodes} 个孤儿节点。`,
  );
  requireMetric(
    issues,
    metrics.unreachableNodes === 0,
    "unreachable_nodes",
    `存在 ${metrics.unreachableNodes} 个不可达节点。`,
  );
  requireMetric(
    issues,
    metrics.hierarchyCycles === 0,
    "hierarchy_cycle",
    `存在 ${metrics.hierarchyCycles} 个层级循环。`,
  );
  requireMetric(issues, metrics.selfLoops === 0, "self_loop", `存在 ${metrics.selfLoops} 个自环。`);
  requireMetric(
    issues,
    metrics.duplicateEdges === 0,
    "duplicate_edges",
    `存在 ${metrics.duplicateEdges} 条重复层级边。`,
  );
  requireMetric(
    issues,
    metrics.invalidEdges === 0,
    "invalid_edges",
    `存在 ${metrics.invalidEdges} 条无效边或跨链接。`,
  );
  requireMetric(
    issues,
    metrics.siblingDuplicateNodes === 0,
    "sibling_duplicate_title",
    `存在 ${metrics.siblingDuplicateNodes} 个同级同名节点。`,
  );
  requireMetric(
    issues,
    metrics.placeholderMatches === 0,
    "placeholder_found",
    "存在空节点、占位节点或仅编号节点。",
  );
  requireMetric(
    issues,
    metrics.genericTemplateNodes < 2,
    "generic_template_titles",
    "一级节点大量使用通用模板标题。",
  );
  requireMetric(
    issues,
    metrics.duplicateDescriptionRatio < 0.25,
    "duplicate_descriptions",
    `重复description比例 ${metrics.duplicateDescriptionRatio} 过高。`,
  );
  requireMetric(issues, citationCheck.valid, "invalid_citations", citationCheck.message);
  if (retrievalResults.length)
    requireMetric(
      issues,
      metrics.nodeCitationCount > 0,
      "missing_node_citations",
      "知识库有命中时，至少一个真实知识节点需要绑定可验证引用。",
    );
  if (profileFacts.length) {
    requireMetric(
      issues,
      metrics.profileFactCount >= 3,
      "insufficient_profile_facts",
      "已有学习画像时，导图至少应使用3项真实画像事实。",
    );
    requireMetric(
      issues,
      metrics.profileFactBranchCount >= 2,
      "profile_facts_not_distributed",
      "画像事实需要分布在不同分支中。",
    );
  }
  requireMetric(
    issues,
    metrics.internalTermMatches === 0,
    "internal_terms_leaked",
    "内容包含内部字段、Prompt或Agent名称。",
  );
  requireMetric(issues, metrics.unsafeMatches === 0, "unsafe_content", "内容包含HTML、脚本或外部URL。");
  requireMetric(issues, !metrics.truncated, "content_truncated", "内容疑似截断或结构残缺。");

  return {
    passed: issues.length === 0,
    ...metrics,
    issues,
    checks: buildChecks(metrics, limits, citationCheck, profileFacts.length > 0),
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function failedResult(code, message, limits, context, citations, retrievalResults) {
  const profileFacts = extractProfileFacts(context);
  return {
    passed: false,
    rootCount: 0,
    totalNodes: 0,
    firstLevelNodes: 0,
    secondLevelNodes: 0,
    maxDepth: 0,
    leafNodes: 0,
    hierarchyEdges: 0,
    crossLinks: 0,
    validCrossLinks: 0,
    noDescriptionNodes: 0,
    shortDescriptionNodes: 0,
    descriptionCoverage: 0,
    duplicateIdCount: 0,
    emptyIdCount: 0,
    duplicateNameNodes: 0,
    siblingDuplicateNodes: 0,
    orphanNodes: 0,
    unreachableNodes: 0,
    selfLoops: 0,
    duplicateEdges: 0,
    hierarchyCycles: 0,
    invalidEdges: 0,
    genericTemplateNodes: 0,
    placeholderMatches: 0,
    duplicateDescriptionRatio: 0,
    exampleCount: 0,
    misconceptionCount: 0,
    processBranchCount: 0,
    summaryBranchCount: 0,
    citationCount: citations.length,
    nodeCitationCount: 0,
    citationsAvailable: retrievalResults.length > 0,
    profileFactCount: 0,
    profileFactCategories: [],
    profileFactBranchCount: 0,
    personalizationAvailable: profileFacts.length > 0,
    internalTermMatches: 0,
    unsafeMatches: 0,
    truncated: true,
    issues: [{ code, message }],
    checks: buildChecks(
      {
        totalNodes: 0,
        validCrossLinks: 0,
        descriptionCoverage: 0,
        exampleCount: 0,
        misconceptionCount: 0,
        processBranchCount: 0,
      },
      limits,
      { valid: false, message },
      profileFacts.length > 0,
    ),
    checkedAt: new Date().toISOString(),
    validatorVersion: VALIDATOR_VERSION,
  };
}

function analyzeMindMap(content, rawContent = content) {
  const nodes = [];
  const edges = [];
  const ids = new Map();
  const seenEdges = new Set();
  const duplicateEdges = { count: 0 };
  const counters = { hierarchyCycles: 0, selfLoops: 0, invalidEdges: 0 };
  const visit = (node, parentId, depth, topBranchId, ancestors, objectStack) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      counters.invalidEdges += 1;
      return;
    }
    if (objectStack.has(node)) {
      counters.hierarchyCycles += 1;
      return;
    }
    const id = String(node.id || "").trim();
    const nextTopBranch = depth === 2 ? id : topBranchId;
    const childIds = Array.isArray(node.children)
      ? node.children.map((child) => String(child?.id || "").trim())
      : [];
    const record = {
      id,
      label: String(node.label || "").trim(),
      description: String(node.description || "").trim(),
      nodeType: String(node.nodeType || "").trim(),
      importance: String(node.importance || "").trim(),
      citations: Array.isArray(node.citations) ? node.citations.map(Number).filter(Number.isFinite) : [],
      parentId,
      depth,
      topBranchId: nextTopBranch,
      childIds,
    };
    nodes.push(record);
    if (id) ids.set(id, (ids.get(id) || 0) + 1);
    if (parentId !== null) {
      if (parentId === id) counters.selfLoops += 1;
      const key = `${parentId}->${id}`;
      if (seenEdges.has(key)) duplicateEdges.count += 1;
      seenEdges.add(key);
      edges.push({ sourceId: parentId, targetId: id });
    }
    if (id && ancestors.has(id)) {
      counters.hierarchyCycles += 1;
      return;
    }
    const nextAncestors = new Set(ancestors);
    if (id) nextAncestors.add(id);
    const nextStack = new Set(objectStack);
    nextStack.add(node);
    for (const child of Array.isArray(node.children) ? node.children : [])
      visit(child, id, depth + 1, nextTopBranch, nextAncestors, nextStack);
  };
  visit(content.root, null, 1, null, new Set(), new Set());
  const idSet = new Set(nodes.map((node) => node.id).filter(Boolean));
  for (const link of Array.isArray(content.crossLinks) ? content.crossLinks : []) {
    const sourceId = String(link?.sourceId || "").trim();
    const targetId = String(link?.targetId || "").trim();
    if (!idSet.has(sourceId) || !idSet.has(targetId)) counters.invalidEdges += 1;
    if (sourceId && sourceId === targetId) counters.selfLoops += 1;
  }
  const validCrossLinks = validateCrossLinks(content.crossLinks || [], nodes, edges);
  return {
    nodes,
    edges,
    rootCount: nodes.filter((node, index) => index === 0 || node.nodeType === "root").length,
    maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
    duplicateIdCount: [...ids.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    duplicateEdges: duplicateEdges.count + countFlatDuplicateEdges(rawContent),
    orphanNodes: countFlatOrphans(rawContent),
    unreachableNodes: countFlatUnreachable(rawContent),
    hierarchyCycles: counters.hierarchyCycles + countFlatCycles(rawContent),
    selfLoops: counters.selfLoops + countFlatSelfLoops(rawContent),
    invalidEdges: counters.invalidEdges + countFlatInvalidEdges(rawContent),
    validCrossLinks,
  };
}

function validateCrossLinks(links, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hierarchy = new Set(edges.map((edge) => `${edge.sourceId}->${edge.targetId}`));
  const seen = new Set();
  const valid = [];
  for (const link of Array.isArray(links) ? links : []) {
    const source = byId.get(String(link?.sourceId || ""));
    const target = byId.get(String(link?.targetId || ""));
    const label = String(link?.label || link?.relation || link?.description || "");
    if (!source || !target || source.id === target.id) continue;
    if (!source.topBranchId || !target.topBranchId || source.topBranchId === target.topBranchId) continue;
    if (hierarchy.has(`${source.id}->${target.id}`) || hierarchy.has(`${target.id}->${source.id}`)) continue;
    const pair = [source.id, target.id].sort().join("<>");
    if (seen.has(pair)) continue;
    if (countEffectiveChinese(label) < 8 || /相关|联系|关联|影响|关系$/.test(label.trim())) continue;
    if (source.id === nodes[0]?.id || target.id === nodes[0]?.id) continue;
    seen.add(pair);
    valid.push(link);
  }
  return valid;
}

function countFlatOrphans(content) {
  if (!Array.isArray(content.nodes)) return 0;
  const ids = new Set(content.nodes.map((node) => String(node?.id || "").trim()).filter(Boolean));
  return content.nodes.filter((node) => {
    const parentId = String(node?.parentId || "").trim();
    return parentId && !ids.has(parentId);
  }).length;
}

function countFlatUnreachable(content) {
  if (!Array.isArray(content.nodes) || !content.nodes.length) return 0;
  const children = new Map();
  const ids = new Set(content.nodes.map((node) => String(node?.id || "").trim()).filter(Boolean));
  const childIds = new Set();
  content.nodes.forEach((node) => {
    const id = String(node?.id || "").trim();
    const parentId = String(node?.parentId || "").trim();
    if (parentId && ids.has(parentId)) {
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(id);
      childIds.add(id);
    }
  });
  for (const edge of Array.isArray(content.edges) ? content.edges : []) {
    const type = String(edge?.type || edge?.kind || "hierarchy");
    if (/cross/i.test(type)) continue;
    const source = String(edge?.sourceId || edge?.source || edge?.from || "").trim();
    const target = String(edge?.targetId || edge?.target || edge?.to || "").trim();
    if (ids.has(source) && ids.has(target)) {
      if (!children.has(source)) children.set(source, []);
      children.get(source).push(target);
      childIds.add(target);
    }
  }
  const root =
    content.nodes.find((node) => String(node?.nodeType || node?.type || "") === "root") ||
    content.nodes.find((node) => !childIds.has(String(node?.id || "").trim())) ||
    content.nodes[0];
  const rootId = String(root?.id || "").trim();
  const visited = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    for (const child of children.get(id) || []) stack.push(child);
  }
  return [...ids].filter((id) => !visited.has(id)).length;
}

function countFlatCycles(content) {
  if (!Array.isArray(content.nodes)) return 0;
  const graph = new Map();
  for (const node of content.nodes) graph.set(String(node?.id || "").trim(), []);
  for (const node of content.nodes) {
    const id = String(node?.id || "").trim();
    const parentId = String(node?.parentId || "").trim();
    if (id && parentId && graph.has(parentId)) graph.get(parentId).push(id);
  }
  for (const edge of Array.isArray(content.edges) ? content.edges : []) {
    const type = String(edge?.type || edge?.kind || "hierarchy");
    if (/cross/i.test(type)) continue;
    const source = String(edge?.sourceId || edge?.source || edge?.from || "").trim();
    const target = String(edge?.targetId || edge?.target || edge?.to || "").trim();
    if (graph.has(source)) graph.get(source).push(target);
  }
  let cycles = 0;
  const visiting = new Set();
  const visited = new Set();
  const dfs = (id) => {
    if (visiting.has(id)) {
      cycles += 1;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of graph.get(id) || []) dfs(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) dfs(id);
  return cycles;
}

function countFlatInvalidEdges(content) {
  if (!Array.isArray(content.nodes) || !Array.isArray(content.edges)) return 0;
  const ids = new Set(content.nodes.map((node) => String(node?.id || "").trim()).filter(Boolean));
  return content.edges.filter((edge) => {
    const source = String(edge?.sourceId || edge?.source || edge?.from || "").trim();
    const target = String(edge?.targetId || edge?.target || edge?.to || "").trim();
    return !ids.has(source) || !ids.has(target);
  }).length;
}

function countFlatSelfLoops(content) {
  if (!Array.isArray(content.edges)) return 0;
  return content.edges.filter((edge) => {
    const source = String(edge?.sourceId || edge?.source || edge?.from || "").trim();
    const target = String(edge?.targetId || edge?.target || edge?.to || "").trim();
    return source && source === target;
  }).length;
}

function countFlatDuplicateEdges(content) {
  if (!Array.isArray(content.edges)) return 0;
  const seen = new Set();
  let duplicate = 0;
  for (const edge of content.edges) {
    const type = String(edge?.type || edge?.kind || "hierarchy");
    if (/cross/i.test(type)) continue;
    const source = String(edge?.sourceId || edge?.source || edge?.from || "").trim();
    const target = String(edge?.targetId || edge?.target || edge?.to || "").trim();
    const key = `${source}->${target}`;
    if (seen.has(key)) duplicate += 1;
    seen.add(key);
  }
  return duplicate;
}

function hasMeaningfulDescription(node) {
  const min = node.depth === 1 ? 12 : node.depth === 2 ? 40 : 20;
  const text = `${node.label}\n${node.description}`;
  return countEffectiveChinese(node.description) >= min && !PLACEHOLDER_PATTERN.test(text);
}

function isSpecificExample(node) {
  const text = `${node.label}\n${node.description}`;
  return (
    (node.nodeType === "example" || /示例|案例|例题|样例/.test(node.label)) &&
    countEffectiveChinese(text) >= 35 &&
    !/^(示例|举例理解|案例)$/.test(node.label.trim()) &&
    /插入|线程|进程|SYN|ACK|FIN|TIME_WAIT|节点|计数器|输入|输出|10|20|30|浏览器|握手|挥手|旋转|调度/.test(
      text,
    )
  );
}

function isSpecificMisconception(node) {
  const text = `${node.label}\n${node.description}`;
  return (
    (node.nodeType === "misconception" ||
      node.nodeType === "warning" ||
      /误区|易错|辨析|混淆/.test(node.label)) &&
    countEffectiveChinese(text) >= 35 &&
    /误|错|混淆|忽略|认为|不能|不是|原因|纠正|避免|修正|正确/.test(text) &&
    !/^(注意事项|易错点|常见错误)$/.test(node.label.trim())
  );
}

function countProcessBranches(nodes) {
  const candidates = nodes.filter((node) => {
    const label = node.label;
    const description = node.description;
    return (
      node.nodeType === "code" ||
      node.nodeType === "step" ||
      /代码|伪代码|执行|过程|步骤|流程|协议|状态迁移|调度路径/.test(label) ||
      /伪代码|执行步骤|协议过程|状态迁移|调度路径/.test(description)
    );
  });
  return new Set(candidates.map((node) => node.topBranchId || node.id)).size;
}

function isSummaryNode(node) {
  return (
    node.nodeType === "summary" || /总结|复习|顺序|回顾|下一步/.test(`${node.label}\n${node.description}`)
  );
}

function duplicateNameCount(nodes) {
  const groups = new Map();
  nodes.forEach((node) => groups.set(node.label, (groups.get(node.label) || 0) + 1));
  return [...groups.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function siblingDuplicateCount(nodes) {
  const groups = new Map();
  nodes.forEach((node) => {
    const key = `${node.parentId || "<root>"}::${node.label}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  return [...groups.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function duplicateDescriptionRatio(nodes) {
  const values = nodes
    .map((node) => node.description.replace(/\s+/g, ""))
    .filter((text) => countEffectiveChinese(text) >= 20);
  if (values.length < 2) return 0;
  const unique = new Set(values);
  const exact = values.length - unique.size;
  return Number((exact / values.length).toFixed(3));
}

function validateCitationUse({ nodes, citations, retrievalResults }) {
  const nodeCitationIds = [...new Set(nodes.flatMap((node) => node.citations).map(Number))];
  if (!retrievalResults.length) {
    if (citations.length || nodeCitationIds.length)
      return { valid: false, message: "知识库无命中时不得生成课程资料引用。" };
    return { valid: true, message: "知识库无命中，不强制引用。" };
  }
  if (!citations.length) return { valid: false, message: "知识库有命中时至少需要1条真实引用。" };
  const retrievalIds = new Set(retrievalResults.map((item) => Number(item.chunkId)));
  const catalogIds = new Set();
  const labels = new Set();
  for (const citation of citations) {
    const chunkId = Number(citation?.chunkId);
    if (!retrievalIds.has(chunkId)) return { valid: false, message: "引用包含本次检索之外的来源。" };
    if (!citation?.label || labels.has(citation.label))
      return { valid: false, message: "引用编号缺失或重复。" };
    if (!citation?.sourceTitle || !citation?.excerpt)
      return { valid: false, message: "引用缺少来源标题或摘录。" };
    labels.add(citation.label);
    catalogIds.add(chunkId);
  }
  const dangling = nodeCitationIds.filter((id) => !catalogIds.has(id));
  return dangling.length
    ? { valid: false, message: "节点sourceRef或citation指向不存在的引用。" }
    : { valid: true, message: "引用可验证。" };
}

function extractProfileFacts(context = {}) {
  const facts = [];
  const add = (category, value) => {
    const text = String(value || "").trim();
    if (text.length >= 2) facts.push({ category, value: text });
  };
  add("major", context.major);
  add("grade", context.grade);
  add("course", context.currentCourse);
  if (Number.isFinite(Number(context.mastery))) add("mastery", `掌握度 ${Number(context.mastery)}`);
  for (const item of array(context.priorKnowledge)) add("priorKnowledge", item);
  for (const item of array(context.learningGoals)) add("learningGoal", item);
  add("explanationPreference", context.explanationPreference);
  for (const item of array(context.resourcePreferences)) add("resourcePreference", item);
  add("pacePreference", context.paceAndTimeBudget?.pacePreference);
  if (context.paceAndTimeBudget?.weeklyTimeBudgetMinutes)
    add("timeBudget", `${context.paceAndTimeBudget.weeklyTimeBudgetMinutes}`);
  for (const item of array(context.errorPatterns)) add("errorPattern", item?.errorType || item);
  const seen = new Set();
  return facts.filter((fact) => {
    const key = `${fact.category}:${fact.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchedProfileFacts(facts, nodes) {
  const matched = new Map();
  const branches = new Set();
  for (const node of nodes) {
    const text = `${node.label}\n${node.description}`;
    for (const fact of facts) {
      const value = fact.value.replace(/^掌握度\s*/, "");
      const match =
        text.includes(fact.value) ||
        (value && text.includes(value)) ||
        (fact.category === "mastery" && /掌握度/.test(text));
      if (match) {
        matched.set(`${fact.category}:${fact.value}`, fact.category);
        if (node.topBranchId) branches.add(node.topBranchId);
      }
    }
  }
  return { count: matched.size, categories: [...new Set(matched.values())], branchCount: branches.size };
}

function isTruncated(content) {
  const text = safeStringify(content);
  return /未完待续|继续生成|内容截断|下文继续/i.test(text) || text.trim().endsWith(",");
}

function buildChecks(metrics, limits, citationCheck, requireProfile) {
  return [
    { name: "唯一主题root", passed: metrics.rootCount === 1, detail: `root数量 ${metrics.rootCount || 0}` },
    {
      name: "节点规模",
      passed: metrics.totalNodes >= limits.minNodes && metrics.totalNodes <= limits.maxNodes,
      detail: `总节点 ${metrics.totalNodes || 0}`,
    },
    {
      name: "一级与二级结构",
      passed:
        metrics.firstLevelNodes >= limits.minFirstLevel && metrics.secondLevelNodes >= limits.minSecondLevel,
      detail: `一级 ${metrics.firstLevelNodes || 0}，二级 ${metrics.secondLevelNodes || 0}`,
    },
    {
      name: "description覆盖",
      passed: metrics.descriptionCoverage >= 0.9 && metrics.shortDescriptionNodes === 0,
      detail: `覆盖率 ${metrics.descriptionCoverage || 0}`,
    },
    {
      name: "跨分支联系",
      passed: metrics.validCrossLinks >= limits.minCrossLinks,
      detail: `有效跨链接 ${metrics.validCrossLinks || 0}`,
    },
    {
      name: "示例、易错点与过程分支",
      passed:
        metrics.exampleCount >= limits.minExamples &&
        metrics.misconceptionCount >= limits.minMisconceptions &&
        metrics.processBranchCount >= limits.minProcessBranches,
      detail: `示例 ${metrics.exampleCount || 0}，易错 ${metrics.misconceptionCount || 0}，过程 ${metrics.processBranchCount || 0}`,
    },
    { name: "引用真实性", passed: citationCheck.valid, detail: citationCheck.message },
    {
      name: "画像事实使用",
      passed: !requireProfile || metrics.profileFactCount >= 3,
      detail: requireProfile ? `画像事实 ${metrics.profileFactCount || 0}` : "无画像时不强制个性化",
    },
  ];
}

function countEffectiveChinese(text) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`{1,3}|#{1,6}|[*_>\-+|[\](){}$]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(PLACEHOLDER_PATTERN, " ")
    .replace(/\s+/g, " ");
  return (cleaned.match(/[\p{Script=Han}]/gu) || []).length;
}

function requireMetric(issues, passed, code, message) {
  if (!passed) issues.push({ code, message });
}

function countPattern(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (String(text || "").match(new RegExp(pattern.source, flags)) || []).length;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  VALIDATOR_VERSION,
  NORMAL_LIMITS,
  DEEP_LIMITS,
  validateMindMapQuality,
  analyzeMindMap,
  countEffectiveChinese,
  extractProfileFacts,
};
