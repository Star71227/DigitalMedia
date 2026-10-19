/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const pct = (v) => (v == null || v === "" ? "暂无数据" : `${Math.round(Number(v) * 10) / 10}%`);
const num = (v) => (v == null ? "—" : String(v));
const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const RESOURCE_LABELS = {
  study_note: "个性化讲义",
  mind_map: "思维导图",
  pptx: "学习课件",
  quiz_pack: "智能练习包",
  code_case: "代码实操案例",
};
const COMPLETION_LABELS = { quiz: "测验达标", resource: "完成资源学习", codelab: "通过代码练习" };
const STAGE_STATUS = { completed: "已完成", in_progress: "进行中", pending: "待开始" };
const ERROR_LABELS = {
  concept_misunderstanding: "概念理解偏差",
  procedure_confusion: "步骤顺序错误",
  boundary_omission: "边界条件遗漏",
  calculation_error: "计算失误",
  terminology_misuse: "术语使用不当",
  mirror_confusion: "概念镜像混淆",
  condition_missed: "审题遗漏条件",
};
const errorLabel = (value) => ERROR_LABELS[value] || value || "其他";
const list = (title, items, empty) =>
  `<section><h2>${esc(title)}</h2>${items?.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">${esc(empty || "暂无可用记录")}</p>`}</section>`;
const bar = (value, color = "#086fe7") =>
  `<div class="track"><div class="fill" style="width:${clampPct(value)}%;background:${color}"></div></div>`;

/** 知识点掌握度雷达：把掌握度映射成 8 边形（不足 3 个点则不画）。 */
function radarSvg(points) {
  if (!points || points.length < 3) return "";
  const size = 260,
    cx = size / 2,
    cy = size / 2 + 6,
    R = size / 2 - 40,
    max = 100;
  const n = points.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const radius = (v) => R * Math.max(0, Math.min(1, Number(v) / max));
  const rings = [0.25, 0.5, 0.75, 1]
    .map(
      (ratio) =>
        `<polygon points="${points.map((_, i) => `${(cx + Math.cos(angle(i)) * R * ratio).toFixed(1)},${(cy + Math.sin(angle(i)) * R * ratio).toFixed(1)}`).join(" ")}" fill="none" stroke="#e2e6ea" stroke-width="0.8"/>`,
    )
    .join("");
  const spokes = points
    .map(
      (_, i) =>
        `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(angle(i)) * R).toFixed(1)}" y2="${(cy + Math.sin(angle(i)) * R).toFixed(1)}" stroke="#e2e6ea" stroke-width="0.8"/>`,
    )
    .join("");
  const shape = points
    .map(
      (p, i) =>
        `${(cx + Math.cos(angle(i)) * radius(p.mastery)).toFixed(1)},${(cy + Math.sin(angle(i)) * radius(p.mastery)).toFixed(1)}`,
    )
    .join(" ");
  const labels = points
    .map((p, i) => {
      const x = cx + Math.cos(angle(i)) * (R + 11),
        y = cy + Math.sin(angle(i)) * (R + 11);
      const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
      const short = String(p.knowledgePoint || "").slice(0, 7);
      return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="7.5" fill="#5b636d" text-anchor="${anchor}">${esc(short)}</text>`;
    })
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="知识点掌握度雷达图">${rings}${spokes}<polygon points="${shape}" fill="rgba(8,111,231,0.26)" stroke="#086fe7" stroke-width="1.4"/>${points.map((p, i) => `<circle cx="${(cx + Math.cos(angle(i)) * radius(p.mastery)).toFixed(1)}" cy="${(cy + Math.sin(angle(i)) * radius(p.mastery)).toFixed(1)}" r="2" fill="#086fe7"/>`).join("")}${labels}<text x="${cx}" y="${cy + 2}" font-size="7" fill="#98a1aa" text-anchor="middle">0</text><text x="${cx}" y="${(cy - R - 6).toFixed(1)}" font-size="7" fill="#98a1aa" text-anchor="middle">100</text></svg>`;
}

/** 实心饼图：占比数字画在扇形外侧并带指示线，图例放右侧（与页面版式一致）。 */
function pieSvg(slices, { size = 200 } = {}) {
  const total = slices.reduce((sum, x) => sum + Number(x.value || 0), 0);
  if (!total) return "";
  const colors = ["#3c8b76", "#6491bb", "#bf9239", "#bd565b", "#7a6bb5", "#c07f4f", "#89939c"];
  const r = size / 2 - 30,
    cx = size / 2,
    cy = size / 2;
  let angle = -Math.PI / 2;
  const shapes = slices
    .map((slice, index) => {
      const value = Number(slice.value || 0);
      const sweep = (value / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle),
        y1 = cy + r * Math.sin(angle);
      const next = angle + sweep;
      const x2 = cx + r * Math.cos(next),
        y2 = cy + r * Math.sin(next);
      const fill = slice.color || colors[index % colors.length];
      const path = `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${fill}" stroke="#ffffff" stroke-width="0.8"/>`;
      const mid = angle + sweep / 2;
      const lx = cx + (r + 9) * Math.cos(mid),
        ly = cy + (r + 9) * Math.sin(mid);
      const tx = cx + (r + 13) * Math.cos(mid),
        ty = cy + (r + 13) * Math.sin(mid);
      const anchor = Math.cos(mid) >= 0 ? "start" : "end";
      const label =
        sweep > 0.12
          ? `<polyline points="${(cx + r * Math.cos(mid)).toFixed(1)},${(cy + r * Math.sin(mid)).toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="#c9d2d9" stroke-width="0.8"/><text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}" font-size="8.5" fill="#5b636d" text-anchor="${anchor}">${Math.round((value / total) * 100)}%</text>`
          : "";
      angle = next;
      return path + label;
    })
    .join("");
  const legend = slices
    .map(
      (slice, index) =>
        `<li><i style="background:${slice.color || colors[index % colors.length]}"></i>${esc(slice.label)}<b>${esc(slice.value)}（${Math.round((Number(slice.value || 0) / total) * 100)}%）</b></li>`,
    )
    .join("");
  const aria = slices.map((x) => x.label).join("、");
  return `<div class="pie"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="占比饼图：${esc(aria)}">${shapes}</svg><ul class="legend">${legend}</ul></div>`;
}

function buildHtml(r) {
  const risk = { high: "重点关注", medium: "持续关注", low: "常规跟进" }[r.riskAssessment?.level] || "待评估";
  const metrics = [
    ["测验正确率", pct(r.quizAnalysis?.averageAccuracy)],
    ["平均掌握度", pct(r.masteryAnalysis?.averageMastery)],
    ["路径进度", pct(r.pathAnalysis?.progress)],
    ["测验提交", `${num(r.quizAnalysis?.attemptCount)} 次`],
    [
      "已掌握知识点",
      `${num(r.masteryAnalysis?.masteredCount)} / ${num(r.masteryAnalysis?.knowledgePointCount)}`,
    ],
    ["资源完成", `${num(r.resourceAnalysis?.completedCount)} / ${num(r.resourceAnalysis?.resourceCount)}`],
  ];
  const date = new Date(r.generatedAt || Date.now()).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  const stages = r.pathAnalysis?.stages || [];
  const knowledgePoints = r.knowledgePoints || [];
  const masteryTop = r.masteryAnalysis?.topMastery || [];
  const attempts = r.quizAnalysis?.recentAttempts || [];
  const distribution = r.quizAnalysis?.accuracyDistribution || [];
  const errorTypes = r.errorProfile?.typeBreakdown || [];
  const patterns = r.errorProfile?.topPatterns || [];
  const resourceRows = r.resourceAnalysis?.typeBreakdown || [];
  const radarPoints =
    knowledgePoints.length <= 8
      ? knowledgePoints
      : Array.from(
          { length: 8 },
          (_, i) => knowledgePoints[Math.round((i * (knowledgePoints.length - 1)) / 7)],
        );

  const stageTable = stages.length
    ? `<table><thead><tr><th style="width:38%">阶段</th><th style="width:28%">进度</th><th>完成状态</th></tr></thead><tbody>${stages.map((stage, index) => `<tr><td>${esc(stage.title || `阶段 ${index + 1}`)}</td><td>${esc(pct(stage.progress))}${bar(stage.progress)}</td><td>${esc(STAGE_STATUS[stage.status] || stage.status || "—")}<br><span class="muted">验收：${esc(COMPLETION_LABELS[stage.completionType] || "待配置")}${stage.durationMinutes ? ` · 建议 ${esc(stage.durationMinutes)} 分钟` : ""}</span></td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">该周期内没有可解析的学习路径快照。</p>`;
  const resourceTable = resourceRows.length
    ? `<table><thead><tr><th>资源类型</th><th style="width:30%">完成度</th><th>已完成 / 总数</th></tr></thead><tbody>${resourceRows.map((row) => `<tr><td>${esc(RESOURCE_LABELS[row.type] || row.type)}</td><td>${row.total ? Math.round((row.completed / row.total) * 100) : 0}%${bar(row.total ? (row.completed / row.total) * 100 : 0, "#3c8b76")}</td><td>${esc(row.completed)} / ${esc(row.total)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">该周期内没有资源学习记录。</p>`;
  const attemptTable = attempts.length
    ? `<table><thead><tr><th>科目</th><th>提交时间</th><th>答对 / 作答</th><th>正确率</th><th>得分</th></tr></thead><tbody>${attempts.map((a) => `<tr><td>${esc(a.subject || "—")}</td><td>${esc(a.submittedAt ? new Date(a.submittedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) : "—")}</td><td>${esc(a.correctCount)} / ${esc(a.totalCount)}</td><td>${esc(pct(a.accuracy))}</td><td>${esc(num(a.score))}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">该周期内没有测验提交记录。</p>`;
  const knowledgeTable = knowledgePoints.length
    ? `<table><thead><tr><th style="width:34%">知识点</th><th style="width:36%">掌握度</th><th>当前状态</th></tr></thead><tbody>${knowledgePoints.map((p) => `<tr><td>${esc(p.knowledgePoint)}</td><td>${esc(pct(p.mastery))}${bar(p.mastery)}</td><td>${p.mastery >= 80 ? "掌握良好" : p.mastery >= 60 ? "继续巩固" : "优先复习"}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">暂无知识点记录，建议先完成基础测验。</p>`;
  const patternTable = patterns.length
    ? `<table><thead><tr><th>错误类型</th><th>关联知识点</th><th>出现次数</th><th>置信度</th></tr></thead><tbody>${patterns.map((p) => `<tr><td>${esc(errorLabel(p.errorType))}</td><td>${esc(p.knowledgePoint)}</td><td>${esc(p.occurrenceCount)}</td><td>${p.confidence == null ? "—" : `${Math.round(Number(p.confidence) * 100)}%`}</td></tr>`).join("")}</tbody></table>`
    : "";
  const plan = r.actionPlan?.length
    ? r.actionPlan
        .map(
          (p) =>
            `<div class="plan"><span class="step">${esc(String(p.priority).padStart(2, "0"))}</span><div><h3>${esc(p.knowledgePoint)}${p.mastery == null ? "" : ` · 当前掌握度 ${esc(pct(p.mastery))}`}</h3><p>${esc(p.action)}</p><div class="target">${esc(p.target)} · ${esc(p.review)}</div></div></div>`,
        )
        .join("")
    : list("后续建议", r.recommendations);

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(r.student?.displayName || "学生")} · 学习评估报告</title><style>
 @page{size:A4;margin:15mm 14mm}*{box-sizing:border-box}body{font-family:"Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:10.5px;line-height:1.75;color:#252b33;background:#fff;margin:0}header{border-bottom:2px solid #086fe7;padding-bottom:12px}header small{font-size:9px;letter-spacing:2px;color:#086fe7}h1{font-size:22px;line-height:1.4;margin:8px 0;color:#242b35}h2{font-size:13px;color:#045fc9;margin:18px 0 8px;break-after:avoid}h3{margin:0;font-size:11.5px}h4{margin:12px 0 5px;font-size:11px;color:#045fc9}p{margin:6px 0}.muted{color:#68707a;font-size:9.5px}.meta{font-size:9.5px;color:#68707a}.risk{float:right;border:1px solid #bf9239;padding:4px 10px;color:#98691d;font-size:10px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:16px 0 8px}.metric{border-left:2px solid #086fe7;background:#f5f3ed;padding:8px 11px}.metric span{display:block;font-size:9px;color:#68707a}.metric strong{font-size:19px;color:#045fc9;font-family:Georgia,serif;font-variant-numeric:tabular-nums}.columns{display:grid;grid-template-columns:1fr 1fr;gap:20px}.charts{display:grid;grid-template-columns:260px 1fr;gap:16px;align-items:start}.charts.even{grid-template-columns:1fr 1fr}ul{padding-left:16px;margin:6px 0}table{width:100%;border-collapse:collapse;font-size:9.5px;margin:4px 0 8px}th,td{text-align:left;border-bottom:1px solid #e3e7ea;padding:6px 7px;vertical-align:top}th{background:#f5f3ed;color:#68707a;font-weight:600}thead{display:table-header-group}tr,.plan,section,.charts{break-inside:avoid}.track{height:5px;background:#e7e5dd;width:100%;margin-top:3px}.fill{height:5px;background:#086fe7}.plan{display:flex;gap:14px;padding:11px 0;border-bottom:1px solid #e3e7ea}.step{font-size:20px;color:#086fe7;font-family:Georgia,serif}.target{font-size:9.5px;color:#045fc9}.quality{background:#f5f3ed;padding:8px 14px;margin-top:16px;break-inside:avoid}.quality h2{margin-top:4px}.quality p{font-size:9.5px;color:#68707a}.pie{display:flex;gap:12px;align-items:center;justify-content:center}.legend{list-style:none;padding:0;margin:0;font-size:9.5px;color:#3a4148}.legend li{display:flex;align-items:center;gap:6px;margin:3px 0}.legend i{width:9px;height:9px;display:inline-block}.legend b{margin-left:auto;color:#242b35}.card{border:1px solid #e3e7ea;padding:10px 12px;break-inside:avoid}footer{border-top:1px solid #d9dde2;margin-top:16px;padding-top:8px;color:#68707a;font-size:9px}section>h2{break-after:avoid}
 </style></head><body>
 <header><small>智课研伴 / LEARNING ASSESSMENT</small><span class="risk">${esc(risk)}</span><h1>${esc(r.student?.displayName)} · 学习评估报告</h1><div class="meta">${esc(r.student?.className || "学习档案")} · 最近 ${esc(r.reportMeta?.rangeDays)} 天 · V${esc(r.reportMeta?.reportVersion || 1)}<br>生成时间：${esc(date)}</div></header>
 <section><h2>01 / 评估结论</h2><p>${esc(r.executiveSummary || "请结合下方指标和风险依据评估本阶段学习表现。")}</p></section>
 <div class="metrics">${metrics.map(([k, v]) => `<div class="metric"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
 <p class="meta">作答 ${esc(num(r.evidence?.answeredCount))} 题 · 答对 ${esc(num(r.evidence?.correctCount))} 题 · 待巩固 ${esc(num(r.masteryAnalysis?.developingCount))} 个知识点 · 薄弱 ${esc(num(r.masteryAnalysis?.weakCount))} 个 · 检索 ${esc(num(r.ragActivity?.retrievalCount))} 次 · 引用作答 ${esc(num(r.ragActivity?.citationAnswerCount))} 次</p>
 <section><h2>02 / 当前学习进度</h2><h4>学习路径阶段推进（${esc(r.pathAnalysis?.completedStageCount ?? 0)} / ${esc(stages.length || r.pathAnalysis?.stageCount || 0)} 阶段已完成，整体 ${esc(pct(r.pathAnalysis?.progress))}）</h4>${stageTable}<h4>资源学习完成情况</h4>${resourceTable}<p class="muted">画像版本 V${esc(r.profileAnalysis?.currentVersion ?? "—")}（历史 ${esc(num(r.profileAnalysis?.historyCount))} 版）· 路径版本 V${esc(r.pathAnalysis?.currentVersion ?? "—")}</p></section>
 <section><h2>03 / 作答情况</h2><div class="charts even"><div class="card"><h4>测验正确率分布</h4>${
   distribution.some((d) => d.count)
     ? pieSvg(
         distribution
           .filter((d) => d.count)
           .map((d, i) => ({
             label: d.label,
             value: d.count,
             color: ["#3c8b76", "#6491bb", "#bf9239", "#bd565b"][i % 4],
           })),
         { centerLabel: `${distribution.reduce((s, d) => s + Number(d.count || 0), 0)} 次` },
       ) + '<p class="muted">按每次提交的答对题数 / 作答题数归入区间。</p>'
     : '<p class="muted">该周期内没有测验提交记录。</p>'
 }</div><div class="card"><h4>最近 ${esc(num(attempts.length))} 次测验正确率</h4>${
   attempts.length
     ? `<table><thead><tr><th>次序</th><th>科目</th><th style="width:38%">正确率</th><th>答对 / 作答</th></tr></thead><tbody>${[
         ...attempts,
       ]
         .reverse()
         .map(
           (a, i) =>
             `<tr><td>第 ${i + 1} 次</td><td>${esc(a.subject || "—")}</td><td>${esc(pct(a.accuracy))}${bar(a.accuracy)}</td><td>${esc(a.correctCount)} / ${esc(a.totalCount)}</td></tr>`,
         )
         .join("")}</tbody></table>`
     : '<p class="muted">该周期内没有测验提交记录。</p>'
 }</div></div><h4>最近测验明细</h4>${attemptTable}</section>
 <section><h2>04 / 知识点掌握程度</h2><div class="charts"><div class="card"><h4>掌握度雷达</h4>${radarSvg(radarPoints) || '<p class="muted">知识点记录不足 3 个，暂不能绘制雷达图。</p>'}<p class="muted">外圈代表掌握度 100%，中心为 0%。</p></div><div class="card"><h4>优势知识点（掌握度前 8）</h4>${masteryTop.length ? `<table><thead><tr><th>知识点</th><th style="width:30%">掌握度</th><th>练习 / 错题</th></tr></thead><tbody>${masteryTop.map((p) => `<tr><td>${esc(p.knowledgePoint)}</td><td>${esc(pct(p.mastery))}${bar(p.mastery)}</td><td>${esc(num(p.practiceCount))} / ${esc(num(p.wrongCount))}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">暂无达到优势标准的知识点记录。</p>'}</div></div><h4>全部知识点掌握度（由低到高）</h4>${knowledgeTable}</section>
 <section><h2>05 / 薄弱点与错因分析</h2><div class="charts even"><div class="card">${list("待突破知识点", r.weaknesses, "本周期没有掌握度低于 60% 的知识点，可转向下一阶段难度。")}<p class="muted">薄弱 ${esc(num(r.masteryAnalysis?.weakCount))} 个 · 待巩固 ${esc(num(r.masteryAnalysis?.developingCount))} 个 · 已掌握 ${esc(num(r.masteryAnalysis?.masteredCount))} 个</p></div><div class="card"><h4>错误类型分布</h4>${
   errorTypes.length
     ? `${pieSvg(
         errorTypes.map((t) => ({ label: errorLabel(t.errorType), value: t.occurrenceCount })),
         { centerLabel: `${errorTypes.reduce((s, t) => s + Number(t.occurrenceCount || 0), 0)} 次` },
       )}<p class="muted">共 ${esc(num(r.errorProfile?.patternCount))} 个错误模式，占比最高的类型应优先讲评。</p>`
     : '<p class="muted">暂无错因聚合记录。</p>'
 }</div></div>${patternTable}</section>
 <section><h2>06 / 推荐复习与学习规划</h2>${plan}${r.recommendations?.length && r.actionPlan?.length ? `<h4>系统补充建议</h4><ul>${r.recommendations.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<div class="columns">${list("周期内学习优势", r.progressHighlights, "暂无达到 80% 的优势知识点记录。")}${list("风险依据", r.riskAssessment?.reasons, "未记录额外风险依据，请结合数据覆盖情况判断。")}</div></section>
 <div class="quality"><h2>07 / 数据范围与评估说明</h2><p>${esc(r.dataQuality?.note || "本报告依据生成时的数据快照展示，缺失数据不会被推测或补造。")}</p>${(r.dataQuality?.gaps || []).map((g) => `<p>· ${esc(g)}</p>`).join("")}<p>数据来源：${esc((r.dataSources || []).join(" · ") || "历史报告未记录来源清单")}</p></div>
 <footer>本报告由智课研伴在生成时刻的数据快照上产出，仅用于教学跟进；掌握度、路径进度与风险为生成时的最新状态。报告编号 #${esc(r.id || r.reportMeta?.reportId || "—")} · 校验信息见平台报告档案。</footer>
 </body></html>`;
}
module.exports = { buildHtml };
