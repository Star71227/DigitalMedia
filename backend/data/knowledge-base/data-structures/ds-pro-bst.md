---
sourceKey: ds-pro-bst
title: 数据结构讲义·二叉搜索树与哈夫曼树
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 二叉搜索树
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-bst
---

# 二叉搜索树与哈夫曼树

## 二叉搜索树的定义
二叉搜索树（BST，又称二叉排序树）或者是一棵空树，或者是具有以下性质的二叉树：若左子树非空，则左子树上所有结点的关键字均小于根结点的关键字；若右子树非空，则右子树上所有结点的关键字均大于根结点的关键字；左右子树本身也各是一棵二叉搜索树。

## 二叉搜索树的中序性质
对二叉搜索树进行中序遍历，得到的序列一定是一个递增有序序列。这是二叉搜索树最重要的性质，也是判定一棵二叉树是否为 BST 的直接方法：中序遍历过程中若出现逆序则不是 BST。

## 二叉搜索树的查找
从根开始比较：相等则查找成功；若小于根则进入左子树；若大于根则进入右子树；走到空指针则查找失败。查找路径唯一，比较次数不超过树高。平均时间复杂度 O(log2 n)，最坏（树退化为单支树）为 O(n)。

## 二叉搜索树的插入
插入新结点时，从根开始按查找规则向下比较，直到遇到空指针，把新结点作为该空指针位置的叶子插入。插入过程不需要移动其他结点，时间复杂度与查找相同。

## 二叉搜索树的删除
删除分三种情况：被删结点是叶子，直接删除；被删结点只有一个孩子，用孩子替代它；被删结点有两个孩子，用其中序前驱（左子树最大结点）或中序后继（右子树最小结点）的值替代它，然后删除那个前驱或后继结点（该结点至多只有一个孩子，回到前两种情况）。第三种情况必须用中序前驱或后继替代，不能随意用其他结点。

## 完整代码：二叉搜索树
```c
#include <stdio.h>
#include <stdlib.h>
typedef struct BSTNode { int key; struct BSTNode *lchild, *rchild; } BSTNode, *BSTree;

BSTNode *BSTSearch(BSTree T, int key) {
    while (T && T->key != key) T = (key < T->key) ? T->lchild : T->rchild;
    return T;                                  // 找到返回结点，失败返回 NULL
}

int BSTInsert(BSTree *T, int key) {
    if (!*T) {
        BSTNode *s = (BSTNode*)malloc(sizeof(BSTNode));
        s->key = key; s->lchild = s->rchild = NULL;
        *T = s; return 1;
    }
    if (key == (*T)->key) return 0;             // 不允许重复
    if (key < (*T)->key) return BSTInsert(&(*T)->lchild, key);
    return BSTInsert(&(*T)->rchild, key);
}

BSTNode *BSTMin(BSTree T) { while (T && T->lchild) T = T->lchild; return T; }

int BSTDelete(BSTree *T, int key) {
    if (!*T) return 0;
    if (key < (*T)->key) return BSTDelete(&(*T)->lchild, key);
    if (key > (*T)->key) return BSTDelete(&(*T)->rchild, key);
    BSTNode *p = *T;
    if (!p->lchild) { *T = p->rchild; free(p); }
    else if (!p->rchild) { *T = p->lchild; free(p); }
    else {                                     // 两个孩子：用中序后继替代
        BSTNode *s = BSTMin(p->rchild);
        p->key = s->key;
        BSTDelete(&p->rchild, s->key);
    }
    return 1;
}
```

## 二叉搜索树的查找效率
查找长度取决于树高。最好情况是平衡的，树高约 log2 n；最坏情况是按有序序列插入，树退化为单支树，树高为 n，查找退化为顺序查找。n 个结点的二叉搜索树平均查找长度与树的形态有关，等概率下成功查找的 ASL 约为 O(log2 n)。

## 哈夫曼树
哈夫曼树（最优二叉树）是带权路径长度 WPL 最小的二叉树。结点的带权路径长度是该结点权值与从根到该结点路径长度（边数）的乘积；树的 WPL 是所有叶结点带权路径长度之和。构造方法：每次从集合中选取权值最小的两棵树合并为一棵新树，新树根权值为两者之和，重复直到只剩一棵树。

## 哈夫曼树的性质
哈夫曼树中不存在度为 1 的结点，因此 n 个叶结点的哈夫曼树共有 2n−1 个结点。权值越大的叶子离根越近。哈夫曼树不唯一（左右子树可交换），但 WPL 是最小的且唯一。n 个叶结点的哈夫曼树需要 n−1 次合并。

## 哈夫曼编码
在哈夫曼树中约定左分支表示 0、右分支表示 1，从根到叶子的路径即为该字符的编码。这样得到的编码是前缀编码——任一编码都不是另一编码的前缀，因此译码不会产生歧义。哈夫曼编码是平均码长最短的前缀编码，用于数据压缩。

## 完整代码：哈夫曼树构造与 WPL 计算
```c
#define N 100
typedef struct { int weight; int parent, lchild, rchild; } HTNode;

// 构造哈夫曼树：n 个叶子，共 2n-1 个结点
void CreateHuffman(HTNode ht[], int n) {
    int m = 2 * n - 1;
    for (int i = 1; i <= m; i++) { ht[i].parent = ht[i].lchild = ht[i].rchild = 0; }
    for (int i = n + 1; i <= m; i++) {          // 每次合并两个权值最小的
        int s1 = 0, s2 = 0;
        for (int j = 1; j < i; j++) {
            if (ht[j].parent) continue;
            if (!s1 || ht[j].weight < ht[s1].weight) { s2 = s1; s1 = j; }
            else if (!s2 || ht[j].weight < ht[s2].weight) s2 = j;
        }
        ht[s1].parent = ht[s2].parent = i;
        ht[i].lchild = s1; ht[i].rchild = s2;
        ht[i].weight = ht[s1].weight + ht[s2].weight;
    }
}

int WPL(HTNode ht[], int n) {                   // 叶结点权值 × 路径长度
    int sum = 0;
    for (int i = 1; i <= n; i++) {
        int depth = 0, p = i;
        while (ht[p].parent) { depth++; p = ht[p].parent; }
        sum += ht[i].weight * depth;
    }
    return sum;
}
```

## 常见易错点
删除有两个孩子的结点时选错替代结点会破坏 BST 性质。把"度为 2 的结点"当作"叶子"代入 n0=n2+1 会算错。哈夫曼树含 n 个叶结点时总结点数为 2n−1，不要漏掉合并产生的新结点。哈夫曼编码不唯一但 WPL 相同。WPL 计算时路径长度按边数而非结点数。

## 本节小结
二叉搜索树以中序有序为核心性质，查找、插入、删除的平均代价为 O(log n)，但形态依赖插入顺序，最坏会退化为 O(n)——这正是引出平衡树的动机。哈夫曼树解决带权路径长度最小化问题，其编码是前缀编码，广泛用于无损压缩。
