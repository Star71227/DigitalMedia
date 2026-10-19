---
sourceKey: ds-pro-balanced
title: 数据结构讲义·平衡树（AVL树与红黑树）
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 平衡树
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-balanced
---

# 平衡树：AVL 树与红黑树

## 为什么需要平衡树
二叉搜索树的查找效率取决于树高。若按有序序列依次插入，树退化为单支树，树高为 n，查找退化为 O(n)。平衡树通过约束树高，保证查找、插入、删除都能在最坏情况下保持 O(log n)。

## AVL 树的定义
AVL 树是任意结点的左右子树高度差的绝对值不超过 1 的二叉搜索树。结点的平衡因子 BF 定义为其左子树高度减去右子树高度，AVL 树中所有结点的 BF 只能取 −1、0、1。

## AVL 树的高度与结点数关系
设 n(h) 为高度为 h 的 AVL 树最少结点数，则 n(0)=0，n(1)=1，n(2)=2，n(h)=n(h−1)+n(h−2)+1。由此可得高度为 h 的 AVL 树所需最少结点数，也说明含 n 个结点的 AVL 树高度为 O(log2 n)，即 h ≤ 约 1.44log2(n+2)。

## AVL 树的插入与四种失衡
插入新结点后，从插入点向上回溯找到第一个平衡因子绝对值大于 1 的结点（最小不平衡子树），按插入位置分四种情况调整：
- LL 型：在左孩子的左子树插入，做一次右单旋。
- RR 型：在右孩子的右子树插入，做一次左单旋。
- LR 型：在左孩子的右子树插入，先对左孩子左旋，再对根右旋。
- RL 型：在右孩子的左子树插入，先对右孩子右旋，再对根左旋。

## 旋转的本质
旋转是在保持中序序列不变的前提下，调整局部子树结构以降低高度。右旋以左孩子为新根，原根成为其右孩子；左旋以右孩子为新根，原根成为其左孩子。旋转后需要先更新孩子的高度，再更新新根的高度。

## 完整代码：AVL 树的插入与旋转
```c
#include <stdio.h>
#include <stdlib.h>
typedef struct AVLNode { int key; int height; struct AVLNode *lchild, *rchild; } AVLNode, *AVLTree;

int Height(AVLTree T) { return T ? T->height : 0; }
int Max(int a, int b) { return a > b ? a : b; }
void UpdateHeight(AVLTree T) { T->height = 1 + Max(Height(T->lchild), Height(T->rchild)); }

AVLTree RotateRight(AVLTree y) {            // 右单旋（LL）
    AVLTree x = y->lchild;
    y->lchild = x->rchild; x->rchild = y;
    UpdateHeight(y); UpdateHeight(x);
    return x;
}
AVLTree RotateLeft(AVLTree x) {             // 左单旋（RR）
    AVLTree y = x->rchild;
    x->rchild = y->lchild; y->lchild = x;
    UpdateHeight(x); UpdateHeight(y);
    return y;
}

AVLTree Balance(AVLTree T) {
    UpdateHeight(T);
    int bf = Height(T->lchild) - Height(T->rchild);
    if (bf > 1) {                                        // 左高
        if (Height(T->lchild->lchild) >= Height(T->lchild->rchild)) return RotateRight(T);   // LL
        T->lchild = RotateLeft(T->lchild); return RotateRight(T);                            // LR
    }
    if (bf < -1) {                                       // 右高
        if (Height(T->rchild->rchild) >= Height(T->rchild->lchild)) return RotateLeft(T);    // RR
        T->rchild = RotateRight(T->rchild); return RotateLeft(T);                            // RL
    }
    return T;
}

AVLTree AVLInsert(AVLTree T, int key) {
    if (!T) {
        AVLNode *s = (AVLNode*)malloc(sizeof(AVLNode));
        s->key = key; s->height = 1; s->lchild = s->rchild = NULL;
        return s;
    }
    if (key < T->key) T->lchild = AVLInsert(T->lchild, key);
    else if (key > T->key) T->rchild = AVLInsert(T->rchild, key);
    else return T;                                       // 重复关键字不插入
    return Balance(T);
}
```

## 红黑树的定义
红黑树是满足以下五条性质的二叉搜索树：每个结点是红色或黑色；根结点是黑色；叶结点（NULL，即外部结点）是黑色；红结点的两个孩子都是黑色（不存在连续两个红结点）；从任一结点到其所有叶结点的简单路径上黑结点数目相同（黑高相等）。

## 红黑树的关键性质
由红黑树性质可推出：从根到叶的最长路径不超过最短路径的两倍。设黑高为 bh，则内部结点数最少为 2^bh − 1，最多为 2^(2bh) − 1；含 n 个内部结点的红黑树高度满足 h ≤ 2log2(n+1)。因此红黑树的查找也是 O(log n)，但平衡程度弱于 AVL 树，属于"适度平衡"。

## AVL 树与红黑树的比较
AVL 树严格平衡（左右子树高度差不超过 1），查找效率略高，但插入删除时旋转更频繁。红黑树是适度平衡，插入删除时的调整次数更少（插入至多两次旋转，删除至多三次），因此适合插入删除频繁的场景。C++ STL 的 map 与 set、Java 的 TreeMap 与 TreeSet 均用红黑树实现。

## 红黑树的插入调整
新插入的结点初始着红色（若着黑色会立即破坏黑高相等）。若父结点为黑色则无需调整；若父结点为红色则破坏"不红红"，需按叔结点的颜色分情况处理：叔结点为红色时，把父结点与叔结点染黑、祖父染红并上溯继续检查；叔结点为黑色时，按 LL、RR、LR、RL 四种情况旋转并重新着色。红黑树的删除调整更复杂，核心是把"双黑"结点向上传递或通过旋转与变色消除。

## B 树与 B+ 树
B 树是一种多路平衡查找树，m 阶 B 树每个结点至多有 m 棵子树、m−1 个关键字，除根外每个结点至少有 ⌈m/2⌉ 棵子树，所有叶结点在同一层。B 树通过降低树高减少磁盘 I/O 次数，适合外存索引。B+ 树中非叶结点只作索引、不存数据，所有关键字都出现在叶结点且叶结点按大小顺序链接，因此更适合范围查询与顺序遍历，是数据库索引的常用结构。

## 常见易错点
把平衡因子定义成"右减左"（标准定义为左减右）。旋转时忘记先更新孩子高度再更新根高度。LR 与 RL 型的旋转顺序弄反。误认为红黑树是严格平衡树。B 树每个结点关键字个数的上下界记错（m 阶：关键字数上限 m−1，下限 ⌈m/2⌉−1，根至少 1 个）。

## 本节小结
平衡树解决二叉搜索树退化的根本问题。AVL 树以严格平衡换取最优查找效率，红黑树以较少调整换取更好的写性能。二者查找复杂度均为 O(log n)，选择取决于读写比例。B 树与 B+ 树把平衡思想推广到多路，服务于磁盘等外存场景。
