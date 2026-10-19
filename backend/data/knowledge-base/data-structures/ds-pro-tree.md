---
sourceKey: ds-pro-tree
title: 数据结构讲义·树与二叉树
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 树与二叉树
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-tree
---

# 树与二叉树

## 树的定义与术语
树是 n（n≥0）个结点的有限集合。n=0 时称为空树；非空树有且仅有一个根结点，其余结点被分成若干互不相交的有限集合，每个集合本身又是一棵树，称为根的子树。结点的度是其孩子个数，树的度是各结点度的最大值，度为 0 的结点称为叶子（终端结点）。结点的层次从根开始计为 1，树的高度（深度）是结点的最大层次。路径长度是路径上边的条数。

## 树的性质
树中结点数等于所有结点的度数之和加 1。度为 m 的树中第 i 层至多有 m^(i−1) 个结点。高度为 h 的 m 叉树至多有 (m^h − 1)/(m − 1) 个结点。具有 n 个结点的 m 叉树的最小高度为 ⌈log_m(n(m−1)+1)⌉。

## 二叉树的定义
二叉树是每个结点至多有两棵子树、且左右子树有次序之分的树。二叉树的五种基本形态：空树、只有根、根只有左子树、根只有右子树、根有左右子树。二叉树不是度为 2 的树——度为 2 的树要求每个结点度数都等于 2，而二叉树允许结点度数为 0、1、2。

## 二叉树的性质
非空二叉树的第 i 层至多有 2^(i−1) 个结点。高度为 h 的二叉树至多有 2^h − 1 个结点。对任何非空二叉树，叶子数 n0 与度为 2 的结点数 n2 满足 n0 = n2 + 1。具有 n 个结点的完全二叉树高度为 ⌊log2(n)⌋ + 1。

## 满二叉树与完全二叉树
满二叉树高度为 h 且有 2^h − 1 个结点，每层都达到最大结点数。完全二叉树的前 h−1 层是满的，最后第 h 层的结点连续集中在左侧。完全二叉树按层编号（从 1 开始）时，结点 i 的左孩子为 2i、右孩子为 2i+1、父结点为 ⌊i/2⌋，最后一个非叶结点编号为 ⌊n/2⌋。

## 二叉树的存储结构
顺序存储按完全二叉树编号把结点存入数组，适合完全二叉树和满二叉树，对一般二叉树会造成大量空间浪费。链式存储用二叉链表（lchild、data、rchild）或三叉链表（增加 parent 指针）。n 个结点的二叉链表有 n+1 个空指针域。

## 二叉树的遍历
前序遍历按"根、左、右"访问，中序按"左、根、右"，后序按"左、右、根"，层序按层从上到下、每层从左到右。前中后序的递归定义与代码结构完全对应；层序需要借助队列。时间复杂度均为 O(n)，递归遍历空间复杂度为 O(h)。

## 由遍历序列确定二叉树
前序序列的第一个元素和中序序列的最后一个元素是根。中序序列可以划分左右子树，因此"前序+中序"或"后序+中序"可以唯一确定一棵二叉树。"层序+中序"也可以。但"前序+后序"不能唯一确定，因为无法区分只有一个孩子的子树是左还是右。

## 线索二叉树
二叉链表中有 n+1 个空指针。线索化利用这些空指针存放遍历序列中的前驱与后继：若无左孩子，lchild 指向遍历前驱；若无右孩子，rchild 指向遍历后继。为区分指针还是线索，结点需增加 ltag 与 rtag 标志位。中序线索二叉树可在不使用栈的情况下实现遍历。

## 树、森林与二叉树的转换
树转二叉树采用"左孩子右兄弟"法：每个结点的左指针指向第一个孩子，右指针指向下一个兄弟。森林转二叉树时，先把每棵树转成二叉树，再把各棵二叉树的根用右指针连成一串。二叉树转回树或森林是其逆过程。遍历关系：树的先根遍历对应其二叉树的前序遍历，树的后根遍历对应二叉树的中序遍历。

## 完整代码：二叉树的遍历
```c
#include <stdio.h>
#include <stdlib.h>
typedef struct BiTNode { char data; struct BiTNode *lchild, *rchild; } BiTNode, *BiTree;

void PreOrder(BiTree T) {                     // 前序
    if (!T) return;
    printf("%c ", T->data);
    PreOrder(T->lchild);
    PreOrder(T->rchild);
}

void InOrder(BiTree T) {                      // 中序
    if (!T) return;
    InOrder(T->lchild);
    printf("%c ", T->data);
    InOrder(T->rchild);
}

void PostOrder(BiTree T) {                    // 后序
    if (!T) return;
    PostOrder(T->lchild);
    PostOrder(T->rchild);
    printf("%c ", T->data);
}

void LevelOrder(BiTree T) {                   // 层序（队列）
    if (!T) return;
    BiTree q[1000]; int front = 0, rear = 0;
    q[rear++] = T;
    while (front < rear) {
        BiTree p = q[front++];
        printf("%c ", p->data);
        if (p->lchild) q[rear++] = p->lchild;
        if (p->rchild) q[rear++] = p->rchild;
    }
}

void InOrderNonRec(BiTree T) {                // 中序非递归（栈）
    BiTree st[1000]; int top = 0; BiTree p = T;
    while (p || top) {
        while (p) { st[top++] = p; p = p->lchild; }
        p = st[--top]; printf("%c ", p->data); p = p->rchild;
    }
}

int TreeDepth(BiTree T) {                     // 求高度
    if (!T) return 0;
    int l = TreeDepth(T->lchild), r = TreeDepth(T->rchild);
    return (l > r ? l : r) + 1;
}

int CountLeaf(BiTree T) {                     // 统计叶子数
    if (!T) return 0;
    if (!T->lchild && !T->rchild) return 1;
    return CountLeaf(T->lchild) + CountLeaf(T->rchild);
}
```

## 经典算法题思路
求二叉树高度：递归取左右子树高度较大者加 1。统计叶子数：左右孩子都为空的结点计数。交换左右子树：递归交换每个结点的两个指针。判断相似：两树都空则相似，一空一非空则不相似，否则递归比较左右子树。求带权路径长度 WPL：前序或层序遍历，累计"叶子权值 × 层数−1"。

## 常见易错点
把二叉树的"度"概念与"度为 2 的树"混淆。n0 = n2 + 1 只对二叉树成立。完全二叉树与满二叉树不等价。用"前序+后序"确定二叉树（信息不足）。层序遍历误用栈。计算完全二叉树结点编号时忽略编号从 1 开始的前提。

## 本节小结
二叉树是最重要的树形结构，其性质（层结点数、n0=n2+1、完全二叉树编号规则）是各类计算题的基础。四种遍历方式各有用途：前序用于复制树与表达式前缀，中序用于二叉搜索树有序输出，后序用于释放空间与表达式求值，层序用于按层处理。遍历序列与树的还原关系是高频考点。
