---
sourceKey: c-pro-array
title: C语言讲义·数组
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 数组与字符串
language: zh-CN
sourceType: team_authored
documentKey: c-pro-array
---

# 数组

## 一维数组的定义与元素类型

数组是一组类型相同、在内存中连续排列的变量的集合，可以用一个统一的名字和不同的下标来访问其中的每个元素。定义一维数组的语法是"元素类型 数组名[长度];"，例如 int score[10]; 定义了一个含 10 个 int 元素的数组。这里有三点必须同时满足：元素类型统一，不能把 int 与 double 混放在同一个数组中；长度必须是大于 0 的编译期整型常量表达式，用变量作长度在 C89 中非法，C99 起支持变长数组，但其长度在运行期确定、不允许初始化，且属于可选特性，工程中不推荐依赖；数组名遵循标识符命名规则。数组一旦定义，元素个数就固定下来，既不能整体赋值，也不能用 == 整体比较。

```c
#include <stdio.h>

#define SIZE 5   /* 编译期常量，用作数组长度 */

int main(void)
{
    int score[SIZE];
    int i;

    for (i = 0; i < SIZE; i++) {
        score[i] = (i + 1) * 10;
    }

    printf("数组共占用 %d 字节，单个元素 %d 字节\n",
           (int)sizeof score, (int)sizeof score[0]);
    printf("元素依次为：");
    for (i = 0; i < SIZE; i++) {
        printf("%d ", score[i]);
    }
    printf("\n");
    return 0;
}
```

## 一维数组的初始化

数组可以在定义时用花括号中的初始化列表赋初值。如果初值个数正好等于数组长度，称为完全初始化，例如 int a[3] = {1, 2, 3};。如果初值个数少于长度，称为部分初始化，此时剩余元素会被自动初始化为 0，这一点与"未初始化的自动数组元素是不确定值"形成鲜明对比：只要写了初始化列表，没有写到的元素一定为 0。如果初值个数多于数组长度则属于错误，编译器会给出诊断信息。此外 int a[3] = {0}; 是一种常用写法，它把全部元素置为 0，比逐个赋值简洁，也比仅声明而不初始化安全得多。

```c
#include <stdio.h>

int main(void)
{
    int full[4] = {10, 20, 30, 40};   /* 完全初始化 */
    int part[5] = {1, 2};             /* 部分初始化，其余为 0 */
    int zeros[6] = {0};               /* 全部元素置 0 */
    int i;

    printf("full：");
    for (i = 0; i < 4; i++) {
        printf("%d ", full[i]);
    }

    printf("\npart：");
    for (i = 0; i < 5; i++) {
        printf("%d ", part[i]);
    }

    printf("\nzeros：");
    for (i = 0; i < 6; i++) {
        printf("%d ", zeros[i]);
    }
    printf("\n");
    return 0;
}
```

## 指定初始化器与长度的自动推导

C99 引入了指定初始化器，允许用 [下标] = 值 的形式为特定元素赋值，没有指定的元素仍然按 0 处理。它的好处是初值与下标一一对应，即使后来调整了数组长度或元素顺序，代码的含义也不会错位。指定初始化器可以乱序书写，重复指定同一个元素时后写的生效。另一种便捷写法是只给出初值而把长度留空：写成 int a[] = {1, 2, 3}; 时编译器会自动把长度确定为初值个数。长度留空时若配合指定初始化器，则长度由最大下标加一决定，例如 int b[] = {[4] = 7}; 得到的是长度为 5 的数组，前四个元素为 0。

```c
#include <stdio.h>

int main(void)
{
    int days[12] = {[0] = 31, [1] = 28, [11] = 31};   /* 其余月份为 0 */
    int value[] = {3, 6, 9};                          /* 长度自动为 3 */
    int sparse[] = {[4] = 7};                         /* 长度为 5 */
    int n;
    int i;

    printf("days[0] = %d，days[1] = %d，days[7] = %d，days[11] = %d\n",
           days[0], days[1], days[7], days[11]);

    n = (int)(sizeof value / sizeof value[0]);
    printf("value 的长度为 %d：", n);
    for (i = 0; i < n; i++) {
        printf("%d ", value[i]);
    }

    n = (int)(sizeof sparse / sizeof sparse[0]);
    printf("\nsparse 的长度为 %d，最后一个元素为 %d\n", n, sparse[4]);
    return 0;
}
```

## 数组元素的访问与下标越界的危害

数组元素通过"数组名[下标]"来访问，下标从 0 开始，合法取值范围是 0 到长度减一。C 语言不检查下标是否越界：编译器只在能静态确定越界时给出警告，运行期没有任何保护。越界读会读到相邻变量的内容，越界写会破坏相邻变量甚至函数的返回地址，程序可能崩溃、可能输出错误结果，也可能看起来一切正常，这类问题统称为未定义行为，最难排查。因此使用下标时必须保证循环边界与数组长度一致，把长度写成宏或常量，并让循环条件使用 i < n 而不是 i <= n。字符串相关操作中的越界还会覆盖结尾的 '\0'，导致后续输出乱码。

```c
#include <stdio.h>

#define N 5

int main(void)
{
    int a[N] = {1, 2, 3, 4, 5};
    int len = N;
    int idx = len + 3;   /* 运行期算出的越界下标，编译器难以静态发现 */
    int i;

    printf("合法访问：");
    for (i = 0; i < N; i++) {     /* 正确写法是 i < N */
        printf("%d ", a[i]);
    }
    printf("\n");

    /* 下面一行故意越界读取，仅用于说明危害，实际工程中严禁这样写 */
    printf("越界读取 a[%d] = %d，该值无意义，属于未定义行为\n", idx, a[idx]);

    for (i = 0; i < N; i++) {
        a[i] = a[i] * 2;          /* 只在合法范围内读写 */
    }
    printf("翻倍后 a[0] = %d，a[%d] = %d\n", a[0], N - 1, a[N - 1]);
    return 0;
}
```

## 数组的连续存储与数组名的含义

数组元素在内存中按下标顺序连续存放，相邻元素的地址之差恰好等于一个元素类型所占的字节数，因此可以用首地址加偏移的方式在常数时间内随机访问任意元素。数组名在表达式中会转换（退化）为指向首元素的指针，其值等于 &a[0]，类型是"指向元素的指针"；所以 sizeof a 得到的是整个数组的字节数，而 sizeof(a + 0) 得到的是指针的大小。&a 的类型是"指向整个数组的指针"，虽然数值上与 &a[0] 相同，但它的步长是整段数组的长度。理解这三种写法的差别，是读懂指针与数组关系的基础。

```c
#include <stdio.h>

int main(void)
{
    int a[5] = {1, 2, 3, 4, 5};
    int *p = a;            /* 等价于 &a[0] */
    int (*whole)[5] = &a;  /* 指向整个数组的指针 */
    int i;

    printf("首元素地址 = %p，数组名 = %p\n", (void *)&a[0], (void *)a);
    printf("sizeof a = %d，sizeof(a + 0) = %d\n",
           (int)sizeof a, (int)sizeof(a + 0));
    printf("&a 与 a 的数值是否相同：%d\n", (void *)&a == (void *)a);

    for (i = 0; i < 5; i++) {
        printf("a[%d] = %d，*(p + %d) = %d，相对偏移 = %d\n",
               i, a[i], i, *(p + i), (int)(&a[i] - p));
    }

    printf("whole 指向整段数组，(*whole)[0] = %d\n", (*whole)[0]);
    return 0;
}
```

## 数组元素作函数实参：值传递

把数组元素作为实参传给函数时，传递的是元素的值，函数的形参是一个独立的局部变量，函数内部对形参的修改不会影响原来的数组元素。这与普通变量的值传递完全一致，适用于只需要元素数值、不需要回写结果的场景，例如求平方、判断奇偶、格式化输出。若确实希望函数修改数组元素，有两种办法：把元素的地址传进去，形参声明为指针，调用时写 &a[i]；或者直接把数组名与下标一起传进去。理解"元素作实参是值传递"可以避免"函数里明明改了参数，外面却没生效"这类困惑。

```c
#include <stdio.h>

int square(int v);
void add_one_by_pointer(int *v);

int main(void)
{
    int a[4] = {1, 2, 3, 4};
    int i;

    for (i = 0; i < 4; i++) {
        printf("a[%d] 的平方 = %d\n", i, square(a[i]));
    }

    printf("调用前 a[0] = %d\n", a[0]);
    add_one_by_pointer(&a[0]);   /* 传地址才能把修改写回原数组 */
    printf("调用后 a[0] = %d\n", a[0]);
    return 0;
}

int square(int v)
{
    return v * v;    /* 形参 v 只是副本，不影响实参 */
}

void add_one_by_pointer(int *v)
{
    *v += 1;         /* 通过指针修改目标对象 */
}
```

## 数组名作函数实参：退化为指针与长度参数

数组名作实参时，传递给函数的不是整个数组的副本，而是首元素的地址，形参写成 int a[] 与 int *a 完全等价，函数内部用 sizeof a 只能得到指针的大小，得不到数组长度。因此必须额外传入元素个数，形参一般写成 (const int a[], int n) 或 (const int *a, int n)。在形参中写 int a[10] 里的长度会被编译器忽视，它不表示任何边界检查，只起文档作用。调用时写成 f(a, n)，其中 n 通常由调用方用 sizeof a / sizeof a[0] 算出，因为只有在定义数组的那个作用域里，sizeof 才能得到真实的数组总大小。

```c
#include <stdio.h>

/* 形参 a 实际是指针，必须另传长度 n */
void print_array(const int a[], int n)
{
    int i;
    /* -Wall 下编译器会提示 sizeof 作用于数组形参只能得到指针大小，
       这条警告恰好印证了数组名作实参时会退化为指针 */
    printf("函数内 sizeof(a) = %d（只是指针大小）\n", (int)sizeof a);
    for (i = 0; i < n; i++) {
        printf("%d ", a[i]);
    }
    printf("\n");
}

void fill(int *a, int n, int value)
{
    int i;
    for (i = 0; i < n; i++) {
        a[i] = value;   /* 通过指针修改调用方的数组 */
    }
}

int main(void)
{
    int a[6] = {2, 4, 6, 8, 10, 12};
    int n = (int)(sizeof a / sizeof a[0]);

    printf("调用方 sizeof(a) = %d，元素个数 = %d\n", (int)sizeof a, n);
    print_array(a, n);

    fill(a, n, 7);
    printf("填充后的数组：");
    print_array(a, n);
    return 0;
}
```

## 求最大值、最小值及其下标

在数组中查找最值的基本思路是先假定第一个元素为当前最值，再从第二个元素开始依次比较，遇到更大或更小的元素就更新最值并记录下标。循环结束时既得到最值，也得到它所在的位置。这个模式可以同时求最大值与最小值：用两对变量分别维护，各自独立更新即可。有几点需要注意：数组长度必须大于 0，否则"取第一个元素"就已经越界；比较浮点数时不要直接用 ==，而应结合精度判断；若要找最值多次出现的位置，可以在更新条件里选择用严格大于来保留最先出现的下标，或用大于等于来保留最后出现的下标。

```c
#include <stdio.h>

#define N 8

int main(void)
{
    int score[N] = {78, 92, 65, 92, 88, 71, 100, 59};
    int max_val = score[0], max_idx = 0;
    int min_val = score[0], min_idx = 0;
    int sum = score[0];
    int i;

    for (i = 1; i < N; i++) {
        if (score[i] > max_val) {   /* 严格大于：保留最先出现的最大下标 */
            max_val = score[i];
            max_idx = i;
        }
        if (score[i] < min_val) {
            min_val = score[i];
            min_idx = i;
        }
        sum += score[i];
    }

    printf("最高分 = %d（下标 %d）\n", max_val, max_idx);
    printf("最低分 = %d（下标 %d）\n", min_val, min_idx);
    printf("总分 = %d，平均分 = %.2f\n", sum, (double)sum / N);
    return 0;
}
```

## 数组逆置：就地交换

逆置指把数组的首尾元素对调：第 0 个与第 n−1 个交换，第 1 个与第 n−2 个交换，依次向内进行。实现时用两个下标 i 与 j 分别从两端向中间移动，只要 i < j 就交换，然后 i 自增、j 自减。循环条件必须写成 i < j 而不是 i <= j，否则中间元素会与自己交换，虽然结果不变，却做了无意义的操作。交换两个元素需要借助临时变量，也可以用异或技巧实现，但异或写法可读性差、容易出错，不推荐在工程中使用。逆置可以在原数组上就地完成，只需要常数级额外空间，是双指针思路最简单的范例，也是判断回文串与字符串反转的基础。

```c
#include <stdio.h>

#define N 7

void reverse(int a[], int n)
{
    int i = 0;
    int j = n - 1;
    int tmp;

    while (i < j) {
        tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
        i++;
        j--;
    }
}

int main(void)
{
    int a[N] = {1, 2, 3, 4, 5, 6, 7};
    int i;

    printf("逆置前：");
    for (i = 0; i < N; i++) {
        printf("%d ", a[i]);
    }
    printf("\n");

    reverse(a, N);

    printf("逆置后：");
    for (i = 0; i < N; i++) {
        printf("%d ", a[i]);
    }
    printf("\n");
    return 0;
}
```

## 冒泡排序及其优化

冒泡排序反复走访待排序序列，依次比较相邻的两个元素，若顺序错误就交换。每一趟都会把当前未排序部分中的最大元素"冒"到末尾，因此第 k 趟结束后末尾的 k 个元素已经就位，内层循环的比较次数可以减少为 n−1−k。基础版本无论数据是否已经有序都要跑满 n−1 趟，时间复杂度为 O(n²)。常用优化是设置一个交换标志：若某一趟中没有发生任何交换，说明序列已经有序，可以立即结束排序，这样对原本有序的数组只需一趟就能退出，最好情况的时间复杂度为 O(n)。冒泡排序是稳定排序，相等元素的相对次序不会改变。

```c
#include <stdio.h>

void bubble_sort(int a[], int n)
{
    int i, j, tmp, swapped;

    for (i = 0; i < n - 1; i++) {
        swapped = 0;
        for (j = 0; j < n - 1 - i; j++) {
            if (a[j] > a[j + 1]) {
                tmp = a[j];
                a[j] = a[j + 1];
                a[j + 1] = tmp;
                swapped = 1;
            }
        }
        if (!swapped) {   /* 本趟没有任何交换，说明已经有序 */
            break;
        }
    }
}

int main(void)
{
    int a[9] = {49, 38, 65, 97, 76, 13, 27, 49, 1};
    int n = (int)(sizeof a / sizeof a[0]);
    int i;

    bubble_sort(a, n);

    printf("冒泡排序结果：");
    for (i = 0; i < n; i++) {
        printf("%d ", a[i]);
    }
    printf("\n");
    return 0;
}
```

## 选择排序

选择排序的每一趟从未排序区间中选出最小元素，把它与未排序区间的第一个位置交换，然后未排序区间右移一位。与冒泡排序相比，它的交换次数最多为 n−1 次，明显少于冒泡排序的多次相邻交换，因此在元素交换代价较大的场合更有优势；但比较次数仍固定为 n(n−1)/2，时间复杂度为 O(n²)，且不受输入初始顺序的影响，对已经有序的数组也提供不了任何优化。实现时外层循环 i 从 0 到 n−2，内层循环 j 从 i+1 到 n−1 寻找最小值下标 min，若 min 不等于 i 再执行交换。选择排序通常被认为是不稳定的，因为跨越式交换可能改变相等元素的相对次序。

```c
#include <stdio.h>

void selection_sort(int a[], int n)
{
    int i, j, min, tmp;

    for (i = 0; i < n - 1; i++) {
        min = i;
        for (j = i + 1; j < n; j++) {
            if (a[j] < a[min]) {
                min = j;
            }
        }
        if (min != i) {
            tmp = a[i];
            a[i] = a[min];
            a[min] = tmp;
        }
    }
}

int main(void)
{
    int a[7] = {64, 25, 12, 22, 11, 90, 11};
    int n = (int)(sizeof a / sizeof a[0]);
    int i;

    selection_sort(a, n);

    printf("选择排序结果：");
    for (i = 0; i < n; i++) {
        printf("%d ", a[i]);
    }
    printf("\n");
    return 0;
}
```

## 顺序查找与二分查找

顺序查找又称线性查找，从前到后逐个比较，适用于无序数组，时间复杂度为 O(n)，实现简单且不需要任何预处理。二分查找又称折半查找，要求数组按关键字有序，每一轮取中间元素与目标比较，据此把查找区间缩小一半，时间复杂度为 O(log n)，在数据量大时优势明显。二分查找的循环条件写 low <= high，中点用 mid = low + (high - low) / 2 计算，以避免 low + high 溢出；找到时返回下标，未找到时返回 −1 是常见约定。注意 mid 必须在循环体内重新计算，缩小区间时要用 mid + 1 与 mid − 1，否则会陷入死循环。

```c
#include <stdio.h>

int linear_search(const int a[], int n, int key)
{
    int i;
    for (i = 0; i < n; i++) {
        if (a[i] == key) {
            return i;
        }
    }
    return -1;
}

int binary_search(const int a[], int n, int key)
{
    int low = 0;
    int high = n - 1;

    while (low <= high) {
        int mid = low + (high - low) / 2;   /* 避免加法溢出 */
        if (a[mid] == key) {
            return mid;
        } else if (a[mid] < key) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return -1;
}

int main(void)
{
    int a[10] = {3, 9, 15, 21, 27, 33, 41, 58, 66, 74};
    int n = (int)(sizeof a / sizeof a[0]);

    printf("顺序查找 41 得到下标 %d\n", linear_search(a, n, 41));
    printf("二分查找 41 得到下标 %d\n", binary_search(a, n, 41));
    printf("二分查找不存在的 50 得到下标 %d\n", binary_search(a, n, 50));
    return 0;
}
```

## 二维数组的定义与初始化

二维数组可以看作"元素是一维数组的数组"，定义形式是"元素类型 数组名[行数][列数];"，例如 int matrix[3][4]; 表示 3 行 4 列共 12 个 int 元素。初始化有两种常见写法：按行分组初始化，即 int a[2][3] = {{1,2,3},{4,5,6}}; 层次清晰，推荐使用；按存储顺序连续书写，即 int b[2][3] = {1,2,3,4,5,6}; 效果完全相同，但可读性差，行数较多时极易错位。部分初始化时，没有写到的元素一律为 0。当初始化列表按行给出完整分组时，可以不写第一维的行数，由编译器自动推算，例如 int c[][3] = {{7},{8,9}}; 得到 2 行 3 列。

```c
#include <stdio.h>

int main(void)
{
    int a[2][3] = {{1, 2, 3}, {4, 5, 6}};
    int b[2][3] = {1, 2, 3, 4, 5, 6};   /* 连续书写；-Wall 会提示缺少行分组花括号 */
    int c[][3] = {{7}, {8, 9}};   /* 只给列数，行数自动确定为 2 */
    int d[2][3] = {{1}};          /* 部分初始化，其余元素为 0 */
    int i, j;

    printf("a 的元素：");
    for (i = 0; i < 2; i++) {
        for (j = 0; j < 3; j++) {
            printf("%d ", a[i][j]);
        }
    }

    printf("\nb 的元素：");
    for (i = 0; i < 2; i++) {
        for (j = 0; j < 3; j++) {
            printf("%d ", b[i][j]);
        }
    }

    printf("\nc[1][2] = %d，d[0][2] = %d，d[1][0] = %d\n",
           c[1][2], d[0][2], d[1][0]);
    return 0;
}
```

## 二维数组的存储顺序与行列求法

二维数组在内存中按行优先顺序存放：先依次存放第 0 行的所有元素，再存放第 1 行，依此类推。因此元素 a[i][j] 的地址等于首地址加上 (i × 列数 + j) × 元素大小。这个公式说明列数在地址计算中起关键作用，也解释了为什么二维数组作函数形参时必须给出列数。二维数组名 a 可以视为"指向一维数组的指针"，a[i] 是第 i 行的数组名，类型为"指向含列数个元素的一维数组的指针"；sizeof a 得到整段字节数，sizeof a[0] 得到一行的字节数，二者相除即行数，sizeof a[0] 再除以 sizeof a[0][0] 即列数。

```c
#include <stdio.h>

int main(void)
{
    int a[3][4] = {{1, 2, 3, 4}, {5, 6, 7, 8}, {9, 10, 11, 12}};
    int rows = (int)(sizeof a / sizeof a[0]);
    int cols = (int)(sizeof a[0] / sizeof a[0][0]);
    int i, j;

    printf("行数 = %d，列数 = %d，总字节 = %d\n",
           rows, cols, (int)sizeof a);
    printf("sizeof a[0] = %d，即一行占用的字节数\n", (int)sizeof a[0]);

    for (i = 0; i < rows; i++) {
        printf("第 %d 行首地址 %p：", i, (void *)a[i]);
        for (j = 0; j < cols; j++) {
            printf("%d ", *(*(a + i) + j));   /* 指针方式访问元素 */
        }
        printf("\n");
    }

    printf("a[2][3] 相对首地址的偏移元素个数 = %d\n", 2 * cols + 3);
    return 0;
}
```

## 二维数组的遍历与常见操作

二维数组的常见操作包括按行求和、求每行最大值、矩阵转置与矩阵加法。遍历统一使用两重循环，外层枚举行、内层枚举列，这样访问顺序与内存存放顺序一致，对缓存友好。矩阵转置把 a[i][j] 写入 b[j][i]，因此转置后矩阵的行数等于原矩阵的列数，实现时必须保证两个数组的行列规模匹配；非方阵的转置不能只用一个数组原地完成，通常借助第二个数组。矩阵加法要求两个矩阵同型，对应位置相加后存入第三个数组。下面程序同时演示按行求和、矩阵加法与矩阵转置三种操作，可作为多维数组综合练习的模板。

```c
#include <stdio.h>

#define ROWS 2
#define COLS 3

int main(void)
{
    int a[ROWS][COLS] = {{1, 2, 3}, {4, 5, 6}};
    int b[ROWS][COLS] = {{10, 20, 30}, {40, 50, 60}};
    int sum[ROWS][COLS];
    int trans[COLS][ROWS];
    int i, j;

    for (i = 0; i < ROWS; i++) {
        int row_sum = 0;
        for (j = 0; j < COLS; j++) {
            sum[i][j] = a[i][j] + b[i][j];
            row_sum += a[i][j];
        }
        printf("a 的第 %d 行之和 = %d\n", i, row_sum);
    }

    for (i = 0; i < COLS; i++) {
        for (j = 0; j < ROWS; j++) {
            trans[i][j] = a[j][i];
        }
    }

    printf("矩阵加法的第 1 行：%d %d %d\n", sum[1][0], sum[1][1], sum[1][2]);
    printf("转置矩阵为 %d 行 %d 列：", (int)(sizeof trans / sizeof trans[0]),
           (int)(sizeof trans[0] / sizeof trans[0][0]));
    for (i = 0; i < COLS; i++) {
        for (j = 0; j < ROWS; j++) {
            printf("%d ", trans[i][j]);
        }
    }
    printf("\n");
    return 0;
}
```

## 二维数组作函数参数

二维数组作形参时，编译器必须知道列数才能正确计算 a[i][j] 的地址，因此形参中第二维的长度必须写出来，例如 void f(int a[][4], int rows) 或等价的 void f(int (*a)[4], int rows)。第一维长度可以不写，因为它与地址计算无关，但函数内部若要用到行数，就必须另行传入。不能写成 void f(int a[][], int rows, int cols) 这种形式，那样编译无法通过。这与一维数组"长度可以不写"的规则不同，根源在于二维数组按行优先存储、行内元素连续。若确实需要列数可变，可以使用"指针的指针"配合动态内存分配，或者把二维数组按一维方式处理并手工换算下标。

```c
#include <stdio.h>

#define COLS 4

/* 列数必须写出；等价写法为 int (*a)[COLS] */
int row_sum(int a[][COLS], int row)
{
    int j, total = 0;

    for (j = 0; j < COLS; j++) {
        total += a[row][j];
    }
    return total;
}

void print_matrix(int (*a)[COLS], int rows)
{
    int i, j;

    for (i = 0; i < rows; i++) {
        for (j = 0; j < COLS; j++) {
            printf("%4d", a[i][j]);
        }
        printf("\n");
    }
}

int main(void)
{
    int a[3][COLS] = {
        {1, 2, 3, 4},
        {5, 6, 7, 8},
        {9, 10, 11, 12}
    };
    int rows = (int)(sizeof a / sizeof a[0]);
    int i;

    print_matrix(a, rows);
    for (i = 0; i < rows; i++) {
        printf("第 %d 行之和 = %d\n", i, row_sum(a, i));
    }
    return 0;
}
```

## 综合示例：成绩统计与分数段分布

综合运用数组可以完成一个班级的成绩分析：把成绩存入数组，计算总分与平均分，找出最高分与最低分，并统计各分数段的人数。统计分数段时常用计数数组技巧，用下标代表分数段，例如用 bucket[score / 10] 表示该分段的人数，这样一次遍历就能完成分类统计，避免书写多个 if 分支。这种以数值作下标的做法是散列思想的雏形，使用时必须保证下标不越界，即成绩必须落在 0 到 100 之间，必要时先做范围校验。下面程序演示完整的成绩统计流程，输出平均分、最值与各分数段人数。

```c
#include <stdio.h>

#define N 10
#define BUCKETS 11   /* 0~9 分到 100 分共 11 段 */

int main(void)
{
    int score[N] = {95, 72, 58, 88, 100, 63, 45, 91, 77, 84};
    int bucket[BUCKETS] = {0};
    int sum = 0;
    int max = score[0];
    int min = score[0];
    int i;

    for (i = 0; i < N; i++) {
        int level = score[i] / 10;

        if (level < 0 || level >= BUCKETS) {
            printf("成绩 %d 超出 0~100 范围，已跳过统计\n", score[i]);
            continue;
        }
        bucket[level]++;
        sum += score[i];
        if (score[i] > max) {
            max = score[i];
        }
        if (score[i] < min) {
            min = score[i];
        }
    }

    printf("平均分 = %.2f，最高分 = %d，最低分 = %d\n",
           (double)sum / N, max, min);

    for (i = 0; i < BUCKETS; i++) {
        if (bucket[i] > 0) {
            printf("%3d ~ %3d 分：%d 人\n", i * 10, i * 10 + 9, bucket[i]);
        }
    }
    return 0;
}
```
