/* 项目原创部分：本文件的寻笺业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
function buildDetailedStudyNoteContent(context, options = {}) {
  const citations = Array.isArray(options.citations) ? options.citations : [];
  const topic = topicBlueprint(context);
  const citationText = citations.length
    ? `本节涉及课程资料时使用 ${citations.map((item) => `[${item.label}]`).join("、")} 标注，未被资料覆盖的推导只作为通用教学说明。`
    : "当前知识库没有可验证命中，本讲义使用本地确定性教学结构与通用课程知识，不生成虚假引用。";
  const profileLine = profileSentence(context);
  const content = {
    personalizedObjectives: [
      `说清 ${context.knowledgePoint} 的定义、适用条件和关键边界。`,
      `结合当前掌握度 ${context.mastery}，把抽象机制拆成可跟踪的状态变化。`,
      `按照“${context.explanationPreference}”偏好，先建立结构关系，再进入伪代码和例题。`,
      `面向${context.major || "计算机专业"}${context.grade || "学生"}的系统学习，完成概念辨析、过程推导和练习闭环。`,
    ],
    foundationSummary: `适用对象与讲解方式：${profileLine} 本次讲义不把结论直接背诵给你，而是按“前置知识回顾、核心概念、机制过程、示例、伪代码、复杂度或工程实践、易错点、练习解析、检查理解、总结与后续建议”的顺序展开。${citationText} 如果某一处没有引用标记，表示它来自通用教材层面的确定性讲解，而不是伪造课程资料。`,
    coreConcepts: [
      concept(
        "前置知识回顾",
        `学习 ${context.knowledgePoint} 前，要先确认三个基础：第一，能区分对象、状态和操作；第二，能把一次操作拆成“触发条件、局部变化、全局性质是否保持”；第三，能用反例检查理解。${profileFact(context, "prior")}如果这些基础薄弱，阅读时建议每遇到一个状态变化就画一行表格，记录变化前、变化动作和变化后。`,
        "high",
        citations[0],
      ),
      concept("核心概念与边界", topic.definition, "high", citations[0]),
      concept("关键性质或机制", topic.mechanism, "high", citations[1] || citations[0]),
      concept("工作过程与执行步骤", topic.process, "high", citations[2] || citations[0]),
      concept("复杂度、代价与工程实践", topic.complexity, "medium", citations[3] || citations[0]),
      concept("跨知识点对比与联系", topic.comparison, "medium", citations[4] || citations[0]),
    ],
    diagrams: [
      {
        title: "结构关系图：从对象到约束",
        description: `把 ${context.knowledgePoint} 画成三层关系：最上层是学习目标，中间层是核心对象和约束，底层是每一步操作产生的状态变化。这样做适合${context.explanationPreference || "结构化讲解"}偏好，因为它先给出全局地图，再把细节放回原位置。`,
        steps: [
          `写出对象：${topic.objects}。`,
          `写出必须保持的约束：${topic.constraints}。`,
          "在图上标出每一步会改变的局部状态，不改变的全局性质也要写出来。",
          "最后用一个极小样例和一个边界样例复核，防止只会套模板。",
        ],
      },
      {
        title: "过程追踪图：条件、动作、验证",
        description: `每个机制都按“条件 -> 动作 -> 验证”追踪。条件回答什么时候做，动作回答具体改了什么，验证回答为什么仍然正确。这个图可以和练习题一起使用，避免把 ${context.knowledgePoint} 学成孤立定义。`,
        steps: [
          "条件：先列触发场景，不满足条件时不要强行套步骤。",
          "动作：只修改必要对象，说明修改顺序。",
          "验证：检查关键性质、复杂度和边界情况。",
          "复盘：把错误模式写成一句可执行检查清单。",
        ],
      },
    ],
    methodsAndFormulas: [
      {
        title: "伪代码：条件驱动的分析框架",
        expression: topic.pseudocode,
        explanation: `这段伪代码不是为了替代教材实现，而是为了让你在纸面推导时不跳步。注意每一行都对应一个可验证的问题：当前状态是什么、是否触发条件、动作后哪些性质保持、是否需要继续循环。`,
        conditions: ["题目要求说明过程或证明性质", "需要比较多个相似机制", "需要写出复杂度或工程边界"],
      },
      {
        title: "检查公式：性质保持与代价估计",
        expression: "总成本 = 状态检查次数 + 局部调整次数 + 验证次数；关键性质必须在每次调整后保持",
        explanation: `分析 ${context.knowledgePoint} 时不要只给最终结果。先说明需要检查多少状态，再说明每次调整是否为常数级、线性级或受输入规模影响，最后说明验证条件是否覆盖了边界输入。`,
        conditions: ["存在循环、递归、状态机或多步协议", "题目要求复杂度、代价或正确性说明"],
      },
    ],
    workedExamples: topic.examples.map((example, index) => ({
      question: `示例${index + 1}：${example.question}`,
      steps: example.steps,
      answer: example.answer,
    })),
    commonMistakes: topic.mistakes.map((item) => ({
      mistake: item.mistake,
      reason: item.reason,
      correction: item.correction,
    })),
    practiceTasks: topic.exercises.map((item, index) => ({
      prompt: `${index === 0 ? "检查理解：" : `练习${index + 1}：`}${item.prompt}`,
      hint: item.hint,
      answerGuide: item.answerGuide,
    })),
    studyAdvice: [
      `知识总结：${topic.summary}`,
      `后续学习建议一：按${context.paceAndTimeBudget?.pacePreference || "适中"}节奏安排，先用 10 分钟复述定义和边界，再用 20 分钟完成两个过程例子，最后用 15 分钟做练习与纠错。`,
      `后续学习建议二：如果目标是${(context.learningGoals || [])[0] || "系统掌握课程"}，请把本讲义中的易错点整理成错题本检查项，并在下一次测验前逐条复核。`,
      `后续学习建议三：偏好“${(context.resourcePreferences || []).join("、") || "结构化资源"}”时，可以先读讲义，再把过程图改写为自己的导图或代码注释。`,
    ],
    citationBasis: citations.length
      ? citations
          .slice(0, 5)
          .map(
            (item) =>
              `${item.label}：${item.sourceTitle}${item.chapter ? ` / ${item.chapter}` : ""}${item.section ? ` / ${item.section}` : ""}，摘录支持：“${item.excerpt.slice(0, 120)}”。[${item.label}]`,
          )
      : ["知识库未命中或当前课程暂未接入 RAG，本讲义没有生成课程资料引用，也没有伪造来源。"],
  };
  return enrichStudyNoteContent(content, context);
}

function concept(title, explanation, importance, citation) {
  const suffix = citation ? ` 这一点可对照课程资料 [${citation.label}]。` : "";
  return { title, explanation: `${explanation}${suffix}`, importance };
}

function topicBlueprint(context) {
  const text = `${context.subject} ${context.knowledgePoint}`.toLowerCase();
  if (/红黑树|red.?black/.test(text)) return redBlackTree(context);
  if (/进程|线程|上下文/.test(text)) return processThread(context);
  if (/tcp|握手|挥手/.test(text)) return tcpConnection(context);
  return genericTopic(context);
}

function redBlackTree(context) {
  return {
    objects: "节点颜色、父子指针、局部三代关系、根节点和黑高",
    constraints: "根为黑、红节点不能有红孩子、从任一节点到叶子的黑节点数一致、整体仍满足二叉搜索树顺序",
    definition:
      "红黑树是一种近似平衡的二叉搜索树。它不是严格平衡树，不要求左右子树高度差固定为 1，而是用颜色约束保证最长路径不超过最短路径的约两倍。插入新节点时通常先按二叉搜索树规则放入红节点，再通过变色与旋转修复被破坏的颜色性质；如果父节点为黑，插入立即结束，如果父节点为红，就必须观察叔叔节点和祖父节点的关系。",
    mechanism:
      "插入修复的关键是把冲突限制在局部。父红叔红时，父和叔变黑、祖父变红，问题向上推进；父红叔黑且新节点与父节点形成内侧关系时，先做一次旋转转成外侧关系；随后对祖父做相反方向旋转，并交换父与祖父颜色。旋转必须保持二叉搜索树中序顺序，所以左旋和右旋只改变局部父子关系，不改变键的相对大小。",
    process:
      "完整过程分四步：先执行普通二叉搜索树插入；把新节点标红；如果父节点是红色，按叔叔颜色和内外侧形态分类修复；最后强制根节点为黑。每一次旋转后都要检查父指针、子树接回位置和根节点情况。这个过程看似分支多，本质只有“变色上推”和“旋转消除连续红”两类动作。",
    complexity:
      "查找插入位置需要 O(log n) 高度；修复过程中，旋转次数最多为 2 次，但变色可能沿祖先链上推，因此总时间仍为 O(log n)，额外空间为 O(1)。工程实现中最容易出错的是父指针维护、空叔叔视为黑色、根节点更新以及把左右对称情况漏写一半。",
    comparison:
      "红黑树和 AVL 树都服务于有序集合，但 AVL 更严格平衡，查询更稳定，插入删除旋转可能更多；红黑树平衡条件较宽松，更新性能和实现取舍更适合许多工程库。红黑树也不同于堆：堆只保证父子优先级关系，不保证中序有序，不能用堆的思路解释红黑树旋转。",
    pseudocode:
      "while parent(x) is RED:\n  if uncle(x) is RED: recolor and x = grandparent(x)\n  else if x is inner child: rotate parent(x)\n  else: rotate grandparent(x), swap colors\nroot.color = BLACK",
    examples: [
      {
        question: "插入节点后父节点和叔叔节点都为红色，应该如何修复？",
        steps: [
          "先确认新节点按二叉搜索树规则插入，红黑性质中只有连续红可能被破坏。",
          "观察父节点为红、叔叔节点也为红，说明祖父节点下面两条分支的黑高仍可通过变色保持。",
          "把父节点和叔叔节点改为黑色，把祖父节点改为红色。",
          "把当前检查点移动到祖父节点，因为祖父变红后可能继续和它的父节点形成连续红。",
          "循环结束后把根节点强制改为黑色，防止根被上推变红。",
        ],
        answer:
          "这种情况不需要旋转，核心是变色并上推冲突。正确答案必须说明父叔变黑、祖父变红、检查点上移和根最终为黑，不能只写“重新染色”。",
      },
      {
        question: "插入节点形成“左-右”内侧结构，为什么不能直接对祖父右旋？",
        steps: [
          "左-右结构表示父节点是祖父的左孩子，而新节点是父节点的右孩子。",
          "如果直接对祖父右旋，新节点仍卡在内侧，旋转后不一定消除连续红的标准外侧形态。",
          "先对父节点做左旋，让新节点上升，局部形态变为左-左。",
          "再对祖父做右旋，并调整新父节点与祖父节点颜色。",
          "最后检查中序顺序：左子树键 < 新父节点键 < 右子树键，二叉搜索树性质不变。",
        ],
        answer:
          "内侧情况需要先旋转父节点转成外侧情况，再旋转祖父节点。直接旋转祖父会混淆修复顺序，也容易遗漏颜色交换。",
      },
    ],
    mistakes: [
      {
        mistake: "把红黑树当成严格平衡树",
        reason: "红黑树只用颜色和黑高限制路径长度，不保证任意节点左右高度差不超过 1。",
        correction: "答题时写“近似平衡”或“弱平衡”，并用黑高性质解释高度上界。",
      },
      {
        mistake: "忘记空叔叔视为黑色",
        reason: "很多实现中 NIL 叶子或空指针参与颜色判断，空叔叔不能按红色分支处理。",
        correction: "判断叔叔颜色前先处理空指针，把空叔叔归入叔黑旋转修复场景。",
      },
      {
        mistake: "旋转后不更新父指针或根指针",
        reason: "左旋右旋会改变局部根，如果父指针和整棵树根没有接回，树结构会断裂。",
        correction: "每次旋转写出三件事：子树转移、父子关系重连、全局根可能更新。",
      },
      {
        mistake: "只背三种情况，不说明为什么保持中序",
        reason: "旋转的正确性来自二叉搜索树的大小关系保持，不是颜色规则本身。",
        correction: "用 A < x < B < y < C 的局部顺序说明左旋和右旋不会破坏查找顺序。",
      },
      {
        mistake: "修复结束后忘记根节点最终为黑",
        reason: "变色上推可能把原根染红，违反根为黑的红黑树性质。",
        correction: "在插入修复函数最后统一设置 root.color = BLACK。",
      },
    ],
    exercises: [
      {
        prompt: "给出父红叔红时的修复步骤，并说明为什么不需要旋转。",
        hint: "关注黑高是否变化，以及冲突是否向祖父上推。",
        answerGuide:
          "父和叔改黑、祖父改红，黑高保持；连续红可能出现在祖父与其父之间，所以检查点上移。没有内外侧结构问题，因此不需要旋转。",
      },
      {
        prompt: "判断“红黑树插入最多旋转 O(log n) 次”是否正确，并说明理由。",
        hint: "区分旋转次数和变色上推次数。",
        answerGuide: "不正确。插入修复旋转次数最多 2 次，变色可能上推 O(log n) 层，总时间 O(log n)。",
      },
      {
        prompt: "写出左旋时需要更新的三个关系。",
        hint: "从子树、父指针、根指针三个角度写。",
        answerGuide:
          "需要把 y 的左子树接为 x 的右子树，把 y 接到 x 原来的父节点位置，再把 x 设为 y 的左孩子；若 x 原来是根，还要更新根指针。",
      },
    ],
    summary:
      "红黑树插入修复的核心不是死记分类，而是用变色处理父叔同红，用旋转处理父红叔黑，并始终维护二叉搜索树顺序、红黑性质和根为黑。",
  };
}

function processThread(context) {
  return {
    objects: "程序、进程、线程、地址空间、寄存器上下文、内核调度实体",
    constraints: "进程拥有资源和地址空间，线程共享进程资源但有独立执行流，上下文切换必须保存和恢复必要状态",
    definition:
      "程序是静态文件或指令集合，进程是程序的一次运行实例，拥有独立地址空间、打开文件、资源句柄和至少一个线程。线程是进程内部的执行流，同一进程内多个线程通常共享代码段、数据段和堆，但每个线程有自己的栈、寄存器现场和线程控制块。上下文切换是 CPU 从一个执行流切到另一个执行流时保存旧现场、恢复新现场的过程。",
    mechanism:
      "进程切换通常比线程切换代价更高，因为它可能涉及地址空间切换、页表或 TLB 影响、更多资源状态更新。线程切换如果发生在同一进程内，地址空间可以保持不变，但仍要保存寄存器、程序计数器、栈指针和调度信息。调度关注谁获得 CPU，上下文切换关注如何把 CPU 执行现场安全地交给另一个执行流。",
    process:
      "一次典型切换先由时钟中断、系统调用、阻塞 I/O 或更高优先级任务触发；内核进入调度路径；保存当前线程的寄存器和状态；选择下一个可运行线程；必要时切换地址空间；恢复目标线程现场；从目标线程上次停下的位置继续执行。这个过程不等于进程创建，也不等于程序加载。",
    complexity:
      "上下文切换本身不直接提高计算吞吐，它是并发和交互响应的必要成本。频繁切换会带来寄存器保存恢复、缓存/TLB 失效、锁竞争和调度开销。工程实践中要避免把大量短任务拆成过多线程，也要避免在共享数据上无锁读写导致竞态。",
    comparison:
      "并发表示多个任务在一段时间内交替推进，并行表示多个任务在同一时刻真的同时执行。单核 CPU 可以并发但不能真正并行；多核 CPU 可以并行。进程更强调资源隔离，线程更强调共享内存下的轻量执行。协程则通常由用户态调度，切换成本更低，但遇到阻塞调用时需要运行时配合。",
    pseudocode:
      "on trap_or_timer_interrupt:\n  save registers of current thread\n  mark state ready/blocked\n  next = scheduler.pick_ready_thread()\n  if next.process != current.process: switch_address_space(next)\n  restore registers of next\n  return to next.program_counter",
    examples: [
      {
        question: "浏览器一个标签页卡住时，为什么其他标签页可能仍能响应？",
        steps: [
          "现代浏览器常把标签页或站点隔离到不同进程或进程组。",
          "某个进程内脚本阻塞主要影响该进程的事件循环和线程。",
          "其他进程拥有独立地址空间和调度实体，内核仍可调度它们运行。",
          "如果共享的 GPU 或网络服务进程阻塞，影响范围会扩大。",
        ],
        answer:
          "关键在于进程隔离和内核调度。不能简单说“浏览器是多线程所以互不影响”，因为线程共享地址空间，隔离强度不同。",
      },
      {
        question: "同一进程内两个线程同时修改计数器会发生什么问题？",
        steps: [
          "两个线程共享全局变量 count。",
          "count++ 实际包含读、加、写多个步骤。",
          "线程 A 读到 5 后被切走，线程 B 也读到 5 并写回 6。",
          "线程 A 恢复后写回 6，两个加一最终只增加一次。",
        ],
        answer: "这是竞态条件。需要互斥锁、原子操作或其他同步机制保护临界区，不能只依赖线程切换速度。",
      },
    ],
    mistakes: [
      {
        mistake: "把进程等同于程序",
        reason: "程序是静态代码，进程是运行时实体，包含地址空间、资源状态和执行上下文。",
        correction: "回答时写出“程序可以有多个进程实例，进程是资源分配基本单位”。",
      },
      {
        mistake: "认为线程没有自己的资源",
        reason: "线程共享进程资源，但仍有独立栈、寄存器现场、线程 ID 和调度状态。",
        correction: "用“共享进程地址空间，保留独立执行现场”描述线程。",
      },
      {
        mistake: "混淆调度与上下文切换",
        reason: "调度是选择下一个运行对象，切换是保存恢复现场的机制。",
        correction: "先说调度决策，再说上下文保存、地址空间处理和现场恢复。",
      },
      {
        mistake: "把并发和并行当同义词",
        reason: "并发是时间段内推进，并行是同一时刻执行。",
        correction: "用单核时间片轮转解释并发，用多核同时运行解释并行。",
      },
      {
        mistake: "忽视线程共享数据带来的同步问题",
        reason: "共享内存提高通信效率，也引入竞态、死锁和可见性问题。",
        correction: "凡是多线程修改共享状态，都要说明同步策略和临界区。",
      },
    ],
    exercises: [
      {
        prompt: "解释进程、线程和程序三者区别。",
        hint: "分别从静态/动态、资源、执行流三个维度说。",
        answerGuide:
          "程序是静态指令集合；进程是程序运行实例和资源分配单位；线程是进程内执行流，共享进程资源但有独立栈和寄存器上下文。",
      },
      {
        prompt: "为什么同进程线程切换通常比进程切换更轻？",
        hint: "关注地址空间是否切换。",
        answerGuide:
          "同进程线程切换通常不换地址空间，页表/TLB影响较小，但仍需保存恢复寄存器、栈指针和调度状态。",
      },
      {
        prompt: "判断“多线程一定更快”是否正确。",
        hint: "考虑锁、切换和任务性质。",
        answerGuide:
          "不正确。CPU 密集任务受核心数限制，I/O 密集任务可能受等待时间影响；过多线程会增加切换、缓存失效和锁竞争成本。",
      },
    ],
    summary:
      "进程解决资源隔离和运行实例问题，线程解决同一进程内多个执行流问题，上下文切换是调度落地的机制。理解这三者，要同时看地址空间、共享资源、执行现场和切换代价。",
  };
}

function tcpConnection(context) {
  return {
    objects: "客户端、服务端、序号、确认号、SYN、ACK、FIN、连接状态与 TIME_WAIT",
    constraints: "TCP 面向连接、可靠、有序、字节流；握手同步双方初始序号，挥手允许双向数据流分别关闭",
    definition:
      "TCP 三次握手用于建立连接并同步双方初始序号，不是为了加密，也不是单纯为了提高速度。第一次客户端发送 SYN 并携带初始序号；第二次服务端回复 SYN+ACK，确认客户端序号并给出自己的初始序号；第三次客户端发送 ACK，确认服务端序号。四次挥手则来自 TCP 全双工特性：一方不再发送数据，不代表另一方也立即没有数据可发。",
    mechanism:
      "握手的核心是让双方都确认“自己能发、对方能收、对方能发、自己能收”。两次握手无法让客户端确认服务端的发送能力和确认能力，也容易让历史重复 SYN 造成半开连接。挥手中 FIN 表示本端数据发送完毕，ACK 表示确认对方关闭请求；由于另一端可能还有数据要发，所以 ACK 和 FIN 常分开发出。",
    process:
      "建立连接一般经过 CLOSED、SYN_SENT、SYN_RECEIVED、ESTABLISHED 等状态。关闭连接时，主动关闭方发送 FIN 后进入 FIN_WAIT_1，收到 ACK 后进入 FIN_WAIT_2，收到对方 FIN 后回复 ACK 并进入 TIME_WAIT。TIME_WAIT 不是错误状态，它用于确保最后 ACK 有机会重传，并让旧连接报文在网络中自然消失。",
    complexity:
      "TCP 控制报文的代价主要是一次或多次往返时延。工程实践中，频繁短连接会放大握手挥手成本，因此常使用连接复用、长连接或连接池。TIME_WAIT 过多可能消耗端口和内核资源，但不能简单粗暴删除，需要结合端口复用、连接生命周期和服务端主动/被动关闭策略分析。",
    comparison:
      "TCP 和 UDP 的差异不是“一个安全一个不安全”，而是连接、可靠性、有序性和拥塞控制等语义不同。TLS 才负责常见的传输加密，通常运行在 TCP 之上。三次握手和四次挥手也不同于 HTTP 请求响应：HTTP 是应用层语义，TCP 是传输层连接管理。",
    pseudocode:
      "client: send SYN(seq=x)\nserver: send SYN(seq=y)+ACK(ack=x+1)\nclient: send ACK(ack=y+1)\n...\nactive close: FIN -> ACK -> FIN -> ACK, then TIME_WAIT",
    examples: [
      {
        question: "为什么三次握手不是两次？",
        steps: [
          "第一次 SYN 只能说明客户端尝试发送。",
          "第二次 SYN+ACK 让客户端知道服务端收到自己的 SYN，也知道服务端能发送。",
          "第三次 ACK 让服务端知道客户端收到了服务端的 SYN。",
          "三次后双方都确认发送和接收能力，并完成初始序号同步。",
        ],
        answer:
          "两次握手缺少服务端对客户端确认能力的最终确认，旧 SYN 也可能造成资源浪费；三次握手更稳妥地建立双向可靠连接前提。",
      },
      {
        question: "为什么挥手常常是四次而不是三次？",
        steps: [
          "主动关闭方发送 FIN，表示自己不再发送数据。",
          "被动关闭方先 ACK，表示收到关闭请求。",
          "被动关闭方可能还有应用数据要发，不能立刻 FIN。",
          "数据发送完后被动方再 FIN，主动方 ACK 后进入 TIME_WAIT。",
        ],
        answer:
          "TCP 是全双工连接，两个方向可以独立关闭。ACK 和 FIN 常因应用层剩余数据而分开发出，所以表现为四次挥手。",
      },
    ],
    mistakes: [
      {
        mistake: "把 TCP 描述成加密协议",
        reason: "TCP 提供可靠传输和连接管理，不提供默认加密。",
        correction: "把加密归到 TLS/SSL，把 TCP 归到可靠、有序、拥塞控制和连接管理。",
      },
      {
        mistake: "认为 TIME_WAIT 是异常或必须立即清理",
        reason: "TIME_WAIT 用于重传最后 ACK 和等待旧报文消失，是协议正确性的一部分。",
        correction: "说明 2MSL 等待意义，再讨论连接复用或端口资源优化。",
      },
      {
        mistake: "混淆 SYN、ACK、FIN 的含义",
        reason: "SYN 用于同步序号，ACK 用于确认，FIN 表示本端发送方向关闭。",
        correction: "画出报文方向和状态变化，逐个标注 seq 与 ack 的含义。",
      },
      {
        mistake: "说四次挥手一定严格分四个包",
        reason: "某些情况下 ACK 和 FIN 可能合并，但概念上仍是两个方向的关闭和确认。",
        correction: "区分逻辑步骤和实际报文合并，考试中按典型四次流程说明。",
      },
      {
        mistake: "把流量控制和拥塞控制混为一谈",
        reason: "流量控制关注接收端缓存，拥塞控制关注网络路径负载。",
        correction: "分别用接收窗口和拥塞窗口解释二者目标。",
      },
    ],
    exercises: [
      {
        prompt: "说明三次握手每一步的 SYN/ACK 作用。",
        hint: "按客户端、服务端、客户端三个方向写。",
        answerGuide:
          "第一次 SYN 同步客户端初始序号；第二次 SYN+ACK 确认客户端并同步服务端初始序号；第三次 ACK 确认服务端序号，使服务端进入已建立状态。",
      },
      {
        prompt: "解释 TIME_WAIT 在连接关闭过程中的两个作用。",
        hint: "考虑最后 ACK 丢失和旧报文残留。",
        answerGuide:
          "TIME_WAIT 让主动关闭方可以重传最后 ACK，也让旧连接报文在网络中消失，避免污染相同四元组的新连接。",
      },
      {
        prompt: "判断“TCP 三次握手用于加密通信”是否正确，并说明它真正解决的连接问题。",
        hint: "区分 TCP 与 TLS，再回到序号同步和双向确认。",
        answerGuide:
          "不正确。TCP 握手建立可靠连接并同步双方初始序号，确认双方发送与接收能力；加密通常由 TLS 等协议提供，不属于 TCP 三次握手本身的功能。",
      },
    ],
    summary:
      "TCP 连接管理的主线是同步序号、确认双向收发能力、允许全双工方向分别关闭，并用 TIME_WAIT 保护最后确认和旧报文清理。不要把 TCP 和加密、HTTP 或 UDP 的语义混在一起。",
  };
}

function genericTopic(context) {
  const kp = context.knowledgePoint;
  return {
    objects: `${kp} 的对象、输入、输出、状态和约束`,
    constraints: "定义边界清楚、执行步骤可追踪、结果能用反例或边界条件验证",
    definition: `${kp} 的核心学习任务是把定义、适用条件和操作过程连成一个可验证整体。不要只背概念名称，而要说明它解决什么问题、依赖哪些前提、输出什么结果，以及哪些相邻概念容易混淆。`,
    mechanism: `理解 ${kp} 时，先找出关键状态，再观察每一步如何改变状态。若存在算法或系统机制，就用输入、处理、输出三段描述；若存在协议或结构，就用参与者、约束和状态迁移描述。`,
    process: `建议按四步学习：定义对象，列约束；拆过程，标状态；做例题，查边界；写总结，连到后续知识点。这样能避免把 ${kp} 学成孤立术语。`,
    complexity: `复杂度或工程代价取决于 ${kp} 的具体实现。即使题目不要求代码，也应说明时间、空间、通信、同步或维护成本中的至少一类。`,
    comparison: `${kp} 需要和同课程中的相邻知识点比较：比较对象不同、约束不同、适用场景不同和常见错误不同。比较不是背表格，而是解释为什么在某个条件下选它。`,
    pseudocode:
      "输入: 问题条件\n步骤1: 明确定义和约束\n步骤2: 跟踪关键状态变化\n步骤3: 用边界条件验证\n输出: 结论、复杂度和易错提醒",
    examples: [
      {
        question: `如何系统分析 ${kp}？`,
        steps: ["写出对象和目标。", "列出前置条件。", "拆解状态变化。", "用边界样例验证。"],
        answer: "一个完整答案应包含定义、过程、边界、代价和至少一个反例说明。",
      },
      {
        question: `如何判断 ${kp} 与相邻概念的区别？`,
        steps: ["先比较解决的问题。", "再比较输入输出。", "再比较限制条件。", "最后比较错误后果。"],
        answer: "区别应落到适用条件和操作结果，而不是只背名称。",
      },
    ],
    mistakes: [
      {
        mistake: "只背结论",
        reason: "没有前提和边界，结论无法迁移到新题。",
        correction: "每个结论后补一句适用条件。",
      },
      {
        mistake: "忽略过程状态",
        reason: "计算机专业问题通常依赖状态变化。",
        correction: "用表格记录每一步状态。",
      },
      {
        mistake: "不做反例检查",
        reason: "相邻概念容易在极端输入下区分。",
        correction: "至少构造一个最小样例和一个边界样例。",
      },
    ],
    exercises: [
      {
        prompt: `用三句话解释 ${kp} 的定义、输入和输出。`,
        hint: "不要写口号，要有对象和限制条件。",
        answerGuide: "应包含对象、操作或机制、适用条件和结果。",
      },
      {
        prompt: `给出一个 ${kp} 的边界场景。`,
        hint: "选择最小输入、空输入或极端状态。",
        answerGuide: "说明边界为什么成立，以及错误处理方式。",
      },
      {
        prompt: `比较 ${kp} 与一个相邻概念。`,
        hint: "从目标、约束、代价三个角度比较。",
        answerGuide: "至少写出一个相同点和两个不同点，并解释适用场景。",
      },
    ],
    summary: `${kp} 的学习闭环是定义、机制、示例、练习、纠错和总结。`,
  };
}

function profileSentence(context) {
  const facts = [];
  if (context.major || context.grade)
    facts.push(`${context.major || "计算机相关专业"}${context.grade || ""}`);
  if (context.currentCourse) facts.push(`当前课程为${context.currentCourse}`);
  if ((context.priorKnowledge || []).length)
    facts.push(`已有基础包括${context.priorKnowledge.slice(0, 2).join("、")}`);
  if ((context.learningGoals || []).length)
    facts.push(`学习目标是${context.learningGoals.slice(0, 2).join("、")}`);
  if ((context.resourcePreferences || []).length)
    facts.push(`资源偏好为${context.resourcePreferences.slice(0, 2).join("、")}`);
  if (context.paceAndTimeBudget?.weeklyTimeBudgetMinutes)
    facts.push(`每周时间预算约${context.paceAndTimeBudget.weeklyTimeBudgetMinutes}分钟`);
  return facts.length ? facts.join("；") : "当前没有完整学习画像，采用通用计算机专业学习模式。";
}

function profileFact(context, kind) {
  if (kind === "prior" && (context.priorKnowledge || []).length)
    return `结合你的已有基础“${context.priorKnowledge.slice(0, 2).join("、")}”，这里会补足必要前置知识。`;
  if ((context.learningGoals || []).length) return `这也服务于你的目标“${context.learningGoals[0]}”。`;
  return "如果个人画像后续补充，本段可以进一步调整例题和练习顺序。";
}

function enrichStudyNoteContent(content, context) {
  const kp = context.knowledgePoint || "当前知识点";
  content.coreConcepts.forEach((item, index) => {
    item.explanation = appendWithin(
      item.explanation,
      `阅读本段时，请把“${kp}”放回当前阶段目标中复核：先判断它解决的问题，再判断它依赖的前提，最后判断它和相邻概念的差别。第${index + 1}个区段的重点不是增加术语，而是形成可迁移的判断步骤。`,
      880,
    );
  });
  content.diagrams.forEach((item, index) => {
    item.description = appendWithin(
      item.description,
      `如果你在图中发现某个状态无法解释，就回到前置条件重新标注；这一步能把静态定义转成动态过程，特别适合在复习第${index + 1}轮时检查遗漏。`,
      680,
    );
    item.steps.push("用一句话写出本步骤的判断依据，避免只画形状不解释原因。");
  });
  content.workedExamples.forEach((item, index) => {
    item.steps.push("把本例的结论和前面的核心性质逐项对应，说明哪些条件被使用。");
    item.steps.push("再构造一个相邻但不同的情形，检查是否会触发不同处理。");
    item.answer = appendWithin(
      item.answer,
      `本例的价值在于把 ${kp} 的规则落到可复核步骤上。若考试或项目中遇到相似问题，先复述条件，再执行动作，最后用边界情况验证；不要直接跳到结论。`,
      580,
    );
  });
  content.commonMistakes.forEach((item, index) => {
    item.reason = appendWithin(
      item.reason,
      `这个错误常出现在第${index + 1}类题目迁移时，因为学生会记住表面关键词，却没有同步检查触发条件和状态变化。`,
      480,
    );
    item.correction = appendWithin(
      item.correction,
      `修正时请固定使用“条件、动作、验证”三栏，并把最近一次错题或练习中的证据写进去。`,
      480,
    );
  });
  content.practiceTasks.forEach((item, index) => {
    item.hint = appendWithin(
      item.hint,
      `先写关键词，再补完整句；第${index + 1}题至少说明一个边界条件。`,
      360,
    );
    item.answerGuide = appendWithin(
      item.answerGuide,
      `评分时看三点：是否说清定义，是否解释过程，是否用边界或反例验证。答案不要求逐字一致，但必须能支撑结论。`,
      560,
    );
  });
  return content;
}

function appendWithin(base, extra, limit) {
  const value = `${String(base || "").trim()}${String(extra || "").trim() ? ` ${extra}` : ""}`;
  return value.slice(0, limit);
}

module.exports = { buildDetailedStudyNoteContent, topicBlueprint };
