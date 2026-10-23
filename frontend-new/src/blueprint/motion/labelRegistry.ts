import type { LabelLevel, CarrierShape } from "./Motion";

export type LabelRule = {
  family: string; selector: string; level: LabelLevel; carrier: CarrierShape;
  behavior: "persist" | "reveal"; group: boolean;
};

// One registry for source classification, runtime checks and the L3 audit.
export const labelRules: LabelRule[] = [
  {
    "family": "F15",
    "selector": ".bp-page small, .bp-page time, .bp-page header > b",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".bp-page header > span, .bp-page header > div > span, .bp-page header > strong",
    "level": "B",
    "carrier": "rail",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F10",
    "selector": ".mw-brand > div > span, .mw-course > span, .mw-course strong, .mw-message-body > header > strong",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F01",
    "selector": ".bp-class-strip__chip > b, .bp-class-strip__label",
    "level": "A",
    "carrier": "plate",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F01",
    "selector": ".bp-class-strip__chip > i, .bp-class-strip__people > em, .bp-class-strip__empty",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F02",
    "selector": ".bp-arrow-chip",
    "level": "B",
    "carrier": "ring",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F03",
    "selector": ".mg-kicker-word, .bp-resource-eyebrow",
    "level": "A",
    "carrier": "plate",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F03",
    "selector": ".bp-kicker, .bp-quiz-setup__kicker",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": true
  },
  {
    "family": "F03",
    "selector": ".bp-kicker > span, .bp-resource-hero__copy > span",
    "level": "B",
    "carrier": "rail",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F04",
    "selector": ".bp-homework-state, .bp-class-list__state, .bp-model-state, .lm-quiz-status-row, .lm-async-state, .lm-errors-state, .bp-resource-status",
    "level": "A",
    "carrier": "plate",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F05",
    "selector": ".bp-quiz-count-row__total, .bp-course-progress, .bp-progress, .bp-rank-progress, .bp-quiz-actions__progress",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": true
  },
  {
    "family": "F05",
    "selector": ".bp-course-progress > strong, .bp-course-progress > span, .bp-course-progress b, .bp-student-basics button > strong, .bp-quiz-status > div > span, .bp-question-sheet__bar em",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F05",
    "selector": ".bp-ring-stat > strong, .bp-report-summary > div > strong",
    "level": "A",
    "carrier": "disc",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F06",
    "selector": ".bp-donut-legend, .bp-quiz-sheet-legend, .lm-knowledge-graph-legend",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": true
  },
  {
    "family": "F06",
    "selector": ".bp-donut-legend li > span, .bp-donut-legend li > b, .bp-quiz-sheet-legend > span, .lm-knowledge-graph-legend__item",
    "level": "B",
    "carrier": "tab",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F07",
    "selector": ".bp-radar-label, .bp-radar-value, .bp-bar-label, .bp-bar-value, .bp-chart-date, .bp-donut-caption, .bp-donut-total, .bp-report-chart text, .bp-mistake-labels > span, .bp-report-bar > span",
    "level": "B",
    "carrier": "tab",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F07",
    "selector": ".bp-ring-stat > span, .bp-report-summary > div > span, .bp-report-summary small, .bp-assessment-caption > span, .bp-answer-grid button > b, .bp-answer-grid button > span:first-child, .bp-quiz-score small",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F08",
    "selector": ".bp-nav__roman",
    "level": "C",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F09",
    "selector": ".bp-side-hud__code, .bp-side-hud__caption, .bp-side-hud__mono, .bp-side-hud__label",
    "level": "C",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F10",
    "selector": ".bp-page-header__meta",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": true
  },
  {
    "family": "F10",
    "selector": ".bp-page-header__title > span, .bp-page-header__meta time, .bp-page-header__meta > span, .bp-page-header__meta b",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F11",
    "selector": ".bp-account-chip",
    "level": "B",
    "carrier": "tab",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F12",
    "selector": ".bp-quiz-hint, .bp-quiz-setup__tip, .lm-chat-composer__meta, .mw-input-hint, .lm-profile-composer__meta, .lm-codelab-meta",
    "level": "B",
    "carrier": "tab",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F12",
    "selector": ".bp-setting-row > div:first-child > small, .bp-model-state > small, .bp-settings-title > small, .bp-local-knowledge__counts > span, .lm-knowledge-graph-note, .lm-knowledge-graph-panel__hint",
    "level": "B",
    "carrier": "rail",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F13",
    "selector": ".lm-chat-evidence__label, .lm-knowledge-chip, .lm-knowledge-cross-summary__chips, .mw-citation > strong, .mw-bubble > footer > button",
    "level": "B",
    "carrier": "tab",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F14",
    "selector": ".bp-path-step > strong, .bp-stage-detail > header h3",
    "level": "A",
    "carrier": "plate",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F14",
    "selector": ".bp-path-step > span:not(.bp-step-sheen), .bp-stage-journey small, .bp-stage-detail__lines span, .bp-stage-detail > header small, .bp-path-footer > div > span, .bp-path-footer small",
    "level": "B",
    "carrier": "rail",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F14",
    "selector": ".bp-stage-connector",
    "level": "C",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".bp-action-strip > header > strong, .bp-student-basics > header > strong, .bp-assessment-caption strong, .bp-question-sheet__bar > b, .bp-quiz-card h3, .bp-insight > header > strong, .mw-side-heading > strong, .lm-chat-section-heading, .lm-chat-answer__mode, .bp-settings-group[data-mg-group=\"01\"] > header h3, .bp-knowledge-canvas > header > div > strong",
    "level": "A",
    "carrier": "plate",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".bp-action-strip > header > span, .bp-student-basics > header > span, .bp-student-basics button small, .bp-action-strip button > b, .bp-insight > header > span, .bp-settings-group > header > span, .bp-setting-row > div:first-child > strong, .bp-settings-group:not([data-mg-group=\"01\"]) > header h3, .mw-duration, .mw-thread-intro, .mw-side-heading > span, .mw-side-heading > small, .mw-session time, .mw-message-body > header > time, .mw-citation small, .bp-knowledge-stats article strong, .bp-knowledge-stats article b, .bp-knowledge-stats article span, .bp-knowledge-stats article small, .bp-ranking-row.is-head > span, .bp-ranking-summary small, .bp-ranking-row:not(.is-head) > span:nth-child(n+3), .bp-ranking-row > span:nth-child(2) > strong",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".bp-ranking-summary > div > span > strong",
    "level": "A",
    "carrier": "disc",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".bp-ranking-row:nth-child(-n+4):not(.is-head) > span:nth-child(2) > strong",
    "level": "A",
    "carrier": "plate",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".bp-rank-medal",
    "level": "A",
    "carrier": "disc",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F16",
    "selector": ".bp-sidebar__footer > p, .bp-ranking-footer > p, .bp-ranking-footer > span, .bp-settings-footer, .bp-version",
    "level": "C",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".mw-thread-intro",
    "level": "A",
    "carrier": "plate",
    "behavior": "reveal",
    "group": false
  },
  {
    "family": "F16",
    "selector": ".bp-settings-actions > span, .bp-settings-sheet > footer > span",
    "level": "C",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F15",
    "selector": ".bp-knowledge-intro h2",
    "level": "A",
    "carrier": "plate",
    "behavior": "persist",
    "group": false
  },
  {
    "family": "F05",
    "selector": ".bp-path-footer > div > span, .bp-path-footer small",
    "level": "B",
    "carrier": "rail",
    "behavior": "persist",
    "group": false
  }
];

export const orientationMatrix = {
  plate: { rx: 11, ry: -4, rz: -1, z: 0 },
  disc: { rx: 6, ry: 0, rz: 0, z: 0 },
  tab: { rx: 0, ry: 0, rz: 0, z: 0 },
  rail: { rx: 0, ry: 0, rz: 0, z: 0 },
} as const;
