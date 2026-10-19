---
sourceKey: ds-pro-linear
title: 数据结构讲义·线性表
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 线性结构
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-linear
---

# 线性表

## 线性表的定义
线性表是 n（n≥0）个数据元素的有限序列，除第一个元素外每个元素有且仅有一个直接前驱，除最后一个元素外每个元素有且仅有一个直接后继。线性表中元素之间是一对一的线性关系，元素类型相同，元素个数有限。

## 线性表的基本操作
初始化、求表长、按位查找、按值查找、插入、删除、判空、遍历、销毁。基本操作的实现方式由存储结构决定，但逻辑语义与存储结构无关。

## 顺序表的定义
顺序表用一组地址连续的存储单元依次存放元素，逻辑上相邻的元素物理上也相邻。第 i 个元素（逻辑序号从 1 开始）的存储地址为 LOC(a_i) = LOC(a_1) + (i−1)×sizeof(ElemType)。

## 顺序表的插入与删除
在长度为 n 的顺序表第 i 个位置插入元素，需将第 i 到第 n 个元素后移，移动 n−i+1 个元素，平均移动 n/2 次。删除第 i 个元素需将第 i+1 到第 n 个元素前移，移动 n−i 个元素，平均移动 (n−1)/2 次。两者时间复杂度均为 O(n)。

## 顺序表的优缺点
优点是支持随机访问，按下标取值 O(1)；存储密度高，无需额外指针空间；缺点是插入删除平均需移动一半元素，且需要预先分配连续空间，扩容时需要整体复制。

## 单链表
单链表通过指针把结点串联，每个结点含数据域和指针域。头指针指向第一个结点；引入头结点（数据域不存放有效数据）可以统一空表与非空表、首元结点与中间结点的插入删除逻辑，减少边界特判。

## 单链表的建立
头插法每次把新结点插在头结点之后，得到的链表与输入顺序相反，时间复杂度 O(n)。尾插法需要维护尾指针，每次把新结点接在表尾，得到的链表与输入顺序一致，时间复杂度也是 O(n)。

## 单链表的查找与插入删除
按序号查找需从头遍历，时间复杂度 O(n)。已知某结点指针 p 时，在 p 之后插入新结点只需修改两个指针，O(1)；删除 p 的后继结点也为 O(1)。若要删除 p 本身，通常需要先找到前驱，O(n)。

## 双链表
双链表结点含 prior 和 next 两个指针，可以双向遍历。在已知结点 p 前后插入或删除结点都无需再找前驱，时间复杂度 O(1)。双链表插入与删除时要注意指针修改顺序，先连新结点的两个指针，再改相邻结点的指针。

## 循环链表
循环单链表表尾结点的 next 指向头结点，从表中任一结点出发都能遍历整个链表。若设尾指针 rear 而非头指针，则 rear->next 即头结点，访问表头与表尾都只需 O(1)。循环双链表的结构更加对称。

## 静态链表
静态链表用数组描述链表，数组元素含数据域 data 和游标 next，next 存放后继元素在数组中的下标。静态链表插入删除不需移动元素，只修改游标，适用于不支持指针的语言；但需要预分配空间，且不能随机访问。

## 顺序表与链表的比较
| 维度 | 顺序表 | 链表 |
|---|---|---|
| 随机访问 | O(1) | O(n) |
| 插入删除 | O(n)（需移动） | O(1)（已知位置） |
| 存储密度 | 高（≈1） | 低（含指针开销） |
| 空间分配 | 需预分配、可能溢出 | 动态分配、较灵活 |
| 适用场景 | 查多改少、规模可预估 | 频繁插入删除、规模不定 |

## 完整代码：带头结点的单链表
```c
#include <stdio.h>
#include <stdlib.h>
typedef struct LNode { int data; struct LNode *next; } LNode, *LinkList;

LinkList InitList(void) {            // 建立头结点
    LinkList head = (LinkList)malloc(sizeof(LNode));
    head->next = NULL;
    return head;
}

int ListInsert(LinkList head, int i, int e) {   // 在第 i 个位置插入
    if (i < 1) return 0;
    LNode *p = head; int k = 0;
    while (p && k < i - 1) { p = p->next; k++; }   // 找第 i-1 个结点
    if (!p) return 0;
    LNode *s = (LNode*)malloc(sizeof(LNode));
    s->data = e; s->next = p->next; p->next = s;
    return 1;
}

int ListDelete(LinkList head, int i, int *e) {  // 删除第 i 个结点
    if (i < 1) return 0;
    LNode *p = head; int k = 0;
    while (p->next && k < i - 1) { p = p->next; k++; }
    if (!p->next) return 0;
    LNode *q = p->next; *e = q->data;
    p->next = q->next; free(q);
    return 1;
}

void ReverseList(LinkList head) {    // 头插法就地逆置
    LNode *p = head->next; head->next = NULL;
    while (p) { LNode *nxt = p->next; p->next = head->next; head->next = p; p = nxt; }
}
```

## 经典算法题思路
找倒数第 k 个结点：快慢指针，快指针先走 k 步，再同步前进。判断是否有环：快指针每次两步、慢指针一步，若相遇则有环。找环入口：相遇后，一个指针回到表头，两指针同步前进，再次相遇处即入口。两个有序链表合并：双指针比较取小者接入结果链表。

## 常见易错点
指针操作顺序错误会断链，应先保存后继再改指针。插入删除必须处理空表、表头、表尾三种边界。C 语言中删除结点后要 free，避免内存泄漏；释放后应把指针置 NULL。逻辑序号从 1 开始，数组下标从 0 开始，二者不可混用。

## 本节小结
线性表是数据结构的基础。顺序表以 O(1) 随机访问换取 O(n) 的插入删除；链表以 O(n) 的定位代价换取 O(1) 的插入删除。选择取决于操作分布、规模是否可预估以及是否需要频繁随机访问。
