---
sourceKey: ds-pro-string-array
title: 数据结构讲义·串、数组与广义表
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 数组与广义表
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-string-array
---

# 串、数组与广义表

## 串的定义
串是由零个或多个字符组成的有限序列，是元素限定为字符的线性表。空串是长度为零的串，空格串由一个或多个空格组成，两者不同。子串是串中任意个连续字符组成的子序列，主串是包含子串的串。

## 串的存储结构
顺序存储用字符数组，可显式保存长度或用 '\0' 作为结束标志。堆分配存储在程序执行时动态分配，适合变长串。链式存储每个结点存放一个或多个字符，存储密度低，通常只在特定场景使用。

## 模式匹配与 BF 算法
模式匹配是在主串中查找模式串首次出现位置。BF（朴素）算法从主串每个位置起与模式串逐字符比较，失配则主串指针回退到本次起点的下一位置。最坏时间复杂度 O(n×m)，n 与 m 分别为主串和模式串长度。

## KMP 算法的思想
KMP 利用已匹配的信息，让主串指针不回溯，只移动模式串。核心是 next 数组：next[j] 表示模式串第 j 个字符失配时，模式串应跳到的位置，其值等于模式串前 j−1 个字符组成的子串的最长相等前后缀长度。

## next 数组的求法
以 0 为起始下标时，next[0] = −1，next[1] = 0。对每个 j，若 p[j−1] == p[k]，则 next[j] = k+1 且 k 自增；否则 k 回退到 next[k]，直到 k == −1 或字符相等。求 next 的过程本质是模式串自己与自己匹配。

## KMP 的时间复杂度
求 next 数组为 O(m)，匹配过程主串指针不回退，为 O(n)，总时间复杂度 O(n+m)。当模式串存在大量重复前缀时，KMP 相比 BF 优势明显。

## nextval 数组（改进）
若 p[j] == p[next[j]]，则跳到 next[j] 后仍会失配，此时可令 nextval[j] = nextval[next[j]]，直接跳过必然失配的比较，进一步减少比较次数。这称为 KMP 的改进算法。

## 完整代码：BF 与 KMP
```c
// 朴素匹配，返回首次出现的下标，失败返回 -1
int BF(const char *s, const char *p) {
    int i = 0, j = 0;
    while (s[i] && p[j]) {
        if (s[i] == p[j]) { i++; j++; }
        else { i = i - j + 1; j = 0; }     // 主串回退
    }
    return p[j] ? -1 : i - j;
}

// 求 next 数组（0 起始下标）
void GetNext(const char *p, int next[], int m) {
    next[0] = -1; int k = -1, j = 0;
    while (j < m - 1) {
        if (k == -1 || p[j] == p[k]) next[++j] = ++k;
        else k = next[k];
    }
}

// KMP 匹配
int KMP(const char *s, const char *p) {
    int n = 0, m = 0;
    while (s[n]) n++;
    while (p[m]) m++;
    int next[256]; GetNext(p, next, m);
    int i = 0, j = 0;
    while (i < n && j < m) {
        if (j == -1 || s[i] == p[j]) { i++; j++; }
        else j = next[j];                  // 主串不回溯
    }
    return j == m ? i - j : -1;
}
```

## 数组与多维数组
数组是相同类型元素的集合。多维数组在内存中按行优先（C 语言）或列优先（Fortran）顺序存储。以行优先为例，二维数组 a[m][n] 中元素 a[i][j] 的地址为 LOC(a[0][0]) + (i×n + j)×sizeof(ElemType)。数组一经定义，维数和维界不再改变，因此除初始化和销毁外只有取值和赋值两种操作。

## 特殊矩阵的压缩存储
对称矩阵中 a[i][j] == a[j][i]，只需存下三角（含对角线），元素个数 n(n+1)/2，按行优先映射到一维数组，a[i][j]（i≥j）对应下标 i(i+1)/2 + j，a[i][j]（i<j）按对称位置取 i(i+1)/2 + i 处的值。三角矩阵把另一侧常量只存一个值。三对角矩阵（带状矩阵）只存主对角线及上下相邻的两条对角线，共 3n−2 个元素。

## 稀疏矩阵
稀疏矩阵中非零元素远少于零元素。三元组表（行、列、值）按行优先顺序存储非零元素，适合按行处理；十字链表为每个非零元素建结点，同时按行和按列链接，适合频繁插入删除。三元组转置可用列序递增扫描（O(n×t)）或快速转置（先统计每列非零个数、求起始位置，再一趟扫描，O(n+t)）。

## 广义表
广义表是线性表的推广，元素既可以是原子也可以是子表。表头是第一个元素，表尾是除表头外其余元素组成的表（一定是表）。广义表的长度是最外层元素个数，深度是括号嵌套的最大层数。广义表可以共享子表，也可以递归定义，例如 L = (a, L) 是无限递归表。

## 完整代码：稀疏矩阵三元组快速转置
```c
#define MAX 100
typedef struct { int i, j, e; } Triple;
typedef struct { Triple data[MAX + 1]; int mu, nu, tu; } TSMatrix;

// 快速转置：O(nu + tu)
void FastTranspose(TSMatrix M, TSMatrix *T) {
    T->mu = M.nu; T->nu = M.mu; T->tu = M.tu;
    if (M.tu == 0) return;
    int num[MAX + 1] = {0}, cpot[MAX + 1];
    for (int t = 1; t <= M.tu; t++) num[M.data[t].j]++;   // 每列非零个数
    cpot[1] = 1;
    for (int col = 2; col <= M.nu; col++) cpot[col] = cpot[col - 1] + num[col - 1];
    for (int p = 1; p <= M.tu; p++) {                      // 一趟扫描定位
        int col = M.data[p].j, q = cpot[col];
        T->data[q].i = M.data[p].j;
        T->data[q].j = M.data[p].i;
        T->data[q].e = M.data[p].e;
        cpot[col]++;
    }
}
```

## 常见易错点
next 数组下标起点（0 或 1）未统一会导致错位。混淆 next 与 nextval。把"最长相等前后缀"误认为"最长公共前缀"或"最长回文"。多维数组地址计算时行列优先顺序搞反，或忽略首行首列。广义表长度与深度概念混淆。稀疏矩阵三元组转置时直接交换行列会打乱存储顺序。

## 本节小结
串的本质是字符线性表，KMP 通过预处理模式串把匹配复杂度降到线性。数组的元素地址可由下标直接计算，因此特殊矩阵可以压缩存储以节省空间。广义表通过允许元素为子表实现递归结构，其长度与深度是两个独立的度量。
