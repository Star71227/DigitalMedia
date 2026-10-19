/* 项目原创部分：本文件的智课研伴业务实现与集成逻辑。第三方导入库及其内部实现不属于本项目原创；AI 辅助研发见 AI_CODING_DISCLOSURE.md。此标注依据项目源码边界，非作者身份或逐行溯源证明。 */
const { topicBlueprint } = require("./studyNoteFallbackService");
const { normalizeMindMapContent } = require("./mindMapNormalizationService");

function buildStructuredMindMapContent(context, options = {}) {
  const citations = Array.isArray(options.citations) ? options.citations : [];
  const text = `${context.subject || ""} ${context.knowledgePoint || ""}`.toLowerCase();
  const content = /红黑树|red.?black/.test(text)
    ? redBlackTreeMap(context, citations)
    : /进程|线程|上下文|调度/.test(text)
      ? processThreadMap(context, citations)
      : isTcpTopic(text)
        ? tcpMap(context, citations)
        : genericMap(context, citations);
  prepareFallbackContent(content);
  return normalizeMindMapContent(content, { repairIds: true });
}

function isTcpTopic(text) {
  return /握手|挥手|time_wait|连接/.test(text) || /\btcp\b|\bsyn\b|\back\b|\bfin\b/.test(text);
}

function prepareFallbackContent(content) {
  if (!content?.root) return content;
  content.root.id = "root";
  for (const child of array(content.root.children)) {
    if (countChinese(child.description) < 44) {
      child.description = limit(
        `${child.description || ""} 这一分支还会连接定义、条件、步骤和易错辨析，帮助学生把零散术语整理成可检查的学习路径。`,
        490,
      );
    }
  }
  return content;
}

function redBlackTreeMap(context, citations) {
  const p = profileNotes(context);
  const root = node(
    "rbt-root",
    context.knowledgePoint,
    `围绕${context.knowledgePoint}建立结构、性质、插入修复和复杂度之间的知识网络。${p.mastery}导图按${p.preference}安排，先解释颜色约束和旋转关系，再进入伪代码、例题与408复习辨析。`,
    "root",
    "high",
    [
      node(
        "rbt-structure",
        "结构对象与颜色约束",
        `先区分红黑树的节点、颜色、NIL叶子、父子指针和二叉搜索树顺序。${p.prior}这一分支帮助你把“近似平衡”落到可检查的路径约束上，而不是把红黑树误记成严格平衡树。`,
        "concept",
        "high",
        [
          citedNode(
            "rbt-color",
            "节点颜色与NIL叶子",
            "每个真实节点带红或黑两种颜色，空叶子通常按黑色哨兵理解；插入修复判断叔叔节点时，空叔叔要归入黑色分支。",
            "concept",
            citations,
            0,
          ),
          node(
            "rbt-bst-order",
            "二叉搜索树顺序",
            "红黑树首先仍是二叉搜索树，任意旋转都必须保持中序遍历的键值顺序；颜色修复不能破坏查找路径的大小关系。",
            "condition",
            "high",
          ),
          citedNode(
            "rbt-black-height",
            "黑高一致约束",
            "从任一节点到其所有后代叶子的黑节点数量必须一致，插入修复中的变色和旋转都要服务于这个全局约束。",
            "condition",
            citations,
            1,
          ),
          node(
            "rbt-root-rule",
            "根节点最终为黑",
            "变色上推可能把原根染红，所以插入修复循环结束后必须统一把根节点设为黑色，避免违反根黑性质。",
            "warning",
            "high",
          ),
        ],
      ),
      node(
        "rbt-insert-trigger",
        "插入触发与初始状态",
        `插入不是直接套三种情况，而是先按二叉搜索树定位，再观察新节点、父节点、叔叔节点和祖父节点的局部关系。${p.goal}`,
        "step",
        "high",
        [
          node(
            "rbt-bst-insert",
            "普通BST插入定位",
            "新键先沿查找路径落到叶子位置，这一步只使用大小比较，不考虑颜色；定位错误会让后续旋转全部失去前提。",
            "step",
            "high",
          ),
          node(
            "rbt-new-red",
            "新节点标红原因",
            "新节点通常先标为红色，因为这样不立即增加路径黑高；若父节点为黑，插入后所有红黑性质自然保持。",
            "concept",
            "high",
          ),
          node(
            "rbt-parent-color",
            "父节点颜色判断",
            "父节点为黑时修复结束；父节点为红时出现连续红冲突，必须继续看叔叔颜色和内外侧结构。",
            "condition",
            "high",
          ),
          node(
            "rbt-null-uncle",
            "空叔叔视为黑色",
            "很多题目不画NIL叶子，学生容易把空叔叔漏掉；正确做法是把空叔叔作为黑色处理，进入旋转修复场景。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "rbt-recolor",
        "变色与冲突上推",
        `父红叔红时优先变色，因为局部两侧黑高可以保持；冲突可能移动到祖父节点，需要沿路径继续检查。${p.time}`,
        "step",
        "high",
        [
          citedNode(
            "rbt-parent-uncle-red",
            "父红叔红处理",
            "当父节点和叔叔节点都为红色时，父与叔改黑，祖父改红；这不改变祖父左右两条路径的黑节点数量。",
            "step",
            citations,
            2,
          ),
          node(
            "rbt-grandparent-red",
            "祖父变红的影响",
            "祖父变红后可能和自己的父节点形成新的连续红，因此当前检查点要上移到祖父，而不是直接宣告修复完成。",
            "condition",
            "medium",
          ),
          node(
            "rbt-recolor-stop",
            "上推终止条件",
            "上推遇到黑父节点或到达根节点时停止；根节点最后置黑可以吸收最高层的红色冲突。",
            "step",
            "medium",
          ),
          node(
            "rbt-mis-black-height",
            "易错：只变色不复核黑高",
            "错误认知是只记父叔祖颜色变化；正确结论是每次变色后都要说明黑高为何不变，原因是两条子路径同时增加同等黑节点。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "rbt-rotation",
        "旋转修复与顺序保持",
        `父红叔黑时依靠旋转消除连续红。${p.preference}，因此这里先画局部三代关系，再对照伪代码检查父指针、子树接回和根更新。`,
        "step",
        "high",
        [
          node(
            "rbt-left-rotate",
            "左旋局部关系",
            "左旋以某节点x和右孩子y为核心，把y的左子树接为x的右子树，再让x成为y的左孩子；中序顺序保持不变。",
            "step",
            "high",
          ),
          node(
            "rbt-right-rotate",
            "右旋镜像关系",
            "右旋是左旋的镜像，以左孩子上升、原节点下降为右孩子；理解时应同时写出子树接回和父指针更新。",
            "step",
            "high",
          ),
          node(
            "rbt-inner-outer",
            "内侧转外侧",
            "左-右或右-左内侧结构要先旋转父节点转成外侧，再旋转祖父节点；直接旋转祖父容易漏掉连续红。",
            "condition",
            "high",
          ),
          node(
            "rbt-pointer-update",
            "易错：旋转后漏父指针",
            "错误认知是旋转只交换两个节点；正确做法还要更新子树、父节点链接和全局根指针，原因是树结构必须保持连通。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "rbt-practice",
        "复杂度、示例与复习顺序",
        `这一分支把结构规则落到例题、伪代码和复习路径。${p.resource}完成导图后建议按“性质检查、插入分类、旋转指针、复杂度”顺序复述。`,
        "summary",
        "high",
        [
          node(
            "rbt-example-10-20-30",
            "示例：插入10、20、30触发左旋",
            "依次插入10、20、30会形成右右外侧结构，父红叔黑时对祖父10左旋并交换颜色，旋转后20成为局部根且中序仍为10、20、30。",
            "example",
            "high",
          ),
          node(
            "rbt-example-red-uncle",
            "示例：父叔同红只变色",
            "若新节点父亲和叔叔均为红色，先父叔变黑、祖父变红，再把检查点移到祖父；该例强调变色上推不是旋转。",
            "example",
            "high",
          ),
          node(
            "rbt-pseudocode",
            "伪代码：插入修复循环",
            "while parent(x) is RED：若uncle为红则变色并上移；否则先把内侧转外侧，再旋转祖父并交换颜色；循环后root.color=BLACK。",
            "code",
            "high",
            [
              node(
                "rbt-code-condition",
                "条件顺序检查",
                "先判父红，再判叔叔颜色，最后判内外侧；顺序颠倒会把父叔同红误做旋转。",
                "step",
                "medium",
              ),
              node(
                "rbt-code-verify",
                "每轮修复后验证",
                "验证连续红是否消除、黑高是否保持、中序顺序是否不变，并确认根指针没有断裂。",
                "step",
                "medium",
              ),
            ],
          ),
          node(
            "rbt-complexity",
            "复杂度与工程应用",
            "查找插入位置和变色上推最多沿树高进行，时间O(log n)；旋转次数最多2次，额外空间O(1)，常用于有序映射集合。",
            "concept",
            "medium",
          ),
          node(
            "rbt-review-order",
            "复习顺序：性质到代码",
            "先背五条性质，再画父叔祖局部图，随后手推两个插入例子，最后写伪代码和复杂度；这样能服务408目标和代码实现。",
            "summary",
            "high",
          ),
        ],
      ),
    ],
  );
  return withLists(
    root,
    [
      ["rbt-left-rotate", "rbt-bst-order", "旋转必须保持二叉搜索树中序顺序，否则查找路径会被破坏。"],
      ["rbt-parent-uncle-red", "rbt-black-height", "父叔同红的变色修复依赖两侧黑高同步保持。"],
      ["rbt-null-uncle", "rbt-inner-outer", "空叔叔属于叔黑场景，会直接影响是否进入旋转修复。"],
      ["rbt-pseudocode", "rbt-root-rule", "伪代码末尾强制根为黑，是处理上推到根节点的统一收束。"],
    ],
    ["rbt-structure", "rbt-recolor", "rbt-rotation"],
    ["rbt-null-uncle", "rbt-mis-black-height", "rbt-pointer-update"],
    [
      "rbt-structure",
      "rbt-bst-order",
      "rbt-black-height",
      "rbt-insert-trigger",
      "rbt-parent-color",
      "rbt-recolor",
      "rbt-rotation",
      "rbt-pseudocode",
      "rbt-review-order",
    ],
  );
}

function processThreadMap(context, citations) {
  const p = profileNotes(context);
  const root = node(
    "pt-root",
    context.knowledgePoint,
    `围绕${context.knowledgePoint}梳理程序、进程、线程、调度和上下文切换之间的真实关系。${p.preference}导图先给资源边界，再进入切换流程和并发辨析。`,
    "root",
    "high",
    [
      node(
        "pt-entity",
        "运行实体与资源边界",
        `这一分支区分静态程序、动态进程和线程执行流。${p.mastery}先把资源归属讲清楚，再看CPU如何切换执行对象。`,
        "concept",
        "high",
        [
          citedNode(
            "pt-program",
            "程序是静态指令集合",
            "程序通常是磁盘上的可执行文件或代码集合，本身不拥有运行时地址空间；同一个程序可以启动多个进程实例。",
            "concept",
            citations,
            0,
          ),
          citedNode(
            "pt-process",
            "进程是资源分配单位",
            "进程是程序的一次运行实例，拥有独立地址空间、打开文件、资源句柄和至少一个线程，是操作系统隔离资源的基本边界。",
            "concept",
            citations,
            1,
          ),
          node(
            "pt-thread",
            "线程是调度执行流",
            "线程存在于进程内部，是CPU调度的执行流；同一进程的多个线程共享进程资源，但各自有执行现场。",
            "concept",
            "high",
          ),
          node(
            "pt-address-space",
            "地址空间隔离",
            "不同进程默认拥有不同虚拟地址空间，切换进程时可能影响页表和TLB；这也是进程切换通常更重的原因。",
            "condition",
            "high",
          ),
        ],
      ),
      node(
        "pt-thread-memory",
        "线程共享与私有状态",
        `线程学习的关键不是“轻量”口号，而是精确区分共享和私有内容。${p.prior}`,
        "concept",
        "high",
        [
          node(
            "pt-shared-heap",
            "共享代码段、数据段和堆",
            "同一进程内线程通常共享代码段、全局数据和堆内存，因此通信方便，但共享写入也容易产生竞态条件。",
            "concept",
            "high",
          ),
          node(
            "pt-private-stack",
            "独立栈和寄存器现场",
            "每个线程有自己的栈、程序计数器、寄存器值和线程控制块；这些私有状态决定它能从被切走的位置恢复执行。",
            "concept",
            "high",
          ),
          node(
            "pt-race",
            "示例：两个线程修改计数器",
            "两个线程同时执行count++时，读、加、写可能交错，两个加一最终只写回一次；该例说明共享内存必须同步。",
            "example",
            "high",
          ),
          node(
            "pt-mis-independent",
            "易错：把线程写成独立进程",
            "错误认知是线程完全独立拥有资源；正确结论是线程共享进程地址空间但有独立执行现场，原因是线程属于同一进程。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "pt-scheduling",
        "调度触发与上下文保存",
        `调度回答“下一个运行谁”，上下文切换回答“怎样安全切过去”。${p.time}`,
        "step",
        "high",
        [
          node(
            "pt-trigger",
            "时钟中断、阻塞和系统调用触发",
            "上下文切换常由时间片用完、线程阻塞I/O、主动让出CPU或更高优先级任务就绪触发，不等同于进程创建。",
            "condition",
            "high",
          ),
          node(
            "pt-save",
            "保存旧线程现场",
            "内核保存当前线程寄存器、程序计数器、栈指针和状态，把它放回就绪或阻塞队列，确保之后能继续执行。",
            "step",
            "high",
          ),
          node(
            "pt-restore",
            "恢复新线程现场",
            "调度器选出下一个可运行线程后，必要时切换地址空间，再恢复目标线程寄存器和程序计数器。",
            "step",
            "high",
          ),
          node(
            "pt-pseudocode",
            "伪代码：调度路径",
            "伪代码顺序是中断或陷入后保存当前线程现场，调度器选择下一个可运行线程；若属于不同进程则切换地址空间，最后恢复目标线程寄存器并返回执行。",
            "code",
            "high",
            [
              node(
                "pt-code-state",
                "状态更新顺序",
                "必须先记录当前线程是ready还是blocked，再选择下一个线程；否则会丢失调度队列中的真实状态。",
                "step",
                "medium",
              ),
              node(
                "pt-code-address",
                "地址空间条件切换",
                "只有目标线程属于不同进程时才需要切换地址空间，同进程线程切换通常不换页表。",
                "step",
                "medium",
              ),
            ],
          ),
        ],
      ),
      node(
        "pt-concurrency",
        "并发同步与性能代价",
        `这一分支把调度机制连到工程后果，避免把多线程简单等同于更快。${p.goal}`,
        "concept",
        "high",
        [
          node(
            "pt-concurrency-parallel",
            "并发与并行辨析",
            "并发是在一段时间内交替推进多个任务，并行是在同一时刻多个核心同时执行；单核可以并发但不能真正并行。",
            "misconception",
            "high",
          ),
          node(
            "pt-switch-cost",
            "切换成本来源",
            "上下文切换会带来寄存器保存恢复、缓存或TLB影响、调度队列维护和锁竞争；过度切换会降低吞吐。",
            "concept",
            "medium",
          ),
          node(
            "pt-lock",
            "临界区同步",
            "多个线程修改共享数据时需要互斥锁、原子操作或其他同步机制，不能依赖切换速度避免竞态。",
            "condition",
            "high",
          ),
          node(
            "pt-mis-faster",
            "易错：多线程一定更快",
            "错误认知是线程越多越快；正确结论取决于核心数、任务类型、锁竞争和切换成本，原因是线程本身也消耗调度资源。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "pt-review",
        "案例、边界与复习顺序",
        `通过案例把抽象机制落到可判断问题。${p.resource}复习时按实体边界、共享私有、切换流程、同步代价四步回顾。`,
        "summary",
        "high",
        [
          node(
            "pt-browser-example",
            "示例：浏览器标签页隔离",
            "现代浏览器常把标签页或站点隔离到不同进程；一个标签页脚本卡住时，其他进程仍可能被内核调度并保持响应。",
            "example",
            "high",
          ),
          node(
            "pt-process-switch-example",
            "示例：进程切换比线程切换更重",
            "从进程A切到进程B时可能切换地址空间并影响TLB；同进程线程切换保留地址空间，但仍保存和恢复执行现场。",
            "example",
            "medium",
          ),
          node(
            "pt-mis-scheduler",
            "易错：混淆调度和切换",
            "错误认知是调度等于上下文切换；正确结论是调度是决策，切换是保存恢复现场的执行过程，原因是二者发生在同一内核路径但职责不同。",
            "misconception",
            "high",
          ),
          node(
            "pt-time-budget",
            "分段复习建议",
            "先用10分钟画进程与线程资源表，再用15分钟复述切换伪代码，最后用15分钟分析计数器竞态和浏览器隔离案例。",
            "summary",
            "medium",
          ),
        ],
      ),
    ],
  );
  return withLists(
    root,
    [
      ["pt-address-space", "pt-switch-cost", "进程地址空间切换会影响页表和TLB，是进程切换成本高的重要来源。"],
      ["pt-shared-heap", "pt-lock", "线程共享堆内存带来通信便利，也直接引出临界区同步需求。"],
      ["pt-trigger", "pt-switch-cost", "中断或阻塞触发的切换越频繁，保存恢复现场和缓存失效成本越明显。"],
      [
        "pt-concurrency-parallel",
        "pt-browser-example",
        "浏览器案例能帮助区分时间段内并发响应和多核上的真正并行。",
      ],
    ],
    ["pt-entity", "pt-scheduling", "pt-concurrency"],
    ["pt-mis-independent", "pt-concurrency-parallel", "pt-mis-faster", "pt-mis-scheduler"],
    [
      "pt-entity",
      "pt-process",
      "pt-thread",
      "pt-thread-memory",
      "pt-scheduling",
      "pt-pseudocode",
      "pt-concurrency",
      "pt-review",
    ],
  );
}

function tcpMap(context, citations) {
  const p = profileNotes(context);
  const root = node(
    "tcp-root",
    context.knowledgePoint,
    `围绕${context.knowledgePoint}梳理TCP三次握手、可靠传输、四次挥手和TIME_WAIT之间的关系。${p.preference}先画状态与报文，再进入序号确认和易错辨析。`,
    "root",
    "high",
    [
      node(
        "tcp-connection",
        "连接语义与报文角色",
        `TCP不是加密协议，而是面向连接、可靠、有序的字节流传输协议。${p.mastery}这一分支先区分SYN、ACK、FIN和序号确认。`,
        "concept",
        "high",
        [
          citedNode(
            "tcp-syn",
            "SYN同步初始序号",
            "SYN用于发起连接并同步一端的初始序号，第一次握手中客户端发送SYN，第二次握手中服务端发送SYN+ACK。",
            "concept",
            citations,
            0,
          ),
          node(
            "tcp-ack",
            "ACK确认已收到",
            "ACK确认对方报文和序号范围，握手、数据传输和挥手都依赖ACK确认状态推进。",
            "concept",
            "high",
          ),
          node(
            "tcp-fin",
            "FIN关闭发送方向",
            "FIN表示本端没有更多数据要发送，但不代表对方也立即没有数据，因此TCP关闭常体现为两个方向分别关闭。",
            "concept",
            "high",
          ),
          node(
            "tcp-mis-encrypt",
            "易错：把TCP当加密协议",
            "错误认知是TCP三次握手用于加密；正确结论是TCP负责连接和可靠传输，加密通常由TLS提供，原因是二者位于不同协议层。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "tcp-handshake",
        "三次握手与双向确认",
        `三次握手的核心是双方都确认自己能发、对方能收、对方能发、自己能收。${p.goal}`,
        "step",
        "high",
        [
          citedNode(
            "tcp-first",
            "第一次：客户端SYN",
            "客户端从CLOSED进入SYN_SENT，发送SYN(seq=x)，说明它希望建立连接并给出自己的初始序号。",
            "step",
            citations,
            1,
          ),
          node(
            "tcp-second",
            "第二次：服务端SYN+ACK",
            "服务端收到SYN后进入SYN_RECEIVED，回复SYN(seq=y)+ACK(ack=x+1)，同时确认客户端序号并提供服务端序号。",
            "step",
            "high",
          ),
          node(
            "tcp-third",
            "第三次：客户端ACK",
            "客户端回复ACK(ack=y+1)，让服务端确认客户端已收到服务端SYN，双方随后进入ESTABLISHED状态。",
            "step",
            "high",
          ),
          node(
            "tcp-mis-two",
            "易错：认为两次握手足够",
            "错误认知是服务端回复后连接就安全建立；正确结论是第三次ACK让服务端确认客户端接收能力，也减少历史SYN造成半开连接。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "tcp-reliability",
        "可靠传输与流量控制",
        `连接建立后，可靠性来自序号、确认、重传、滑动窗口和拥塞控制的组合，不是来自单个ACK。${p.prior}`,
        "concept",
        "high",
        [
          node(
            "tcp-seq-ack",
            "序列号与确认号",
            "TCP按字节编号，ACK通常表示期望收到的下一个字节序号；这让接收方可以确认连续数据并发现缺口。",
            "concept",
            "high",
          ),
          node(
            "tcp-retransmit",
            "超时与重复ACK重传",
            "数据段丢失时，发送方可根据超时或重复ACK触发重传；重传提升可靠性，但不代表网络不会丢包。",
            "step",
            "high",
          ),
          node(
            "tcp-window",
            "接收窗口与拥塞窗口",
            "接收窗口服务于流量控制，避免压垮接收端；拥塞窗口服务于拥塞控制，避免压垮网络路径。",
            "condition",
            "high",
          ),
          node(
            "tcp-mis-absolute",
            "易错：TCP绝对可靠",
            "错误认知是TCP保证任何情况下都成功送达；正确结论是TCP在连接存续和资源允许时尽力可靠，异常断电、超时或复位仍可能失败。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "tcp-close",
        "四次挥手与TIME_WAIT",
        `TCP是全双工连接，两个方向可以分别关闭。${p.time}这一分支按状态迁移理解FIN、ACK和TIME_WAIT。`,
        "step",
        "high",
        [
          node(
            "tcp-fin1",
            "主动关闭方发送FIN",
            "主动关闭方发送FIN后进入FIN_WAIT_1，表示自己不再发送数据，但仍可接收对方尚未发送完的数据。",
            "step",
            "high",
          ),
          node(
            "tcp-ack-fin",
            "被动方先ACK后FIN",
            "被动关闭方先ACK确认对方FIN，等应用数据发送完再发送自己的FIN；ACK和FIN因此常分开发出。",
            "step",
            "high",
          ),
          node(
            "tcp-time-wait",
            "TIME_WAIT保护最后ACK",
            "主动关闭方最后回复ACK后进入TIME_WAIT，用于重传最后ACK并等待旧连接报文在网络中消失。",
            "condition",
            "high",
          ),
          node(
            "tcp-mis-four",
            "易错：四次挥手必定四个包",
            "错误认知是实际报文永远严格四个；正确结论是逻辑上有两个方向的关闭和确认，某些ACK与FIN可能合并。",
            "misconception",
            "medium",
          ),
        ],
      ),
      node(
        "tcp-practice",
        "协议过程、案例与复习顺序",
        `把握手、传输和挥手连成一条状态线，避免把TCP、HTTP和TLS混在一起。${p.resource}`,
        "summary",
        "high",
        [
          node(
            "tcp-example-syn-loss",
            "示例：SYN丢失后的重传",
            "客户端发送SYN后若未收到SYN+ACK，会在超时后重传SYN；该例说明连接建立依赖确认与重试，而不是一次报文必达。",
            "example",
            "high",
          ),
          node(
            "tcp-example-time-wait",
            "示例：最后ACK丢失",
            "若主动关闭方最后ACK丢失，被动方会重发FIN；TIME_WAIT中的主动方可以再次发送ACK，保证关闭过程收束。",
            "example",
            "high",
          ),
          node(
            "tcp-pseudocode",
            "伪代码：连接状态推进",
            "连接建立按客户端发送SYN、服务端回复SYN加ACK、客户端再ACK推进；连接关闭按FIN、ACK、FIN、ACK和TIME_WAIT收束，学习时要同步标注seq与ack。",
            "code",
            "high",
            [
              node(
                "tcp-code-seq",
                "序号确认检查",
                "每一步都写出seq和ack，能防止把确认号理解成固定常数。",
                "step",
                "medium",
              ),
              node(
                "tcp-code-state",
                "状态名辅助记忆",
                "建立阶段关注SYN_SENT和SYN_RECEIVED，关闭阶段关注FIN_WAIT、CLOSE_WAIT、LAST_ACK和TIME_WAIT，状态名能帮助判断报文方向。",
                "step",
                "medium",
              ),
            ],
          ),
          node(
            "tcp-review-order",
            "复习顺序：报文到状态",
            "先背SYN/ACK/FIN含义，再画三次握手，随后补可靠传输机制，最后解释四次挥手和TIME_WAIT。",
            "summary",
            "medium",
          ),
        ],
      ),
    ],
  );
  return withLists(
    root,
    [
      ["tcp-syn", "tcp-seq-ack", "握手同步初始序号，后续可靠传输依赖序列号和确认号继续推进。"],
      ["tcp-retransmit", "tcp-time-wait", "重传思想也体现在关闭阶段，TIME_WAIT让最后ACK具备重传机会。"],
      ["tcp-fin", "tcp-ack-fin", "FIN只关闭一个发送方向，因此ACK和FIN常常需要分开处理。"],
      ["tcp-mis-encrypt", "tcp-handshake", "理解握手目的可以避免把TCP连接建立误写成加密协商。"],
    ],
    ["tcp-handshake", "tcp-reliability", "tcp-close"],
    ["tcp-mis-encrypt", "tcp-mis-two", "tcp-mis-absolute", "tcp-mis-four"],
    [
      "tcp-connection",
      "tcp-handshake",
      "tcp-first",
      "tcp-second",
      "tcp-third",
      "tcp-reliability",
      "tcp-close",
      "tcp-pseudocode",
      "tcp-review-order",
    ],
  );
}

function genericMap(context, citations) {
  const p = profileNotes(context);
  const topic = topicBlueprint(context);
  const kp = context.knowledgePoint || "当前知识点";
  const root = node(
    "topic-root",
    kp,
    `围绕${kp}建立对象、条件、机制、示例、易错点和复习顺序之间的结构化关系。${p.preference}${p.mastery}`,
    "root",
    "high",
    [
      node(
        "topic-objects",
        "对象边界与前置条件",
        `先回答${kp}讨论哪些对象、输入、输出、状态和约束。${p.prior}这一分支用于防止只背名词而不说明成立条件。`,
        "concept",
        "high",
        [
          citedNode(
            "topic-object-list",
            "核心对象清单",
            `${topic.objects}。这些对象必须和输入、输出、状态变化一起理解，才能判断${kp}在题目中真正解决的问题。`,
            "concept",
            citations,
            0,
          ),
          node("topic-condition-list", "适用条件清单", topic.constraints, "condition", "high"),
          node(
            "topic-boundary",
            "边界输入识别",
            `学习${kp}时要找最小输入、空输入或极端状态，因为边界最能暴露定义是否真正理解。`,
            "condition",
            "medium",
          ),
          node(
            "topic-mis-name",
            "易错：只背术语",
            "错误认知是记住名称就会做题；正确结论是必须写出对象、条件和结果，原因是计算机专业问题依赖可验证状态。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "topic-mechanism",
        "机制状态与执行过程",
        `这一分支把${kp}拆成条件、动作和验证三栏。${p.preference}，因此先画过程再写伪代码。`,
        "step",
        "high",
        [
          citedNode("topic-mechanism-core", "关键机制说明", topic.mechanism, "concept", citations, 1),
          node("topic-process-steps", "过程步骤拆分", topic.process, "step", "high"),
          node("topic-pseudocode", "伪代码：条件驱动分析", topic.pseudocode, "code", "high", [
            node(
              "topic-code-input",
              "输入条件检查",
              "先写出题目给定对象和限制条件，不满足条件时不能强行套用后续步骤。",
              "step",
              "medium",
            ),
            node(
              "topic-code-output",
              "输出结论验证",
              "最后输出结论、复杂度或错误边界，并用反例确认结论不越界。",
              "step",
              "medium",
            ),
          ]),
          node(
            "topic-mis-process",
            "易错：跳过状态变化",
            "错误认知是直接写结论；正确结论是过程题必须说明每一步状态如何变化，原因是结果依赖中间状态保持。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "topic-comparison",
        "相邻概念与代价比较",
        `把${kp}放回课程网络中，比较相邻概念的目标、约束和代价。${p.goal}`,
        "concept",
        "high",
        [
          node("topic-comparison-core", "目标差异比较", topic.comparison, "concept", "high"),
          node("topic-cost", "复杂度或工程代价", topic.complexity, "concept", "medium"),
          node(
            "topic-choice",
            "适用场景选择",
            `当题目给出不同约束时，要说明为什么选择${kp}，以及哪些条件改变后应该换用相邻机制。`,
            "condition",
            "medium",
          ),
          node(
            "topic-mis-compare",
            "易错：相似概念混用",
            "错误认知是看到关键词就套同一答案；正确结论是先比较目标和约束，原因是相似术语可能服务不同问题。",
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "topic-examples",
        "例题案例与错误辨析",
        `通过具体例题检查${kp}是否能迁移。${p.resource}每个例子都要写条件、步骤和结论。`,
        "example",
        "high",
        [
          node(
            "topic-example-one",
            `示例：${topic.examples[0]?.question || `系统分析${kp}`}`,
            `${array(topic.examples[0]?.steps).join("；")}。结论：${topic.examples[0]?.answer || "答案必须包含定义、过程和边界验证。"}`,
            "example",
            "high",
          ),
          node(
            "topic-example-two",
            `案例：${topic.examples[1]?.question || `比较${kp}与相邻概念`}`,
            `${array(topic.examples[1]?.steps).join("；")}。结论：${topic.examples[1]?.answer || "比较要落到目标、约束和结果差异。"}`,
            "example",
            "medium",
          ),
          node(
            "topic-mistake-one",
            `易错：${topic.mistakes[0]?.mistake || "忽略前提条件"}`,
            `${topic.mistakes[0]?.reason || "没有前提就无法判断结论是否成立。"}正确做法：${topic.mistakes[0]?.correction || "每个结论后补充适用条件。"}`,
            "misconception",
            "high",
          ),
          node(
            "topic-mistake-two",
            `易错：${topic.mistakes[1]?.mistake || "忽略过程状态"}`,
            `${topic.mistakes[1]?.reason || "状态变化是计算机问题的关键证据。"}正确做法：${topic.mistakes[1]?.correction || "用表格记录每一步状态。"}`,
            "misconception",
            "high",
          ),
        ],
      ),
      node(
        "topic-review",
        "学习路径与复习顺序",
        `最后把${kp}整理成可执行复习路线。${p.time}先复述定义，再做过程例题，最后用错题检查迁移。`,
        "summary",
        "high",
        [
          node(
            "topic-review-order",
            "复习顺序清单",
            `定义对象 -> 列约束 -> 跟踪过程 -> 比较相邻概念 -> 做例题 -> 复盘易错点，这是学习${kp}的闭环。`,
            "summary",
            "high",
          ),
          node(
            "topic-practice-one",
            `练习：${topic.exercises[0]?.prompt || `解释${kp}定义和边界`}`,
            `${topic.exercises[0]?.hint || "先写关键词再补完整句。"}参考：${topic.exercises[0]?.answerGuide || "答案要包含对象、条件和结果。"}`,
            "example",
            "medium",
          ),
          node(
            "topic-practice-two",
            `练习：${topic.exercises[1]?.prompt || `构造${kp}边界场景`}`,
            `${topic.exercises[1]?.hint || "选择最小或极端输入。"}参考：${topic.exercises[1]?.answerGuide || "说明边界为什么成立以及如何处理。"}`,
            "example",
            "medium",
          ),
          node(
            "topic-next",
            "下一步学习建议",
            `如果目标是${array(context.learningGoals)[0] || "系统掌握课程"}，下一步应把本导图改写成自己的错题检查表，并补一段伪代码或状态表。`,
            "summary",
            "medium",
          ),
        ],
      ),
    ],
  );
  return withLists(
    root,
    [
      ["topic-object-list", "topic-process-steps", "对象边界决定过程步骤能否成立，不能脱离前提套模板。"],
      ["topic-pseudocode", "topic-cost", "伪代码中的循环、递归或状态迁移会影响复杂度和工程代价。"],
      [
        "topic-comparison-core",
        "topic-mistake-one",
        "相邻概念比较可以直接暴露关键词套用造成的误判，并帮助修正常见错误。",
      ],
      ["topic-example-one", "topic-review-order", "具体例题应回收到复习顺序中，形成可复用检查清单。"],
    ],
    ["topic-objects", "topic-mechanism", "topic-comparison"],
    ["topic-mis-name", "topic-mis-process", "topic-mis-compare", "topic-mistake-one", "topic-mistake-two"],
    [
      "topic-objects",
      "topic-object-list",
      "topic-mechanism",
      "topic-pseudocode",
      "topic-comparison",
      "topic-examples",
      "topic-review",
      "topic-review-order",
    ],
  );
}

function withLists(root, crossLinks, highlights, misconceptions, sequence) {
  return {
    root,
    crossLinks: crossLinks.map(([sourceId, targetId, label]) => ({ sourceId, targetId, label })),
    highlightNodeIds: highlights,
    misconceptionNodeIds: misconceptions,
    recommendedSequence: sequence,
  };
}

function node(id, label, description, nodeType = "concept", importance = "medium", children = []) {
  return { id, label, description: limit(description, 490), nodeType, importance, children, citations: [] };
}

function citedNode(id, label, description, nodeType, citations, citationIndex) {
  const citation = citations[citationIndex % Math.max(1, citations.length)];
  const item = node(id, label, withCitation(description, citation), nodeType, "high", []);
  if (citation?.chunkId) item.citations = [Number(citation.chunkId)];
  return item;
}

function withCitation(description, citation) {
  if (!citation) return description;
  const evidence = evidenceSentence(citation.excerpt);
  return `${description} 可对照课程资料[${citation.label}]：${evidence}`;
}

function evidenceSentence(text) {
  return (
    String(text || "")
      .replace(/^#{1,6}\s+.*$/gm, "")
      .split(/[。！？\n]/)
      .map((item) => item.trim())
      .find((item) => item.length >= 18)
      ?.slice(0, 120) || String(text || "").slice(0, 120)
  );
}

function profileNotes(context) {
  const mastery = Number.isFinite(Number(context.mastery))
    ? `当前掌握度 ${Number(context.mastery)}，所以节点会强调容易失分的条件判断。`
    : "当前没有明确掌握度，按通用学习难度组织。";
  const preference = context.explanationPreference
    ? `偏好${context.explanationPreference}`
    : "偏好结构化讲解";
  const prior = array(context.priorKnowledge).length
    ? `已有基础包括${array(context.priorKnowledge).slice(0, 2).join("、")}，因此只补必要前置关系。`
    : "暂无完整前置知识记录，因此保留关键定义。";
  const goal = array(context.learningGoals).length
    ? `面向${array(context.learningGoals).slice(0, 2).join("、")}，节点会突出考试和迁移辨析。`
    : "面向当前路径目标，节点会突出可迁移理解。";
  const time = context.paceAndTimeBudget?.weeklyTimeBudgetMinutes
    ? `每周时间预算约${context.paceAndTimeBudget.weeklyTimeBudgetMinutes}分钟，适合拆成短时复习块。`
    : `学习节奏${context.paceAndTimeBudget?.pacePreference || "适中"}，适合分段复习。`;
  const resource = array(context.resourcePreferences).length
    ? `资源偏好为${array(context.resourcePreferences).slice(0, 2).join("、")}，因此保留图解关系和可执行检查项。`
    : "资源偏好未完整记录，因此使用通用结构化导图。";
  return { mastery, preference, prior, goal, time, resource };
}

function limit(value, max) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : text.slice(0, max - 1);
}

function countChinese(value) {
  return (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { buildStructuredMindMapContent };
