# CodeLab 代码练习题库说明

> 本次为 CodeLab（代码练习 / OI 训练模块）补充了**五个学科共 84 道原创代码练习题**，
> 并修复了种子脚本的两个可用性问题。全部题目在交付前都经过「作者自验 + 独立对抗复核」两轮验证。

---

## 一、交付内容

### 1. 新增题库文件（5 个）

放在 `backend/data/code-exercises/`，与原有的 `base_code_exercises.json` 并列：

| 文件 | 学科 | 题量 | 编号区间 | 难度分布（基础/提高/综合） |
|---|---|---|---|---|
| `data-structures.exercises.json` | 数据结构 | 22 | `DS_CODE_011` ~ `DS_CODE_032` | 8 / 10 / 4 |
| `operating-systems.exercises.json` | 操作系统 | 14 | `OS_CODE_001` ~ `OS_CODE_014` | 5 / 7 / 2 |
| `computer-organization.exercises.json` | 计算机组成原理 | 14 | `CO_CODE_001` ~ `CO_CODE_014` | 5 / 7 / 2 |
| `computer-networks.exercises.json` | 计算机网络 | 14 | `NET_CODE_001` ~ `NET_CODE_014` | 5 / 7 / 2 |
| `c-language.exercises.json` | C语言 | 20 | `C_CODE_001` ~ `C_CODE_020` | 10 / 7 / 3 |
| **合计** | **5 个学科** | **84** | | **33 / 38 / 13** |

导入后 CodeLab 题库总量为 **97 道**（84 道新增 + 组员原有 10 道基础题 + 3 道可信题）。

题目字段与 `base_code_exercises.json` **完全一致**（13 个字段）：
`exercise_id / subject / knowledge_point / title / description / language / difficulty / starter_code / sample_input / sample_output / explanation / tags / source`

### 2. 题目覆盖范围

- **数据结构**：单链表反转、合并有序链表、判环、顺序表增删、括号匹配、表达式求值、两栈模拟队列、循环队列、KMP next 数组、朴素模式匹配、最长回文、二叉树三种遍历、层序、树高与叶子、BST 插入查找、判 BST、小根堆建堆与堆排序、二分查找与 lower_bound、哈希线性探测、邻接表 DFS/BFS、Dijkstra、快速排序
- **操作系统**：FCFS / SJF / RR / 优先级调度与周转时间、银行家算法安全性检查、首次适应 / 最佳适应、LRU / FIFO / OPT 页面置换、SSTF / SCAN 磁盘调度、生产者消费者 PV 模拟、哲学家进餐死锁判断
- **计算机组成原理**：补码与原反补转换、补码求真值、符号扩展、溢出判断、海明码(7,4)、奇偶校验、CRC 求余、移位相加乘法、IEEE 754 位模式解析、直接映射 / 组相联 Cache 地址划分、内存容量计算
- **计算机网络**：CRC 求 FCS 与校验、零比特填充、二维奇偶校验定位、子网划分、CIDR 聚合、IPv4 / TCP 校验和、IP 分片、最长前缀匹配、TCP 序号推进、拥塞窗口推演、URL 解析、二进制指数退避
- **C语言**：指针传址交换、手写 strlen、素数判断、递归阶乘/斐波那契/汉诺塔、gcd 与 lcm、数组逆序与排序、二分查找、回文串、单词统计、字符串大小写与进制转换、动态数组扩容、结构体排序、atoi 简化版

### 3. 脚本改动

| 文件 | 改动 | 原因 |
|---|---|---|
| `backend/scripts/seedCodeExercises.js` | 改为**扫描 `data/code-exercises/` 目录下所有 `*.json`**；并修正 `.env` 加载路径 | 之前只读死 `base_code_exercises.json`，新增题库文件不会被导入 |
| `backend/scripts/*.js`（12 个）、`backend/src/config/db.js`、`backend/src/index.js` | `.env` 改为多候选路径加载：**项目根 `.env` 优先，其次 `backend/.env`** | 原来只找 `backend/.env`（不存在），组员在 `backend/` 下直接跑 `npm run seed:*` 会报 `DB_PASSWORD is required` |
| `frontend-new/src/components/CodeLabView.tsx` | 学科下拉从 3 个补到 **5 个** | 否则新增的「计算机组成原理」「C语言」题目在页面上无法筛选出来 |

---

## 二、怎么用

### 导入题库（组员拉取代码后必做一次）

```bat
cd backend
npm run seed:code-exercises
```

预期输出：

```
代码练习目录：...\backend\data\code-exercises（6 个文件）
读取代码练习数量：94
新增数量：84          ← 第一次是 84；再次执行会变成 0 新增 / 94 更新
更新数量：10
失败数量：0
```

脚本是**幂等**的（`INSERT ... ON DUPLICATE KEY UPDATE`，不删除任何数据），重复执行安全。

> 数据库不在 git 里，所以换电脑 / 重新 clone 后都要跑一次这个命令。

### 新增题目

直接在 `backend/data/code-exercises/` 下丢一个新的 `*.json` 文件（顶层为数组）即可，**不需要改任何脚本**。重跑一次 `npm run seed:code-exercises` 就会导入。

注意：
- `difficulty` 只能是 `基础` / `提高` / `综合`
- `language` 目前必须是 `c`
- `tags` 必须是数组
- 题号不能与已有重复（重复时脚本会告警并以后出现的文件为准）

### 题目约定（与组员原有 10 道基础题保持一致）

- 示例数据**写死在 `main()` 里**，不读 stdin
- `sample_input` 是给人看的示例数据说明，`sample_output` 是**程序真实 stdout 的字面内容**
- 核心逻辑挖成函数，用 `/* TODO: ... */` 注释给出提示，占位实现保证「不填空也能编译运行、只是输出不对」

---

## 三、验证情况

### 1. 作者自验（每道题）

- `gcc -std=c11 -Wall` 编译 starter_code：**0 error / 0 warning**
- 写参考题解（填入正确实现）编译运行，stdout 与 `sample_output` **逐字节比对一致**
- 空实现（不填空）也能正常运行、退出码 0、不崩溃

### 2. 独立复核（84 道全部重新验证）

由独立复核方**只看最终 JSON**（不看作者的中间产物）重新解题验证：

- 独立结构网关：字段完整性、难度枚举、`language`、`tags`、题号唯一性、知识点规范名、未读 stdin
- 从 JSON 里抽出 `starter_code` **重新编译 84/84 通过**，空实现运行 **84/84 退出码 0**
- 逐个独立实现并比对 `sample_output`：**84 道标准答案全部正确，无一处数值错误**
- 关键题还用不同算法交叉验证（Dijkstra 用 Bellman-Ford / Floyd 复核、CRC 用 LFSR 与长除法互验、IEEE 754 用 BitConverter 与算术重建互验、银行家算法枚举 120 个排列确认安全序列个数等）

### 3. 复核发现并已修复的 38 处问题

标准答案全部正确，但复核发现了 **38 处题面/讲解文字缺陷**，已全部修复并重新导入。其中影响学生作答的几条：

| 题号 | 问题 | 修复 |
|---|---|---|
| `C_CODE_003` | 提示让学生用 `sqrt(n)`，但只 `#include <stdio.h>` —— GCC≥14 下隐式声明是**硬错误**，照题面写直接编译失败 | 提示改为 `i * i <= n`，讲解同步说明不必引入 `math.h` |
| `NET_CODE_004` | starter 注释自指且错误，照注释实现会得到「第5行 第9列」，与答案冲突 | 注释改为「第 ROWS 行前 COLS 个位的偶校验位」 |
| `DS_CODE_028` | 同一段提示里「闭区间」与「左闭右开」自相矛盾，按字面写会**死循环** | 统一为左闭右开区间 |
| `DS_CODE_020` | next 定义漏了 `k < j` 约束，照字面理解会退化成 `next[j]=j` | 补上 `1 <= k < j` 与「不存在时取 0」 |
| `OS_CODE_005` | description 的扫描规则表述与 starter_code 明写规则冲突（照 description 写会得到另一个安全序列）；且「安全序列唯一」是错误知识点（该实例实有 16 个安全序列） | 重写 description 规则描述，说明「样例本身有多个安全序列，按本规则输出唯一」 |
| `OS_CODE_014` | 场景2 状态自相矛盾（同一支筷子被两位哲学家同时持有） | 场景2 改为 `0 1 1 1 2`，期望输出与讲解同步更新 |
| `C_CODE_007` | 次大值算法依赖未声明的哨兵初始化，`main` 用 0 初始化会诱导依赖调用方初值 | 讲解写明必须自置 `INT_MIN`，`main` 改为 `INT_MIN` 并补 `#include <limits.h>` |
| `DS_CODE_026` | 提示要求「调用前置为 NULL」，但给定的 `main` 并不重置，会导致合法 BST 被判错 | 提示改为「必须在函数入口自己重置」 |

其余为讲解措辞、标签、难度分档、知识点归类的修正（例如最佳适应的碎片类型应为「外部碎片」、C 语言递归题归入规范知识点「函数」等）。

### 4. 接口端到端验证

用学生账号登录后实测 `GET /api/code/exercises?subject=...`：

| 学科 | 返回题目数 |
|---|---|
| 数据结构 | 33 |
| 操作系统 | 15 |
| 计算机组成原理 | 14 |
| 计算机网络 | 15 |
| C语言 | 20 |
| 不带学科过滤 | 97 |

### 5. 知识点与知识图谱联动

题目的 `knowledge_point` 字段全部改成 `knowledge_points` 表里的**规范名称**（一字不差），
使得图谱 105 个知识点中**被题目命中的从 5 个提升到 43 个**，题目可以和学习路径、知识图谱联动。

> 仍未被命中的 9 个知识点全部来自组员原有那 13 道老题（如「单链表」「顺序表」「红黑树旋转」等）。
> 如需 100% 联动，可把这 13 道题的知识点也改成规范名（如「单链表」→「链表」、「顺序表」→「数组」）。

---

## 四、已知限制（重要）

1. **这批题目前不可自动判题。** 平台的判题走 `code_test_cases` 表（期望输出），而本批 84 道题和组员原有的 10 道基础题一样，**只有样例、没有测试用例**，属于「示例型」题目：学生可以看题面、写代码、看样例与讲解。
   真正可判题的是 `DS_CODE_RBT_001` / `NET_CODE_TCP_001` / `OS_CODE_RR_001` 这 3 道「可信题」（各有 9 条测试用例，且 starter 是读 stdin 的）。
2. **本地默认跑不了代码。** 根目录 `.env` 里 `CODE_EXECUTION_MODE=disabled`，代码运行/提交需要 Docker 与镜像 `learnmate/code-runner-c:2.4a`。本地未启用。
3. 若后续要把本批题目升级为可判题，需要：把 starter 改成从 stdin 读入 → 补 `code_test_cases`（public + hidden）→ 开 Docker 判题。这是一项独立改造，本次未做。

---

## 五、相关文件索引

| 内容 | 位置 |
|---|---|
| 题库 JSON（导入源） | `backend/data/code-exercises/*.exercises.json` |
| 导入脚本 | `backend/scripts/seedCodeExercises.js` |
| 表结构 | `backend/src/config/initDB.js` 中的 `code_exercises` |
| 列表接口 | `GET /api/code/exercises`（控制器 `backend/src/controllers/codeController.js`） |
| 前端页面 | `frontend-new/src/components/CodeLabView.tsx`、`CodeLabWorkspace.tsx` |

## 六、提交后解锁讲解（本次追加）

1. **做题阶段不下发答案。** `GET /api/code/exercises` 与 `GET /api/code/exercises/:id` 不再返回 `explanation`（讲解里含解法与答案），
   前端「练习目标」改为只展示知识点；样例输入/样例输出仍保留，属于题面的一部分。
2. **提交后解锁。** 新增 `GET /api/code/exercises/:id/solution`：该学生在本练习上有过一次 `mode=submit` 的提交才返回
   `explanation` 与 `referenceSolution`，否则 403 `CODE_SOLUTION_LOCKED`。前端在提交成功后展示「参考答案与讲解」。
3. **正式提交全题库可用。** 未配置隐藏用例的练习不再直接 422，而是按公开用例判定，并在返回里用
   `judgedBy: "public_only"` 如实标注（配置了参考题解 + 隐藏用例的仍为 `public_and_hidden`）。
4. **每个题都有公开测试用例。** 97 道题全部配置了公开用例（`input_text` 取题面 `sample_input`、`expected_output` 取 `sample_output`），
   「运行公开测试」与「正式提交」按钮全题库可用。
5. **本地启用判题需要 Docker。** 根目录 `.env` 改为 `CODE_EXECUTION_MODE=docker`，镜像用 `npm --prefix backend run code-runner:build` 构建，
   且本地要先把 Docker Desktop 起来。

## 七、94 道示例题升级为真判题（本次追加）

原来的 94 道示例题只有固定输出、无法区分学生是否真的实现算法（写死 `printf` 就能过）。本次把它们升级成可判题：

| 项目 | 做法 |
|---|---|
| `starter_code` | `main()` 改为从 stdin 读数据（格式写进 `description`）；**读不到输入时回退到原示例数据**，所以不填输入直接运行仍能得到原样例结果；未填 TODO 也保证可编译、不崩溃 |
| `sample_input` | 改成可直接喂 stdin 的真实输入文本，不再是「给人看的说明」 |
| `code_exercise_private.reference_solution` | 每题补一份参考题解（starter 实现全部 TODO 后的完整文件），正式提交走公开 + 隐藏完整判题 |
| `code_test_cases` | 每题 1 条 public（样例）+ 3 条 hidden，隐藏用例的 `input_text` 各不相同，输出由参考题解在判题容器中真实跑出 |
| 防写死输出 | 学生若直接 `printf` 样例输出，只能过 public 那 1 条，隐藏用例必挂，正式提交判为 `wrong_answer` |

验证口径（脚本在仓库外的工作目录，可重跑）：

1. 参考题解在 `learnmate/code-runner-c:2.4a` 里跑样例输入，stdout 必须与原 `sample_output` 逐字一致；
2. 3 条隐藏用例的输出必须非空、互不相同、且不等于样例输出；
3. 未填 TODO 的 starter 必须编译通过、运行不崩溃；
4. 全部导入后实测：参考题解提交为 `accepted`（4/4 用例），作弊解提交为 `wrong_answer`（1/4）。
