---
sourceKey: ds-pro-sort
title: 数据结构讲义·排序
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 排序
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-sort
---

# 排序

## 排序的基本概念
排序是把一组记录按关键字递增（或递减）重新排列。排序算法的稳定性指：若两个记录关键字相等，排序后它们的相对次序保持不变，则该算法稳定。内部排序在内存中完成，外部排序需要借助外存处理超出内存的数据。

## 插入排序
直接插入排序把第 i 个记录插入前面已排好序的子序列中：从后向前比较，比当前元素大的记录后移，找到位置后插入。最好情况（已有序）比较 n−1 次、移动 0 次，时间复杂度 O(n)；最坏和平均为 O(n²)，空间 O(1)，稳定。适合基本有序或数据量小的场景。

## 折半插入排序
在直接插入排序中，定位插入位置改用折半查找，把比较次数从 O(n) 降到 O(log n)，但元素移动次数不变，因此总时间复杂度仍为 O(n²)。折半插入排序是稳定的。

## 希尔排序
希尔排序（缩小增量排序）按增量 d 把序列分成 d 组，对每组做插入排序，然后逐步减小 d 直到 d=1。由于初期 d 较大，元素可以跨大步移动，能较快接近有序。时间复杂度与增量序列有关，平均约为 O(n^1.3)，最坏 O(n²)，空间 O(1)，**不稳定**。

## 冒泡排序
冒泡排序反复比较相邻元素，逆序则交换，每一趟把最大（或最小）元素"冒"到一端。若某趟没有发生交换，说明已有序，可提前结束。最好 O(n)，最坏与平均 O(n²)，空间 O(1)，稳定。

## 快速排序
快速排序选一个枢轴元素，通过一趟划分把序列分成"小于枢轴"和"大于枢轴"两部分，再递归处理两个子序列。平均时间复杂度 O(n log n)，最坏（每次划分极不平衡，如基本有序且取首元素为枢轴）O(n²)，平均空间 O(log n)（递归栈），**不稳定**。改进方法：三数取中选枢轴、随机化枢轴、小区间改用插入排序、三路划分处理大量重复元素。

## 选择排序
简单选择排序每趟从未排序部分选出最小元素，与未排序部分的第一个元素交换。比较次数固定为 n(n−1)/2，与初始状态无关；移动次数最好为 0。时间复杂度 O(n²)，空间 O(1)，**不稳定**（交换会改变相等元素的相对次序）。

## 堆排序
堆排序先用 O(n) 时间把序列建为大根堆，然后重复"堆顶与堆尾交换、堆长度减一、对新堆顶下沉"，每次把当前最大值放到最终位置。时间复杂度 O(n log n)（最好、最坏、平均都是），空间 O(1)，**不稳定**。

## 归并排序
归并排序采用分治：把序列递归地二分成两半，分别排序后合并两个有序子序列。合并时用双指针比较取小者，需要额外的辅助数组。时间复杂度 O(n log n)（最好、最坏、平均都是），空间 O(n)，**稳定**。归并排序适合链表排序和外部排序。

## 基数排序
基数排序不比较关键字大小，而是按关键字的每一位进行"分配—收集"。最低位优先（LSD）从个位开始，逐位处理直到最高位。设关键字位数为 d、基数为 r，则时间复杂度 O(d(n+r))，空间 O(n+r)，**稳定**。适合关键字可分解成有限位且每位取值范围较小的场景。

## 完整代码：六种典型排序
```c
#include <stdio.h>
#include <stdlib.h>

void InsertSort(int a[], int n) {              // 直接插入，稳定
    for (int i = 1; i < n; i++) {
        int t = a[i], j = i - 1;
        while (j >= 0 && a[j] > t) { a[j + 1] = a[j]; j--; }
        a[j + 1] = t;
    }
}

void BubbleSort(int a[], int n) {              // 冒泡，稳定
    for (int i = 0; i < n - 1; i++) {
        int swapped = 0;
        for (int j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; swapped = 1; }
        if (!swapped) break;
    }
}

int Partition(int a[], int low, int high) {    // 快排划分
    int pivot = a[low];
    while (low < high) {
        while (low < high && a[high] >= pivot) high--;
        a[low] = a[high];
        while (low < high && a[low] <= pivot) low++;
        a[high] = a[low];
    }
    a[low] = pivot;
    return low;
}
void QuickSort(int a[], int low, int high) {   // 快速排序，不稳定
    if (low < high) {
        int p = Partition(a, low, high);
        QuickSort(a, low, p - 1);
        QuickSort(a, p + 1, high);
    }
}

void SelectSort(int a[], int n) {              // 简单选择，不稳定
    for (int i = 0; i < n - 1; i++) {
        int k = i;
        for (int j = i + 1; j < n; j++) if (a[j] < a[k]) k = j;
        if (k != i) { int t = a[i]; a[i] = a[k]; a[k] = t; }
    }
}

void SiftDown(int a[], int n, int i) {         // 大根堆下沉
    while (2 * i + 1 < n) {
        int j = 2 * i + 1;
        if (j + 1 < n && a[j + 1] > a[j]) j++;
        if (a[i] >= a[j]) break;
        int t = a[i]; a[i] = a[j]; a[j] = t; i = j;
    }
}
void HeapSort(int a[], int n) {                // 堆排序，不稳定
    for (int i = n / 2 - 1; i >= 0; i--) SiftDown(a, n, i);
    for (int i = n - 1; i > 0; i--) { int t = a[0]; a[0] = a[i]; a[i] = t; SiftDown(a, i, 0); }
}

void Merge(int a[], int tmp[], int low, int mid, int high) {
    int i = low, j = mid + 1, k = low;
    while (i <= mid && j <= high) tmp[k++] = (a[i] <= a[j]) ? a[i++] : a[j++];
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= high) tmp[k++] = a[j++];
    for (i = low; i <= high; i++) a[i] = tmp[i];
}
void MergeSort(int a[], int tmp[], int low, int high) {   // 归并，稳定
    if (low >= high) return;
    int mid = (low + high) / 2;
    MergeSort(a, tmp, low, mid);
    MergeSort(a, tmp, mid + 1, high);
    Merge(a, tmp, low, mid, high);
}
```

## 各排序算法对比总表
| 算法 | 平均 | 最坏 | 最好 | 空间 | 稳定 |
|---|---|---|---|---|---|
| 直接插入 | O(n²) | O(n²) | O(n) | O(1) | 稳定 |
| 折半插入 | O(n²) | O(n²) | O(n log n)比较 | O(1) | 稳定 |
| 希尔 | O(n^1.3) | O(n²) | O(n log n) | O(1) | 不稳定 |
| 冒泡 | O(n²) | O(n²) | O(n) | O(1) | 稳定 |
| 快速 | O(n log n) | O(n²) | O(n log n) | O(log n) | 不稳定 |
| 简单选择 | O(n²) | O(n²) | O(n²) | O(1) | 不稳定 |
| 堆 | O(n log n) | O(n log n) | O(n log n) | O(1) | 不稳定 |
| 归并 | O(n log n) | O(n log n) | O(n log n) | O(n) | 稳定 |
| 基数 | O(d(n+r)) | O(d(n+r)) | O(d(n+r)) | O(n+r) | 稳定 |

## 外部排序
当数据量超过内存容量时使用外部排序。基本方法是归并排序思想：先分段读入内存排序，生成若干"初始归并段"写回外存；再进行多路归并。优化手段包括：用败者树降低多路归并中的比较次数；用置换-选择排序增加初始归并段长度、减少归并段个数；用最佳归并树（哈夫曼树思想）安排不等长归并段的归并顺序，使读写外存的总次数最少。外部排序的性能瓶颈是磁盘 I/O 次数。

## 排序算法的选择
元素个数少（n < 50）时用直接插入或简单选择。基本有序时用直接插入或冒泡。n 较大且要求平均性能最好时用快速排序。要求最坏情况仍为 O(n log n) 时用堆排序或归并排序。要求稳定时用归并排序或基数排序。空间受限时用堆排序（原地）。关键字可分解且位数少时用基数排序。

## 常见易错点
把稳定性记混（口诀：**快**速、**选**择、**希**尔、**堆** 不稳定；插入、冒泡、归并、基数 稳定）。快速排序最坏 O(n²) 的条件是划分极不平衡。堆排序建堆复杂度是 O(n)，不是 O(n log n)。归并排序需要 O(n) 额外空间，不是原地算法。基数排序的时间复杂度与位数和基数有关，不能简单说成 O(n)。

## 本节小结
排序是最基础也是考频最高的算法族。理解每种算法的核心思想、时间复杂度、空间复杂度与稳定性，并能根据数据规模、初始有序程度、稳定性要求和空间限制做出选择，是本章的核心目标。
