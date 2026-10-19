/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/* 今日签运
   ---------------------------------------------------------------------------
   按「学生姓名 + 当天日期」确定性生成：同一天刷新多少次都是同一签，第二天自动换签。
   不依赖后端，也不需要随机数落库。 */

export interface FortuneEntry {
  title: string;
  note: string;
}

export interface FortuneLevel {
  name: string;
  motto: string;
  /** 签的吉凶：吉 → 卡片走朱红，凶 → 卡片走品牌蓝 */
  tone: "lucky" | "ominous";
}

export interface DailyFortune {
  level: FortuneLevel;
  good: FortuneEntry[];
  bad: FortuneEntry[];
}

const LEVELS: FortuneLevel[] = [
  { name: "大吉", motto: "今天适合攻坚，难题会被你一行行拆开。", tone: "lucky" },
  { name: "中吉", motto: "稳扎稳打，进度会自己长出来。", tone: "lucky" },
  { name: "小吉", motto: "小步快跑，今天适合把尾巴收干净。", tone: "lucky" },
  { name: "吉", motto: "平常心的一天，正好补一补基础。", tone: "lucky" },
  { name: "末吉", motto: "慢一点，先想清楚再动手。", tone: "lucky" },
  { name: "小凶", motto: "今天不适合硬碰，先复习再上手。", tone: "ominous" },
  { name: "凶", motto: "状态一般，挑最简单的题保持手感。", tone: "ominous" },
];

/* 吉签占多数，凶签偶尔出现，避免天天唱衰 */
const LEVEL_WEIGHTS: Record<string, number> = {
  大吉: 1,
  中吉: 2,
  小吉: 3,
  吉: 3,
  末吉: 3,
  小凶: 1,
  凶: 1,
};

function weightedLevels(): FortuneLevel[] {
  const pool: FortuneLevel[] = [];
  LEVELS.forEach((level) => {
    const weight = LEVEL_WEIGHTS[level.name] ?? 1;
    for (let index = 0; index < weight; index += 1) pool.push(level);
  });
  return pool;
}

const GOOD: FortuneEntry[] = [
  { title: "写题解", note: "把思路写下来，才算真的会了" },
  { title: "刷两道题", note: "手感是练出来的" },
  { title: "看网课", note: "躺平也能学到东西的一天" },
  { title: "啃源码", note: "理解比记忆活得久" },
  { title: "画思维导图", note: "结构一画就清楚" },
  { title: "复习错题", note: "错因比答案值钱" },
  { title: "早睡", note: "明天的效率也算今天的收益" },
  { title: "敲一遍实验", note: "手比眼睛记得牢" },
  { title: "问 AI 助教", note: "好问题等于半个答案" },
  { title: "整理笔记", note: "知识会自己排队" },
  { title: "单步调试", note: "慢一点，反而更快" },
  { title: "读官方文档", note: "第一手资料不会骗你" },
];

const BAD: FortuneEntry[] = [
  { title: "抢最优解", note: "越卡常越慢" },
  { title: "复制粘贴", note: "编译器不会替你理解" },
  { title: "死记硬背", note: "换个问法就废" },
  { title: "熬夜刷题", note: "效率递减，错误递增" },
  { title: "只看不写", note: "眼睛会了，手不会" },
  { title: "忽略边界", note: "空输入一直在等你" },
  { title: "一次写几百行", note: "五分钟后自己都不认识" },
  { title: "同时开十道题", note: "专注是稀缺资源" },
  { title: "跳过样例", note: "样例是免费的提示" },
  { title: "硬凑答案", note: "侥幸通过的总要还" },
  { title: "在截止前一小时开工", note: "服务器不会等你" },
  { title: "把报错当噪音", note: "它说的通常是对的" },
];

export function fortuneDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** FNV-1a：把任意字符串摊成一个 32 位种子 */
function seedOf(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 线性同余，够用且完全可复现（不用 Math.random，避免每次渲染都换签） */
function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<T>(pool: T[], count: number, next: () => number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  while (picked.length < count && remaining.length > 0) {
    const index = Math.floor(next() * remaining.length);
    const [item] = remaining.splice(index, 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}

export function dailyFortune(studentName: string, dateKey: string): DailyFortune {
  const next = createRandom(seedOf(`${studentName}|${dateKey}`));
  const pool = weightedLevels();
  const level = pool[Math.floor(next() * pool.length)] ?? {
    name: "吉",
    motto: "平常心的一天，正好补一补基础。",
    tone: "lucky" as const,
  };
  return {
    level,
    good: pick(GOOD, 2, next),
    bad: pick(BAD, 2, next),
  };
}
