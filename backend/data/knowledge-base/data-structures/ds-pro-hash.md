---
sourceKey: ds-pro-hash
title: 数据结构讲义·散列表
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 哈希表
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-hash
---

# 散列表

## 散列表的基本思想
散列表（哈希表）通过散列函数 H(key) 直接把关键字映射为存储地址，从而在平均情况下以 O(1) 时间完成查找、插入和删除。散列表不依赖关键字的比较，而是依赖地址计算，这是它与查找树、有序表最本质的区别。

## 散列函数的构造原则
好的散列函数应满足：计算简单；对任意关键字都能算出合法地址；映射结果尽量均匀分布，减少冲突。常见方法：
- 直接定址法：H(key) = a×key + b，不产生冲突，但要求关键字连续，适用范围窄。
- 除留余数法：H(key) = key mod p，最常用。p 通常取不大于表长的最大素数，能减少冲突。
- 数字分析法：适用于关键字位数多且分布已知的情况，选取分布均匀的若干位。
- 平方取中法：取 key² 的中间几位，使结果与关键字的每一位都相关。
- 折叠法：把关键字分割成等长几段相加，适合位数多且分布未知的情况。

## 冲突的概念
不同关键字经散列函数计算得到相同地址，称为散列冲突（碰撞）。由于关键字空间通常远大于地址空间，冲突无法完全避免，只能通过设计散列函数减少、通过冲突处理方法解决。

## 装填因子
装填因子 α = 表中已存记录数 n / 散列表长度 m。α 越大，冲突概率越高，查找效率越低。α 可以大于 1（拉链法），也可以小于 1（开放定址法必须小于 1）。散列表的平均查找长度只依赖 α，与 n 和 m 的绝对值无关。

## 拉链法（链地址法）
把散列到同一地址的所有记录组织成一个单链表，散列表的每个单元存放链表头指针。拉链法不产生堆积，删除操作方便（直接摘链），装填因子可大于 1，适合表长不确定或冲突较多的场景。查找时先算地址再遍历链表。

## 开放定址法
发生冲突时，按某个探测序列在表中寻找下一个空单元。通用形式为 H_i = (H(key) + d_i) mod m。
- 线性探测法：d_i = 1, 2, 3, …。实现简单，但会产生"堆积"（一次聚集），使连续区域变长、查找变慢。
- 二次探测法：d_i = 1², −1², 2², −2², …。可减轻堆积，但可能探测不到表中所有单元。
- 再散列法（双散列）：d_i = i × H2(key)，用第二个散列函数决定步长，冲突分布更均匀。
- 伪随机序列法：d_i 取伪随机数序列。

## 开放定址法的删除问题
开放定址法不能直接把被删单元置空，否则会截断探测链，导致后续本来存在的记录查不到。正确做法是做删除标记（如 tombstone），查找时可以越过标记继续探测，插入时可以复用该位置。

## 完整代码：除留余数法 + 拉链法
```c
#include <stdio.h>
#include <stdlib.h>
#define M 13                              // 表长取素数

typedef struct Node {                     // 链表结点
    int key;
    struct Node *next;
} Node;

Node *hashTable[M];                       // 散列表：每个单元一个链表头

void InitHash(void) {
    for (int i = 0; i < M; i++) hashTable[i] = NULL;
}

int Hash(int key) { return key % M; }     // 除留余数法

void Insert(int key) {                    // 头插法插入
    int h = Hash(key);
    Node *p = (Node*)malloc(sizeof(Node));
    p->key = key; p->next = hashTable[h];
    hashTable[h] = p;
}

Node *Search(int key) {                   // 找到返回结点，失败返回 NULL
    for (Node *p = hashTable[Hash(key)]; p; p = p->next)
        if (p->key == key) return p;
    return NULL;
}

int Delete(int key) {                     // 删除关键字
    int h = Hash(key);
    Node **pp = &hashTable[h];
    while (*pp && (*pp)->key != key) pp = &(*pp)->next;
    if (!*pp) return 0;
    Node *q = *pp; *pp = q->next; free(q);
    return 1;
}
```

## 完整代码：开放定址法（线性探测）
```c
#define EMPTY  0
#define DELETED -1
#define SIZE   13
int table[SIZE];

void InitOpen(void) { for (int i = 0; i < SIZE; i++) table[i] = EMPTY; }

int HashOpen(int key) { return key % SIZE; }

int InsertOpen(int key) {                  // 返回插入位置，失败返回 -1
    int h = HashOpen(key);
    for (int i = 0; i < SIZE; i++) {
        int pos = (h + i) % SIZE;
        if (table[pos] == EMPTY || table[pos] == DELETED) { table[pos] = key; return pos; }
    }
    return -1;                             // 表满
}

int SearchOpen(int key) {                  // 返回位置，失败返回 -1
    int h = HashOpen(key);
    for (int i = 0; i < SIZE; i++) {
        int pos = (h + i) % SIZE;
        if (table[pos] == EMPTY) return -1;         // 遇到空单元说明不存在
        if (table[pos] == key) return pos;
        // 遇到 DELETED 要继续探测
    }
    return -1;
}

int DeleteOpen(int key) {
    int pos = SearchOpen(key);
    if (pos < 0) return 0;
    table[pos] = DELETED;                  // 做删除标记，不能置 EMPTY
    return 1;
}
```

## 性能分析
拉链法在等概率情况下，查找成功的平均查找长度约为 1 + α/2，查找失败约为 α（不含计算散列函数的时间）。开放定址法线性探测时，查找成功约为 (1 + 1/(1−α))/2，查找失败约为 (1 + 1/(1−α)²)/2。可见 α 越接近 1，开放定址法性能急剧恶化，因此实际实现通常把 α 控制在 0.75 以下并在超限时扩容重散列。

## 应用场景
散列表适用于等值查找、去重、计数、缓存（如 LRU 中的地址映射）、符号表、数据库索引的辅助结构。散列表**不支持有序遍历和范围查询**，需要这些能力时应选择平衡树或 B+ 树。

## 常见易错点
除留余数法的 p 取非素数会显著增加冲突。开放定址法删除直接置空会截断探测链。把装填因子与冲突概率的关系记反。误认为散列函数设计得好就不会冲突（冲突不可避免）。在需要范围查询的场景误用散列表。

## 本节小结
散列表以空间换时间，用散列函数把关键字直接映射为地址，平均查找代价 O(1)。核心问题是冲突处理：拉链法简单且适合装载率高的情况，开放定址法空间紧凑但需注意堆积与删除标记。散列表的效率由装填因子决定，与元素总数无关。
