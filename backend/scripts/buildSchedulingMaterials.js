/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
/**
 * 生成「操作系统 · 处理机调度」的课件与思维导图（本地交付版，不写数据库）。
 *
 *   node scripts/buildSchedulingMaterials.js [--out="D:\...\处理机调度演示"]
 *
 * 产出三份文件到 out 目录：
 *   1) 处理机调度-课件.pptx        —— 与平台在线生成同一条渲染链路（pptxService.generatePptx）
 *   2) 处理机调度-PPTist.json      —— 可直接导入本地 PPTist 继续编辑
 *   3) 处理机调度-思维导图.json    —— 可直接导入本地「思绪思维导图」
 *
 * 内容依据平台知识库真实讲义片段（处理机调度三级调度、评价指标、FCFS/SJF/HRRN/RR/优先级/多级反馈队列、
 * 实时调度 EDF/LLF/RMS 等），每个结点都带知识点出处，便于逐条核对。
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { generatePptx } = require("../src/services/pptxService");
const { buildDeck: buildPptistDeck } = require("../src/services/pptistExportService");
const { buildMindMap: buildMindMapJson } = require("../src/services/mindMapExportService");

const SUBJECT = "操作系统";
const KNOWLEDGE_POINT = "处理机调度";
const DECK_TITLE = "操作系统 · 处理机调度 · 教学课件";
const MIND_MAP_TITLE = "操作系统 · 处理机调度 · 知识导图";

/* ------------------------------------------------------------------ *
 * 一、课件内容
 * ------------------------------------------------------------------ */
function buildDeckContent() {
  const slides = [
    {
      slideType: "cover",
      title: "操作系统 · 处理机调度",
      subtitle:
        "三级调度 · 评价指标 · FCFS / SJF / HRRN / RR / 优先级 / 多级反馈队列 —— 操作系统核心考点精讲",
      // 封面不渲染 bullets，但封面右侧的「本次学习画像」会按顺序取这三行（先匹配到的优先），
      // 所以它们必须放在最前面并分别带上「掌握度 / 偏好 / 薄弱点」字样。
      bullets: [
        "掌握度：操作系统 62%，数据结构 56%",
        "学习偏好：偏好先看结论再看推导，配合算例巩固",
        "薄弱点：易错在多级反馈队列的队列流转与抢占点判断",
      ],
    },
    {
      slideType: "objectives",
      title: "本讲学习目标",
      bullets: [
        "三级调度：说清高级、中级、低级调度各自解决什么问题、频率与适用系统",
        "调度时机：列全「必须调度」与「不能调度」的情形，理解为什么要置调度标志",
        "抢占与否：区分抢占式与非抢占式，说明各自的硬件与同步代价",
        "评价指标：写出周转时间、带权周转时间、等待时间、响应时间的定义并正确代入计算",
        "算法主线：掌握 FCFS、SJF/SPF、SRTN、HRRN、RR、优先级、多级队列、多级反馈队列的思想与优缺点",
        "计算与比较：会画甘特图、算平均周转与平均带权周转，能判断算法的适用场景与饥饿风险",
      ],
    },
    {
      slideType: "concept",
      title: "1.1 为什么需要处理机调度",
      body: "处理机是计算机中最宝贵的资源。在多道程序环境下，进程数量往往多于处理机数量，进程之间还要竞争处理机，因此操作系统必须按某种算法动态地把处理机分配给就绪队列中的某个进程——这就是处理机调度。它解决三个问题：谁获得处理机、获得多久、什么时候换人。",
      bullets: [
        "提高资源利用率：让 CPU 与 I/O 设备尽可能并行工作，减少 CPU 空闲等待",
        "提高系统吞吐量：单位时间内完成更多作业，缩短作业周转时间",
        "保证公平与响应：交互用户获得及时响应，实时任务满足截止时间",
        "抽象 CPU：让每个进程都以为自己独占处理机（虚拟处理机）",
        "两个角色要分清：调度器（scheduler）按算法「选谁」，分派器（dispatcher）执行「换谁」",
      ],
    },
    {
      slideType: "process",
      title: "1.2 三级调度：高级 / 中级 / 低级",
      steps: [
        {
          title: "高级调度（作业调度、长程调度）",
          description:
            "决定把外存后备队列中的哪些作业调入内存、为其创建进程并分配资源；只存在于批处理系统，调入频率最低，决定多道程序度。",
        },
        {
          title: "中级调度（内存调度、中程调度）",
          description:
            "决定把内存中暂时不能运行的进程换出（挂起）到外存，或把具备运行条件的挂起进程重新调入内存，目的是提高内存利用率与系统吞吐量。",
        },
        {
          title: "低级调度（进程调度、短程调度）",
          description:
            "从就绪队列中按某种算法选出一个进程并分配处理机；三种调度中最频繁、最核心的一级，任何操作系统都必须具备。",
        },
        {
          title: "三者关系与频率",
          description:
            "高级调度把作业变为进程，中级调度在内存与外存之间倒腾进程，低级调度决定当前谁上 CPU。频率：低级 > 中级 > 高级；分时与实时系统通常没有高级调度。",
        },
        {
          title: "易错口径",
          description:
            "三级调度都属「处理机调度」的研究范围，但只有低级调度直接分配 CPU；中级调度只改变进程的内存驻留状态。",
        },
      ],
    },
    {
      slideType: "comparison",
      title: "1.3 抢占方式与非抢占方式",
      left: {
        title: "非抢占（非剥夺）",
        items: [
          "进程一旦获得处理机就一直运行，直到完成或主动阻塞",
          "实现简单、系统开销小，不需要额外硬件支持",
          "难以满足实时任务的紧急需求，交互响应差",
          "长作业容易长时间垄断处理机",
          "典型算法：FCFS、非抢占式 SJF、非抢占式优先级",
        ],
      },
      right: {
        title: "抢占（剥夺）",
        items: [
          "允许调度程序按某种原则剥夺当前进程的处理机",
          "三条抢占原则：优先级原则、短进程优先原则、时间片原则",
          "响应及时，能防止长进程长期垄断处理机",
          "切换频繁会增加开销，对共享数据需要更严格的同步保护",
          "典型算法：SRTN、RR、抢占式优先级、多级反馈队列",
        ],
      },
      body: "抢占一定发生在「有更强理由让别人上 CPU」的时刻；非抢占只在当前进程自己让出（完成、阻塞）时才换人。",
    },
    {
      slideType: "process",
      title: "1.4 处理机调度的时机（什么时候可以换人）",
      steps: [
        {
          title: "必须重新调度",
          description:
            "正在运行的进程执行完毕或异常终止；进程因请求 I/O、申请资源或等待事件而主动放弃处理机；时间片用完；有更高优先级的进程进入就绪队列。",
        },
        {
          title: "中断处理结束返回时",
          description: "中断处理程序执行完返回用户态前，可能需要重新选择进程，例如时钟中断导致时间片耗尽。",
        },
        {
          title: "不能调度的三种情形",
          description:
            "① 在处理中断的过程中；② 进程处于操作系统内核临界区中；③ 在原子操作过程中。强行调度可能破坏内核数据结构的一致性。",
        },
        {
          title: "正确做法：置调度标志",
          description:
            "在不可调度的时刻只设置「需要调度」标志位，等退出临界区、中断处理完成后再统一触发调度。",
        },
        {
          title: "与进程状态转换的对应",
          description:
            "就绪 → 运行由调度完成；运行 → 就绪是时间片到或被抢占；运行 → 阻塞是进程主动行为，阻塞 → 就绪由外部事件触发，阻塞态不能直接变运行态。",
        },
      ],
    },
    {
      slideType: "concept",
      title: "2.1 六项评价指标（定义要背准）",
      body: "评价一个调度算法好不好，不能只看「谁先跑」，要看一组量化指标。计算题几乎全部围绕这些定义展开，口径写错会连环失分。",
      bullets: [
        "CPU 利用率 = 处理机忙碌时间 / 总时间，应尽可能高",
        "系统吞吐量 = 单位时间内完成的作业数量，受调度策略影响明显",
        "周转时间 = 完成时间 − 提交（到达）时间 = 等待时间 + 运行时间",
        "带权周转时间 = 周转时间 / 实际运行时间，恒 ≥ 1，越接近 1 说明等待越少",
        "等待时间 = 进程在就绪队列中等待处理机的时间之和（不含 I/O 等待）",
        "响应时间 = 从提交请求到系统首次产生响应的时间，是分时系统的关键指标",
      ],
      citations: ["[1]"],
    },
    {
      slideType: "concept",
      title: "2.2 响应比：FCFS 与 SJF 的折中",
      body: "响应比高者优先算法（HRRN）在每个作业调度时计算后备队列中作业的响应比，取最大值投入运行。它同时看「等了多久」和「还要跑多久」，因此既照顾短作业又不饿死长作业。",
      bullets: [
        "定义：R =（等待时间 + 要求服务时间）/ 要求服务时间 = 周转时间 / 要求服务时间",
        "等待时间越长 R 越大 → 体现先来先服务",
        "要求服务时间越短 R 越大 → 体现短作业优先",
        "非抢占算法：只在当前作业完成或阻塞后才重新计算响应比",
        "代价：需要频繁计算响应比，且仍要求预知服务时间",
      ],
      citations: ["[1]"],
    },
    {
      slideType: "comparison",
      title: "3.1 FCFS 与 SJF / SRTN",
      left: {
        title: "FCFS 先来先服务",
        items: [
          "按到达先后顺序调度，最简单，非抢占",
          "优点：公平、实现简单、不会导致饥饿",
          "缺点：长作业先到会让短作业长时间等待，带权周转时间可能很大",
          "对 CPU 繁忙型作业有利，对 I/O 繁忙型作业不利",
          "平均周转时间往往不是最优；常与短进程优先结合使用",
        ],
      },
      right: {
        title: "SJF / SPF / SRTN",
        items: [
          "短作业（短进程）优先，选运行时间最短者投入运行",
          "作业同时到达时可证明平均等待时间与平均周转时间最小",
          "必须预知运行时间（实际只能估计）",
          "长作业可能长期得不到调度（饥饿）",
          "SRTN 是抢占式版本：新到进程剩余时间更短时立刻抢占",
        ],
      },
      body: "同一组作业同时到达时：SJF 的平均周转时间一定不劣于 FCFS，但代价是必须知道（或估计）运行时间。",
    },
    {
      slideType: "concept",
      title: "3.2 RR 时间片轮转：时间片大小是关键",
      body: "RR 专为分时系统设计：就绪队列按 FCFS 排队，每次把处理机交给队首进程并令其运行一个时间片，时间片用完由时钟中断把该进程送到队尾，再取新队首运行。它保证每个用户在一段可接受的时间内都能得到响应。",
      bullets: [
        "时间片过小：进程切换过于频繁，切换开销占比上升，实际算力下降",
        "时间片过大：RR 退化为 FCFS，响应时间无法保证",
        "经验取值：略大于一次典型交互所需时间，通常 10 ~ 100 ms",
        "示例：P1、P2、P3 同时到达，运行时间 5、4、2，时间片取 2 时完成时刻为 12、10、6，平均周转约 9.33（FCFS 为 8.33），但 RR 的响应时间明显更好",
        "三类调度受益者：分时交互型进程最受益，纯计算型进程切换开销相对更大",
      ],
      citations: ["[1]"],
    },
    {
      slideType: "concept",
      title: "3.3 优先级调度：灵活但要防饥饿",
      body: "为每个作业或进程设置优先级，调度时选择优先级最高者运行。新到的更高优先级进程是否抢占当前进程，取决于算法是抢占式还是非抢占式。",
      bullets: [
        "静态优先级：创建时确定、运行期间不变，实现简单但不够灵活",
        "动态优先级：随进程推进变化，例如等待时间越长优先级越高，可防止饥饿",
        "常见优先关系：系统进程 > 用户进程；交互型 > 批处理型；I/O 繁忙型 > CPU 繁忙型",
        "饥饿问题：低优先级进程可能长期得不到处理机，用「老化（aging）」逐步提升其优先级",
        "优先级 + 时间片：同一优先级内部可用 RR，兼顾响应与公平",
      ],
      citations: ["[1]"],
    },
    {
      slideType: "comparison",
      title: "3.4 多级队列与多级反馈队列",
      left: {
        title: "多级队列",
        items: [
          "就绪队列按用途划分成多个独立队列（系统 / 交互 / 批处理）",
          "各队列可设不同优先级与不同算法（交互用 RR、批处理用 FCFS）",
          "队列之间可固定优先级，也可按比例分配处理机时间",
          "进程创建时被固定分配到某个队列，一般不允许移动",
          "缺点：进程难以适应自身行为变化（I/O 型变计算型时吃亏）",
        ],
      },
      right: {
        title: "多级反馈队列",
        items: [
          "多个优先级递减的队列，优先级越低时间片成倍增大",
          "新进程进入最高优先级队列末尾",
          "用完时间片仍未完成则降到下一级队列末尾",
          "只有高优先级队列为空时才调度低优先级队列",
          "被 I/O 阻塞后返回的进程回到较高（通常最初）队列，因此兼顾 I/O 繁忙型进程",
        ],
      },
      body: "多级反馈队列综合了短进程优先与轮转的优点，是通用操作系统中最常用的调度算法。",
    },
    {
      slideType: "concept",
      title: "4.1 实时调度：让截止时间一定能满足",
      body: "实时系统里「正确」不只是结果正确，还包括在规定时刻前完成。实时调度按任务是否周期性分为时钟驱动与非时钟驱动，常见三类算法各有可调度条件。",
      bullets: [
        "EDF 最早截止时间优先：动态选择截止时间最早的任务，抢占式下是单处理机最优，利用率理论上可达 100%",
        "LLF 最低松弛度优先：松弛度 = 必须完成时刻 − 还需运行时间 − 当前时刻，取松弛度最小者运行",
        "RMS 速率单调调度：周期越短优先级越高，属静态优先级，周期性任务下固定优先级中是最优的",
        "RMS 可调度条件：总利用率不超过 n(2^(1/n) − 1)，n 为任务数（n → ∞ 时约为 0.693）",
        "对比要点：EDF 动态优先级、利用率高；RMS 静态优先级、实现简单、可预测性强",
      ],
      citations: ["[1]"],
    },
    {
      slideType: "example",
      title: "5.1 综合计算题：FCFS 与 SJF 到底差多少",
      body: "四个作业 P1~P4 都在 0 时刻到达，运行时间分别为 7、4、1、4。请分别按 FCFS 与 SJF 画出执行顺序、完成时刻，并计算平均周转时间与平均带权周转时间。",
      steps: [
        {
          title: "第一步：写清已知与公式",
          description:
            "到达时间都为 0，所以周转时间 = 完成时刻；带权周转时间 = 周转时间 / 运行时间。平均值为各项之和除以作业数。",
        },
        {
          title: "第二步：FCFS 按到达（P1→P2→P3→P4）",
          description:
            "完成时刻依次 7、11、12、16；周转时间 7、11、12、16；平均周转时间 = (7+11+12+16)/4 = 11.5。",
        },
        {
          title: "第三步：FCFS 的带权周转",
          description:
            "带权周转 = 7/7、11/4、12/1、16/4 = 1、2.75、12、4，合计 19.75，平均约 4.938——短作业被长作业挡住，带权值被拉得很大。",
        },
        {
          title: "第四步：SJF 按运行时间（P3→P2→P4→P1）",
          description:
            "完成时刻 1、5、9、16；周转时间 1、5、9、16；平均周转时间 = 31/4 = 7.75，明显优于 FCFS 的 11.5。",
        },
        {
          title: "第五步：SJF 的带权周转",
          description: "带权周转 = 1/1、5/4、9/4、16/7 ≈ 1、1.25、2.25、2.286，合计约 6.786，平均约 1.696。",
        },
      ],
      explanation:
        "结论：作业同时到达时 SJF 的平均周转时间与平均等待时间都最小；但 SJF 需要预知运行时间且可能饿死长作业，因此实际系统常用 HRRN 或多级反馈队列做折中。",
      citations: ["[1]"],
    },
    {
      slideType: "code",
      title: "5.2 用程序验证两种算法的平均周转时间",
      language: "c",
      code: [
        "/* 计算 FCFS 与 SJF 的平均周转时间与平均带权周转时间",
        " * 四个作业均在 0 时刻到达，运行时间分别为 7、4、1、4 */",
        "#include <stdio.h>",
        "",
        "#define N 4",
        "static int burst[N] = {7, 4, 1, 4};",
        "",
        "static void report(const char *name, const int order[]) {",
        "    int t = 0, sum_turn = 0;",
        "    double sum_w = 0.0;",
        '    printf("%s: ", name);',
        "    for (int i = 0; i < N; i++) {",
        "        int p = order[i];",
        "        t += burst[p];                 /* 完成时刻 = 前面作业运行时间之和 */",
        "        int turn = t;                  /* 周转时间 = 完成时刻 − 到达时刻(0) */",
        "        sum_turn += turn;",
        "        sum_w += (double)turn / burst[p];   /* 带权周转时间 = 周转 / 运行 */",
        '        printf("P%d(完成%d,周转%d) ", p + 1, t, turn);',
        "    }",
        '    printf("| 平均周转=%.2f 平均带权=%.3f\\n", (double)sum_turn / N, sum_w / N);',
        "}",
        "",
        "int main(void) {",
        "    const int fcfs[N] = {0, 1, 2, 3};   /* P1 P2 P3 P4 */",
        "    const int sjf[N] = {2, 1, 3, 0};    /* P3 P2 P4 P1 */",
        '    report("FCFS", fcfs);',
        '    report("SJF ", sjf);',
        "    return 0;",
        "}",
      ].join("\n"),
      explanation:
        "程序把两个关键公式直接写成代码：完成时刻累加运行时间，周转时间等于完成时刻减到达时刻（本例到达为 0），带权周转时间等于周转时间除以运行时间。运行结果会打印 FCFS 平均周转 11.50、平均带权 4.938，以及 SJF 平均周转 7.75、平均带权约 1.696，与手算完全一致——这也是检查自己算错没有的最快办法。",
      citations: ["[1]"],
    },
    {
      slideType: "quiz",
      title: "阶段自测（一）",
      body: "某分时系统采用时间片轮转调度，时间片取 100 ms。若把时间片改为 10 ms，系统会最先出现什么变化？",
      bullets: [
        "A. 上下文切换次数明显增加，切换开销占比上升",
        "B. RR 退化为 FCFS，响应时间变差",
        "C. 平均周转时间一定变小",
        "D. 长作业被饿死的风险显著上升",
      ],
      explanation:
        "时间片过小会让切换过于频繁、开销占比上升；时间片过大会退化成 FCFS。RR 本身不会饿死进程，也不能保证平均周转时间最优。",
      questionIds: [],
    },
    {
      slideType: "quiz",
      title: "阶段自测（二）",
      body: "下列哪种情形「不能」立即进行进程调度？",
      bullets: [
        "A. 时间片用完",
        "B. 正在处理中断的过程中",
        "C. 运行进程请求 I/O 而阻塞",
        "D. 有更高优先级进程进入就绪队列",
      ],
      explanation:
        "中断处理过程、内核临界区、原子操作中都不允许调度，否则可能破坏内核数据结构一致性，应先置调度标志，退出后再调度。",
      questionIds: [],
    },
    {
      slideType: "answers",
      title: "自测参考答案与要点",
      body: "两题的正确选项与判断依据如下。自测的目的是暴露「口径错误」，不是记结论。",
      bullets: [
        "第一题选 A：时间片过小 → 切换频繁、开销上升；D 是优先级调度的问题，C 不成立（RR 不保证平均周转最小）",
        "第二题选 B：中断处理中不可调度；A、C、D 都是典型的需要重新调度的时机",
        "连带要记住：不能调度只是「延后」，要用调度标志在退出临界区后补偿",
        "自测建议：把两题的错误选项各写一句「为什么错」，比只记正确选项有效得多",
      ],
    },
    {
      slideType: "mistakes",
      title: "高频易错点（四条）",
      items: [
        {
          mistake: "把「就绪」与「运行」的转换说成由事件驱动",
          description: "就绪 → 运行只由调度程序完成，运行 → 就绪只由时间片耗尽或被抢占引起。",
          correction:
            "记住只有就绪和运行之间是调度关系，其余状态转换由事件（I/O 完成、资源可用、进程创建/终止）驱动；阻塞态不能直接变运行态。",
        },
        {
          mistake: "带权周转时间算成「等待时间 / 运行时间」",
          description: "带权周转时间的分子是周转时间（等待 + 运行），不是等待时间，因此恒大于等于 1。",
          correction:
            "统一口径：周转时间 = 完成 − 到达；带权周转时间 = 周转时间 / 运行时间；等待时间 = 周转时间 − 运行时间。",
        },
        {
          mistake: "认为 SJF 一定比 FCFS 好、且可以随便用",
          description:
            "SJF 的「最优」只在作业同时到达时对平均等待与平均周转成立，且需要预知运行时间，还可能饿死长作业。",
          correction:
            "先看条件：同时到达才谈最优；运行时间不可预知时只能用估计值，实际系统用 HRRN 或多级反馈队列折中。",
        },
        {
          mistake: "抢占点漏算（新进程到达 / 时间片耗尽）",
          description: "比较算法时只按初始顺序排一遍，忘记在抢占点重新选人，导致完成时刻与周转时间全错。",
          correction:
            "画甘特图时先在时间轴上标出所有「到达时刻」与「时间片边界」，每个标志点都按规则重新选择进程，再累加完成时刻。",
        },
      ],
    },
    {
      slideType: "summary",
      title: "本讲小结",
      body: "处理机调度回答「谁获得处理机、获得多久、何时换人」三个问题，是操作系统必须提供的功能。",
      bullets: [
        "三级调度：高级（作业进出内存，仅批处理）、中级（换入换出）、低级（分配 CPU，最频繁）",
        "调度时机：完成、阻塞、时间片到、更高优先级就绪；中断处理中与内核临界区不可调度",
        "评价指标：周转、带权周转（恒 ≥ 1）、等待、响应时间，以及利用率与吞吐量",
        "算法主线：FCFS → SJF/SRTN → HRRN → RR → 优先级 → 多级反馈队列，各有取舍",
        "实时调度：EDF（动态最优）、LLF（松弛度最小）、RMS（静态、周期短优先）",
      ],
      nextSteps: [
        "手算 FCFS / SJF / HRRN / RR 的完成时刻与平均周转时间，再用本讲程序核对",
        "画出多级反馈队列调度过程：新进程进最高队列、用完时间片下移、I/O 返回回高优先级",
      ],
    },
  ];

  const references = [
    {
      sourceKey: "os-scheduling-levels",
      title: "操作系统讲义·处理机调度的层次与时机",
      chapter: "处理机调度",
      section: "三级调度、调度时机、抢占与非抢占",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "os-scheduling-metrics",
      title: "操作系统讲义·调度算法的评价指标",
      chapter: "处理机调度",
      section: "周转时间、带权周转时间、等待与响应时间",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "os-scheduling-classic",
      title: "操作系统讲义·经典调度算法",
      chapter: "处理机调度",
      section: "FCFS、SJF/SRTN、HRRN、RR、优先级",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "os-scheduling-mlfq",
      title: "操作系统讲义·多级队列与多级反馈队列",
      chapter: "处理机调度",
      section: "队列划分与时间片倍增",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "os-scheduling-realtime",
      title: "操作系统讲义·实时调度",
      chapter: "处理机调度",
      section: "EDF / LLF / RMS 与可调度条件",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "os-scheduling-example",
      title: "操作系统讲义·调度算法计算示例",
      chapter: "处理机调度",
      section: "四作业 FCFS 与 SJF 对比",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "os-process-switch",
      title: "操作系统讲义·进程切换与上下文",
      chapter: "进程管理",
      section: "现场保护与切换开销",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
    {
      sourceKey: "os-process-state",
      title: "操作系统讲义·进程状态转换",
      chapter: "进程管理",
      section: "就绪、运行、阻塞的转换条件",
      version: "1.0.0",
      license: "CC-BY-4.0",
    },
  ];

  return {
    title: DECK_TITLE,
    subject: SUBJECT,
    resourceType: "pptx",
    knowledgePoint: KNOWLEDGE_POINT,
    estimatedMinutes: 60,
    content: { theme: "academic-blue", title: "操作系统 · 处理机调度", slides, references },
    citations: [],
    learningObjectives: [
      "说明三级调度各自解决的问题、频率与适用系统",
      "列全需要调度与不能调度的情形，并解释调度标志的作用",
      "写出周转时间、带权周转时间、等待时间与响应时间的定义并正确代入计算",
      "比较 FCFS、SJF/SRTN、HRRN、RR、优先级与多级反馈队列的思想、优缺点与适用场景",
      "画甘特图计算平均周转时间与平均带权周转时间，判断抢占点",
      "说出 EDF、LLF、RMS 的区别与 RMS 的可调度条件",
    ],
    targetLearnerSummary:
      "内容说明：按操作系统「处理机调度」的知识结构组织，覆盖三级调度、调度时机与方式、评价指标、八类经典算法、实时调度与计算例题；引用来源指向平台知识库的真实讲义片段，可逐条核对。",
    generationRationale: [
      "内容说明：由项目组按课程章节整理，用于课堂讲解与复习",
      "页面结构覆盖封面、目标、三级调度、抢占对比、调度时机、评价指标、算法对比、计算例题、代码验证、自测、易错与小结",
      "所有数据（如 FCFS 平均周转 11.5、SJF 7.75）均可在知识库讲义片段中逐条核对",
    ],
  };
}

/* ------------------------------------------------------------------ *
 * 二、思维导图内容
 * ------------------------------------------------------------------ */
function buildMindMapContent() {
  const node = (id, label, description, nodeType, importance, children = [], citations = []) => ({
    id,
    label,
    description,
    nodeType,
    importance,
    children,
    citations,
  });

  const root = node(
    "root",
    "操作系统 · 处理机调度",
    "处理机调度解决「谁获得处理机、获得多久、什么时候换人」。主线是：三级调度分工 → 调度时机与抢占方式 → 评价指标口径 → 经典算法思想与优缺点 → 会画甘特图会算周转时间。",
    "root",
    "high",
    [
      node(
        "overview",
        "调度概览",
        "处理机是最宝贵的资源，进程数多于处理机数且相互竞争，操作系统必须按算法动态分配处理机。",
        "concept",
        "high",
        [
          node(
            "ov-def",
            "什么是处理机调度",
            "按某种算法从就绪队列中选出一个进程并把处理机分配给它，同时决定它占用多久、何时被换下。",
            "concept",
            "high",
            [],
            [2891],
          ),
          node(
            "ov-goal",
            "三大目标",
            "提高 CPU 利用率与系统吞吐量、保证交互响应与实时任务的截止时间、对上层抽象出「独占 CPU」的虚拟处理机。",
            "concept",
            "high",
            [],
            [2894, 2895],
          ),
          node(
            "ov-roles",
            "调度器与分派器",
            "调度器（scheduler）负责「选谁」，按算法做决策；分派器（dispatcher）负责「换谁」，执行上下文切换并切换到用户态。两者是决策与执行的分工。",
            "concept",
            "high",
            [],
            [2885],
          ),
          node(
            "ov-switch",
            "上下文切换开销",
            "切换要保存与恢复寄存器、PC、PSW、栈指针，并切换页表、地址空间与内核栈；开销包含直接开销（保存/恢复现场）与间接开销（缓存与 TLB 失效）。",
            "warning",
            "high",
            [],
            [2885],
          ),
        ],
      ),
      node(
        "levels",
        "三级调度",
        "按层次分为高级、中级、低级调度，作用范围、频率与存在条件都不同。",
        "concept",
        "high",
        [
          node(
            "lv-high",
            "高级调度（作业调度）",
            "决定把外存后备队列中的哪些作业调入内存、创建进程并分配资源。只存在于批处理系统，调入频率最低，决定多道程序度。",
            "concept",
            "high",
            [],
            [2891, 166],
          ),
          node(
            "lv-mid",
            "中级调度（内存调度）",
            "决定把内存中暂时不能运行的进程换出到外存（挂起），或把具备运行条件的挂起进程重新调入内存，提高内存利用率与吞吐量。",
            "concept",
            "medium",
            [],
            [2891],
          ),
          node(
            "lv-low",
            "低级调度（进程调度）",
            "从就绪队列中选出一个进程并分配处理机，是三种调度中最频繁、最核心的一级，任何操作系统都必须具备。",
            "concept",
            "high",
            [],
            [2891, 166],
          ),
          node(
            "lv-compare",
            "频率与适用系统",
            "频率：低级 > 中级 > 高级。分时系统与实时系统通常只有低级调度；中级调度服务的是挂起/激活需求。",
            "comparison",
            "medium",
            [],
            [2891],
          ),
        ],
      ),
      node(
        "timing",
        "调度时机与方式",
        "什么时候允许换人、什么时候绝对不能换人，决定了算法是抢占式还是非抢占式。",
        "concept",
        "high",
        [
          node("tm-occasions", "调度的时机", "什么时候必须重新选人。", "concept", "high", [
            node(
              "tm-when",
              "需要调度的时机",
              "进程执行完毕或异常终止；进程请求 I/O、申请资源或等待事件而主动放弃处理机；时间片用完；有更高优先级进程进入就绪队列；中断处理结束返回。",
              "step",
              "high",
              [],
              [2892, 2880],
            ),
            node(
              "tm-forbid",
              "不能调度的情形",
              "① 处理中断的过程中；② 进程处于操作系统内核临界区中；③ 原子操作过程中。强行调度会破坏内核数据结构一致性，应先置调度标志。",
              "warning",
              "high",
              [],
              [2892],
            ),
            node(
              "tm-flag",
              "调度标志",
              "在不可调度的时刻只记录「需要调度」，等退出临界区或中断处理完成后再统一触发，避免遗漏调度请求。",
              "concept",
              "medium",
              [],
              [2892],
            ),
          ]),
          node("tm-modes", "抢占与否", "两种方式在响应性、开销与同步要求上完全不同。", "concept", "high", [
            node(
              "tm-preempt",
              "抢占方式",
              "允许按优先级、短进程优先、时间片三条原则剥夺当前进程的处理机。响应及时，但切换开销大，共享数据需更严格的同步保护。",
              "concept",
              "high",
              [],
              [2893],
            ),
            node(
              "tm-nonpreempt",
              "非抢占方式",
              "进程一旦获得处理机就一直运行到完成或主动阻塞。实现简单、开销小，但难以满足实时与交互需求。",
              "concept",
              "high",
              [],
              [2893],
            ),
          ]),
          node(
            "tm-state",
            "与进程状态转换的关系",
            "就绪 → 运行由调度完成；运行 → 就绪因时间片到或被抢占；运行 → 阻塞是主动行为；阻塞 → 就绪由外部事件触发，阻塞态不能直接变运行态。",
            "concept",
            "high",
            [],
            [2880, 160],
          ),
        ],
      ),
      node("metrics", "评价指标", "计算题几乎全部围绕这些定义展开，口径写错会连环失分。", "formula", "high", [
        node(
          "mt-time",
          "时间类指标",
          "四个时间指标是计算题的主角：周转、带权周转、等待、响应。",
          "concept",
          "high",
          [
            node(
              "mt-turn",
              "周转时间",
              "周转时间 = 完成时间 − 提交（到达）时间 = 等待时间 + 运行时间。",
              "formula",
              "high",
              [],
              [2894, 167],
            ),
            node(
              "mt-wturn",
              "带权周转时间",
              "带权周转时间 = 周转时间 / 实际运行时间，恒 ≥ 1，越接近 1 说明在系统中等待越少。",
              "formula",
              "high",
              [],
              [2894, 167],
            ),
            node(
              "mt-wait",
              "等待时间",
              "进程在就绪队列中等待处理机的时间之和，不含 I/O 等待时间；= 周转时间 − 运行时间。",
              "formula",
              "high",
              [],
              [2894],
            ),
            node(
              "mt-resp",
              "响应时间",
              "从用户提交请求到系统首次产生响应的时间，是分时系统最重要的指标。",
              "formula",
              "high",
              [],
              [2894],
            ),
          ],
        ),
        node(
          "mt-efficiency",
          "效率类指标",
          "衡量系统整体产出能力，用于比较不同调度策略的宏观效果。",
          "concept",
          "medium",
          [
            node(
              "mt-cpu",
              "CPU 利用率",
              "处理机处于忙碌状态的时间比例 = 忙碌时间 / 总时间，应尽可能高。",
              "formula",
              "medium",
              [],
              [2894],
            ),
            node(
              "mt-thru",
              "系统吞吐量",
              "单位时间内完成的作业数量，与长、短作业的混合比例及调度策略密切相关。",
              "formula",
              "medium",
              [],
              [2894],
            ),
          ],
        ),
        node(
          "mt-target",
          "综合指标与调度目标",
          "响应比综合了等待与服务时间；不同系统追求的目标并不相同。",
          "concept",
          "medium",
          [
            node(
              "mt-ratio",
              "响应比 R",
              "R =（等待时间 + 要求服务时间）/ 要求服务时间 = 周转时间 / 要求服务时间；等待越久 R 越大，服务时间越短 R 越大，是 FCFS 与 SJF 的折中。",
              "formula",
              "high",
              [],
              [2895, 2901],
            ),
            node(
              "mt-goal",
              "不同系统的调度目标",
              "批处理重吞吐量与周转时间；分时重响应时间与均衡性；实时重截止时间与可预测性。",
              "concept",
              "medium",
              [],
              [2895],
            ),
          ],
        ),
      ]),
      node(
        "algorithms",
        "经典调度算法",
        "八类算法的思想、优缺点与适用场景，是本章的主体。",
        "concept",
        "high",
        [
          node(
            "al-nonpreempt",
            "非抢占家族",
            "一旦获得处理机就跑到底，简单但响应差；FCFS、SJF、HRRN 均属此类（SJF 另有抢占版本）。",
            "concept",
            "high",
            [
              node(
                "al-fcfs",
                "FCFS 先来先服务",
                "按到达顺序调度，最简单、非抢占。公平且不会饥饿，但长作业先到会让短作业久等，带权周转时间可能很大；对 CPU 繁忙型有利、对 I/O 繁忙型不利。",
                "algorithm",
                "high",
                [],
                [2896, 2907],
              ),
              node(
                "al-sjf",
                "SJF / SPF 短作业优先",
                "选运行时间最短者。作业同时到达时可证明平均等待与平均周转时间最小；必须预知运行时间，长作业可能饥饿。",
                "algorithm",
                "high",
                [],
                [2897, 2907],
              ),
              node(
                "al-hrrn",
                "HRRN 高响应比优先",
                "每次调度计算后备队列所有作业的响应比，取最大者；非抢占，只在当前作业完成或阻塞后重算。兼顾等待与服务时间，避免长作业饥饿，但计算开销大。",
                "algorithm",
                "high",
                [],
                [2901, 2895],
              ),
            ],
          ),
          node(
            "al-preempt-group",
            "抢占家族",
            "允许在更强理由出现时换人，响应及时但切换开销更大。",
            "concept",
            "high",
            [
              node(
                "al-srtn",
                "SRTN 最短剩余时间优先",
                "SJF 的抢占式版本：新到进程的剩余运行时间比当前进程更短时立即抢占。响应更及时，但切换更多、同样需要预知运行时间。",
                "algorithm",
                "medium",
                [],
                [2897],
              ),
              node(
                "al-rr",
                "RR 时间片轮转",
                "就绪队列按 FCFS 排队，队首进程运行一个时间片后送到队尾；专为分时系统设计。时间片过小则切换开销大，过大则退化为 FCFS，通常取 10~100 ms。",
                "algorithm",
                "high",
                [],
                [2902, 170],
              ),
              node(
                "al-prio-pre",
                "抢占式优先级",
                "更高优先级进程一旦进入就绪队列就立即抢占当前进程，响应最及时，代价是切换频繁与低优先级饥饿风险。",
                "algorithm",
                "medium",
                [],
                [2903],
              ),
            ],
          ),
          node(
            "al-queue-group",
            "队列家族",
            "把就绪队列分而治之，是通用操作系统的主流做法。",
            "concept",
            "high",
            [
              node(
                "al-prio",
                "优先级调度",
                "选优先级最高者运行；分静态优先级与动态优先级。同类优先关系：系统 > 用户、交互 > 批处理、I/O 繁忙 > CPU 繁忙；低优先级可能饥饿，用老化解决。",
                "algorithm",
                "high",
                [],
                [2903],
              ),
              node(
                "al-mq",
                "多级队列",
                "就绪队列划分为多个独立队列，各队列独立设优先级与算法；进程创建时固定分配、一般不迁移，因此难以适应行为变化。",
                "algorithm",
                "medium",
                [],
                [2904],
              ),
              node(
                "al-mlfq",
                "多级反馈队列",
                "多个优先级递减队列，时间片随优先级降低而成倍增大；新进程进最高队列，用完时间片下移，I/O 返回回高优先级；只有高优先级队列空才调度低优先级队列。兼顾短进程优先与响应时间，通用系统广泛采用。",
                "algorithm",
                "high",
                [],
                [2905, 172],
              ),
            ],
          ),
        ],
      ),
      node(
        "compare",
        "算法对比与选择",
        "没有万能算法，选择要在响应时间、周转时间、吞吐量、公平性与实现开销之间权衡。",
        "comparison",
        "high",
        [
          node(
            "cp-fcfs",
            "FCFS 评价",
            "公平、简单、无饥饿，但平均周转时间不优，不利于短作业。",
            "comparison",
            "medium",
            [],
            [2907],
          ),
          node(
            "cp-sjf",
            "SJF/SRTN 评价",
            "平均周转时间最优，但需预知运行时间且会饥饿，适合批处理系统。",
            "comparison",
            "medium",
            [],
            [2907],
          ),
          node(
            "cp-hrrn",
            "HRRN 评价",
            "折中 FCFS 与 SJF，长作业不会饿死，代价是每次计算响应比。",
            "comparison",
            "medium",
            [],
            [2907],
          ),
          node(
            "cp-rr",
            "RR 评价",
            "响应及时、公平，适合分时系统；性能对时间片大小高度敏感。",
            "comparison",
            "medium",
            [],
            [2907],
          ),
          node(
            "cp-mlfq",
            "多级反馈队列评价",
            "综合性能最好，能自适应短进程与 I/O 繁忙型进程，是通用操作系统的常见选择。",
            "comparison",
            "high",
            [],
            [2905, 2907],
          ),
          node(
            "cp-combo",
            "实际系统的组合策略",
            "真实进程的 CPU 脉冲与 I/O 脉冲交替出现，调度器常在进程从 I/O 返回时给予优先级补偿，多采用多种算法组合。",
            "concept",
            "medium",
            [],
            [2907],
          ),
        ],
      ),
      node(
        "calc",
        "计算题方法",
        "比较算法时先算完成时刻，再求周转、带权周转与等待时间；抢占点是最容易漏算的地方。",
        "step",
        "high",
        [
          node(
            "ca-flow",
            "标准四步流程",
            "① 画时间轴标出所有到达时刻与时间片边界；② 在每个决策点按规则选进程；③ 累加完成时刻；④ 按公式求周转、带权周转、等待时间并取平均。",
            "step",
            "high",
            [],
            [173, 2898],
          ),
          node(
            "ca-cases",
            "三类算例",
            "同一组数值用不同算法算两遍，最容易看出算法差异。",
            "example",
            "high",
            [
              node(
                "ca-fcfs",
                "FCFS 算例（7/4/1/4 同时到达）",
                "完成时刻 7、11、12、16；平均周转时间 11.5；带权周转 1、2.75、12、4，平均约 4.938。",
                "example",
                "high",
                [],
                [2898],
              ),
              node(
                "ca-sjf",
                "SJF 算例（同一组作业）",
                "顺序 P3→P2→P4→P1：完成时刻 1、5、9、16；平均周转时间 7.75；平均带权周转约 1.696，明显优于 FCFS。",
                "example",
                "high",
                [],
                [2898, 2897],
              ),
              node(
                "ca-rr",
                "RR 算例（5/4/2，时间片 2）",
                "完成时刻为 12、10、6，平均周转约 9.33（FCFS 为 8.33），但 RR 的响应时间明显更好——指标要成对看。",
                "example",
                "medium",
                [],
                [2902],
              ),
            ],
          ),
          node(
            "ca-preempt",
            "抢占点判断",
            "新进程到达或时间片耗尽时，当前进程可能被更强优先级的进程取代；比较算法时必须在这些时刻重新选人，否则完成时刻全错。",
            "warning",
            "high",
            [],
            [173],
          ),
        ],
      ),
      node(
        "realtime",
        "实时调度",
        "实时系统的「正确」包含时间维：必须在截止时间前完成。",
        "concept",
        "medium",
        [
          node(
            "rt-dynamic",
            "动态优先级算法",
            "优先级随任务的截止时间或松弛度动态变化，利用率更高。",
            "concept",
            "high",
            [
              node(
                "rt-edf",
                "EDF 最早截止时间优先",
                "动态选择当前截止时间最早的任务；在任务可抢占且忽略切换开销时，是单处理机上的最优算法，利用率理论上可达 100%。",
                "algorithm",
                "high",
                [],
                [2906],
              ),
              node(
                "rt-llf",
                "LLF 最低松弛度优先",
                "松弛度 = 必须完成时刻 − 本身还需运行时间 − 当前时刻，选择松弛度最小的任务运行。",
                "algorithm",
                "medium",
                [],
                [2906],
              ),
            ],
          ),
          node(
            "rt-static",
            "静态优先级算法",
            "优先级在任务创建时确定，运行期间不变，实现简单、可预测性强。",
            "concept",
            "high",
            [
              node(
                "rt-rms",
                "RMS 速率单调调度",
                "周期越短优先级越高，属静态优先级；对周期性任务在固定优先级中是最优的。",
                "algorithm",
                "medium",
                [],
                [2906],
              ),
              node(
                "rt-condition",
                "RMS 可调度条件",
                "总利用率不超过 n(2^(1/n) − 1)，n 为任务数；n 增大时该上界趋近 ln2 ≈ 0.693。",
                "formula",
                "medium",
                [],
                [2906],
              ),
            ],
          ),
        ],
      ),
      node(
        "pitfalls",
        "易错与自查",
        "失分集中在口径与抢占点两类问题：公式分子分母用错、比较算法时漏掉抢占时刻。",
        "concept",
        "high",
        [
          node(
            "pf-state",
            "易错 · 状态转换的驱动者",
            "就绪 ↔ 运行由调度/时间片驱动，运行 → 阻塞是进程主动行为，阻塞 → 就绪由外部事件触发；阻塞态不能直接变运行态。",
            "misconception",
            "high",
            [],
            [2880],
          ),
          node(
            "pf-wturn",
            "易错 · 带权周转时间口径",
            "分子是周转时间（等待 + 运行）而不是等待时间，因此恒 ≥ 1；等待时间 = 周转时间 − 运行时间。",
            "misconception",
            "high",
            [],
            [2894, 167],
          ),
          node(
            "pf-sjf",
            "易错 · 把 SJF 当万能最优",
            "SJF 的最优性只在作业同时到达时成立，且需预知运行时间、可能饿死长作业；实际系统用 HRRN 或多级反馈队列折中。",
            "misconception",
            "high",
            [],
            [2897, 2907],
          ),
          node(
            "pf-slice",
            "易错 · 时间片大小的双重影响",
            "时间片过小 → 切换开销占比上升；过大 → RR 退化为 FCFS。要按典型交互时间取 10~100 ms。",
            "misconception",
            "medium",
            [],
            [2902, 170],
          ),
          node(
            "pf-preempt",
            "易错 · 抢占点漏算",
            "比较算法时忘记在「新进程到达」与「时间片耗尽」处重新选人，导致完成时刻与周转时间全部算错。",
            "misconception",
            "high",
            [],
            [173],
          ),
          node(
            "pf-check",
            "自查清单",
            "① 三级调度分别解决什么问题？② 哪些时刻不能调度、为什么？③ 六个指标定义与公式写得出吗？④ 八个算法的优缺点与适用场景？⑤ 会画甘特图并按抢占点重算吗？⑥ RMS 的可调度条件是什么？",
            "summary",
            "medium",
            [],
            [2891, 2892, 2894, 2907, 2906],
          ),
        ],
      ),
    ],
  );

  const crossLinks = [
    { sourceId: "mt-turn", targetId: "ca-flow", label: "周转时间的定义直接决定计算流程" },
    { sourceId: "mt-wturn", targetId: "ca-sjf", label: "带权周转时间在 SJF 算例中体现优势" },
    { sourceId: "tm-preempt", targetId: "ca-preempt", label: "抢占式算法必须在每个到达点重新选择" },
    { sourceId: "al-rr", targetId: "pf-slice", label: "时间片取值决定 RR 的实际效果" },
    { sourceId: "al-sjf", targetId: "al-srtn", label: "SRTN 是 SJF 的抢占式版本" },
    { sourceId: "al-hrrn", targetId: "mt-ratio", label: "响应比公式是 HRRN 的判定依据" },
    { sourceId: "al-mlfq", targetId: "al-rr", label: "高优先级队列内部通常用时间片轮转" },
    { sourceId: "lv-low", targetId: "ov-roles", label: "低级调度由调度器决策、分派器执行切换" },
    { sourceId: "tm-forbid", targetId: "ov-switch", label: "不允许调度是为了避免破坏内核现场一致性" },
    { sourceId: "rt-rms", targetId: "rt-condition", label: "静态优先级算法的可调度性由利用率上界判定" },
  ];

  const highlightNodeIds = [
    "lv-low",
    "tm-when",
    "tm-preempt",
    "mt-turn",
    "mt-wturn",
    "mt-ratio",
    "al-sjf",
    "al-hrrn",
    "al-mlfq",
    "ca-preempt",
    "rt-edf",
  ];
  const misconceptionNodeIds = ["pf-state", "pf-wturn", "pf-sjf", "pf-slice", "pf-preempt"];
  const recommendedSequence = [
    "ov-def",
    "ov-goal",
    "ov-roles",
    "lv-high",
    "lv-mid",
    "lv-low",
    "lv-compare",
    "tm-when",
    "tm-forbid",
    "tm-flag",
    "tm-preempt",
    "tm-nonpreempt",
    "tm-state",
    "mt-cpu",
    "mt-thru",
    "mt-turn",
    "mt-wturn",
    "mt-wait",
    "mt-resp",
    "mt-ratio",
    "al-fcfs",
    "al-sjf",
    "al-srtn",
    "al-hrrn",
    "al-rr",
    "al-prio",
    "al-mq",
    "al-mlfq",
    "cp-fcfs",
    "cp-sjf",
    "cp-hrrn",
    "cp-rr",
    "cp-mlfq",
    "ca-flow",
    "ca-fcfs",
    "ca-sjf",
    "ca-rr",
    "ca-preempt",
    "rt-edf",
    "rt-llf",
    "rt-rms",
    "rt-condition",
    "pf-check",
  ];

  return { root, crossLinks, highlightNodeIds, misconceptionNodeIds, recommendedSequence };
}

/* ------------------------------------------------------------------ *
 * 三、组装两份 envelope（写入平台资源库时用）
 * ------------------------------------------------------------------ */
/** 思维导图 envelope：内容 + 元信息，可直接交给 buildSampleMindMap 的 publish 落库。 */
function buildMindMapEnvelope() {
  const mindMap = buildMindMapContent();
  return {
    title: MIND_MAP_TITLE,
    subject: SUBJECT,
    resourceType: "mind_map",
    knowledgePoint: KNOWLEDGE_POINT,
    estimatedMinutes: 40,
    content: { ...mindMap, citations: [] },
    citations: [],
    learningObjectives: [
      "说清三级调度各自解决的问题、频率与适用系统",
      "列全需要调度与不能调度的情形",
      "写出六项评价指标的定义并正确代入计算",
      "比较八类调度算法的思想、优缺点与适用场景",
    ],
    targetLearnerSummary:
      "内容说明：按操作系统「处理机调度」的知识结构组织，结点覆盖三级调度、调度时机与方式、六项评价指标、八类调度算法、算法对比、计算题方法、实时调度与易错点。",
    generationRationale: [
      "内容说明：由项目组按课程章节整理，用于复习与课堂展示",
      "结点涵盖概念、公式、步骤、算法、算例与易错点六类，并按重要程度标注",
    ],
  };
}

/* ------------------------------------------------------------------ *
 * 四、渲染与导出
 * ------------------------------------------------------------------ */
const CITATION_CATALOG = [
  {
    marker: "[1]",
    sourceKey: "os-scheduling-lecture",
    title: "操作系统课程讲义·处理机调度",
    chapter: "处理机调度",
    section: "三级调度 / 评价指标 / 经典算法 / 实时调度",
    version: "1.0.0",
    license: "CC-BY-4.0",
  },
];

async function main() {
  const outArg = process.argv.find((item) => item.startsWith("--out="));
  const outDir = outArg
    ? outArg.slice("--out=".length).replace(/^"|"$/g, "")
    : path.join(__dirname, "..", "data", "scheduling-materials");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("== 1. 渲染课件 PPTX ==");
  const deck = buildDeckContent();
  const pptxPath = path.join(outDir, "处理机调度-课件.pptx");
  const validation = await generatePptx(deck.content, pptxPath, CITATION_CATALOG);
  console.log(
    `   ${validation.slideCount} 页 · ${(validation.size / 1024).toFixed(1)} KB · 备注 ${validation.notesCount} 条 · 包校验 ${validation.packageValid ? "通过" : "失败"}`,
  );

  console.log("== 2. 导出 PPTist 可编辑 JSON ==");
  const pptistDeck = buildPptistDeck(deck.content, {
    title: deck.title,
    subject: deck.subject,
    knowledgePoint: deck.knowledgePoint,
  });
  const pptistPath = path.join(outDir, "处理机调度-PPTist.json");
  fs.writeFileSync(pptistPath, JSON.stringify(pptistDeck, null, 2), "utf8");
  console.log(
    `   ${(fs.statSync(pptistPath).size / 1024).toFixed(1)} KB · ${(pptistDeck.slides || []).length} 页`,
  );

  console.log("== 3. 导出思维导图 JSON（simple-mind-map 格式）==");
  const mindMapEnvelope = buildMindMapEnvelope();
  const mindMapJson = buildMindMapJson(mindMapEnvelope.content, {
    title: MIND_MAP_TITLE,
    subject: SUBJECT,
    knowledgePoint: KNOWLEDGE_POINT,
  });
  // 导出服务默认只展开前两层（课堂上逐层展开更聚焦），但这份离线交付件要一次看全，
  // 所以把所有带子结点的结点都设为展开。
  const expandAll = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.data && Array.isArray(n.children) && n.children.length) n.data.expand = true;
    (n.children || []).forEach(expandAll);
  };
  expandAll(mindMapJson.root);
  const mindMapPath = path.join(outDir, "处理机调度-思维导图.json");
  fs.writeFileSync(mindMapPath, JSON.stringify(mindMapJson, null, 2), "utf8");

  const countNodes = (n) => 1 + (n.children || []).reduce((sum, child) => sum + countNodes(child), 0);
  const depthOf = (n) => 1 + Math.max(0, ...(n.children || []).map(depthOf));
  console.log(
    `   ${(fs.statSync(mindMapPath).size / 1024).toFixed(1)} KB · 结点 ${countNodes(mindMapEnvelope.content.root)} 个 · 深度 ${depthOf(mindMapEnvelope.content.root)} · 交叉连线 ${mindMapEnvelope.content.crossLinks.length} 条 · 易错标注 ${mindMapEnvelope.content.misconceptionNodeIds.length} 个`,
  );

  const studentArg = process.argv.find((item) => item.startsWith("--student="));
  if (process.argv.includes("--publish")) {
    const studentId = studentArg ? Number(studentArg.slice("--student=".length)) : 0;
    if (!studentId) throw new Error("--publish 需要同时指定 --student=<学生ID>");
    // --deliver=<目录>：交付目录（里面的 PPTX 会被原样替换成资源文件）；缺省就用本次输出目录
    const deliverArg = process.argv.find((item) => item.startsWith("--deliver="));
    const deliverDir = deliverArg ? deliverArg.slice("--deliver=".length).replace(/^"|"$/g, "") : outDir;
    await publishToStudent(studentId, deliverDir);
  }

  console.log(`\n全部产物已写入：${outDir}`);
}

/**
 * 把这份课件与导图写进指定学生当前路径阶段位的资源（同类型同阶段唯一，因此是「替换」而不是新增）：
 *   - 课件：渲染 PPTX → 资源版本 + 文件；随后用交付目录里的 PPTX 覆盖文件，保证下载到的就是这份
 *   - 导图：写资源版本（内容 JSON，学生端导图页面直接渲染）
 */
async function publishToStudent(studentId, outDir) {
  const { pool } = require("../src/config/db");
  const storage = require("../src/services/resourceStorageService");
  const { publish: publishDeck } = require("./buildSampleDeck");
  const { publish: publishMindMap } = require("./buildSampleMindMap");

  console.log(`== 4. 写入学生 #${studentId} 的课件与导图资源 ==`);
  const deckEnvelope = buildDeckContent();
  const deckResult = await publishDeck(pool, deckEnvelope, {
    student: studentId,
    subject: deckEnvelope.subject,
    knowledgePoint: deckEnvelope.knowledgePoint,
    title: DECK_TITLE,
    takeover: true,
    force: true,
  });
  console.log(
    `   课件：资源 #${deckResult.resourceId} v${deckResult.version}（路径 v${deckResult.target.pathVersion} ${deckResult.target.stageKey}）`,
  );

  const mindEnvelope = buildMindMapEnvelope();
  const mindResult = await publishMindMap(pool, mindEnvelope, {
    student: studentId,
    subject: mindEnvelope.subject,
    knowledgePoint: mindEnvelope.knowledgePoint,
    title: MIND_MAP_TITLE,
    takeover: true,
    force: true,
  });
  console.log(`   导图：资源 #${mindResult.resourceId} v${mindResult.version}`);

  const deliveredPptx = path.join(outDir, "处理机调度-课件.pptx");
  if (fs.existsSync(deliveredPptx)) {
    const tempPath = await storage.prepareTempFile("pptx");
    fs.copyFileSync(deliveredPptx, tempPath);
    const meta = await storage.finalizeFile(tempPath, {
      studentId,
      resourceId: deckResult.resourceId,
      version: deckResult.version,
      fileType: "pptx",
    });
    await pool.query(
      "UPDATE learning_resource_files SET storage_path=?,original_filename=?,file_size=?,checksum_sha256=? WHERE resource_id=? AND resource_version=?",
      [
        meta.storagePath,
        path.basename(deliveredPptx),
        meta.fileSize,
        meta.checksum,
        deckResult.resourceId,
        deckResult.version,
      ],
    );
    console.log(
      `   课件文件已替换为交付版本：${path.basename(deliveredPptx)}（${(meta.fileSize / 1024).toFixed(1)} KB）`,
    );
  }
  await pool.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("生成失败：", error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  buildDeckContent,
  buildMindMapContent,
  buildMindMapEnvelope,
  publishToStudent,
  DECK_TITLE,
  MIND_MAP_TITLE,
  SUBJECT,
  KNOWLEDGE_POINT,
};
