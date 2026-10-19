---
sourceKey: c-pro-pointer
title: C语言讲义·指针
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 指针
language: zh-CN
sourceType: team_authored
documentKey: c-pro-pointer
---
# 指针

## 地址与指针的概念
程序运行时，内存被划分为一个个编号的存储单元，每个字节都有唯一的编号，这个编号就是地址。变量在内存中占据若干连续字节，其首字节的地址称为变量的地址，用取地址运算符 & 可以得到。指针是一种专门用来存放地址的变量类型，它本身也占用内存，在 64 位平台上通常是 8 个字节。通过指针访问它所指向的对象称为间接访问或解引用，用运算符 * 完成。指针的价值在于：函数之间可以通过地址共享同一块数据，避免大对象的复制；同时数组、字符串和动态内存都要借助指针来操作。

```c
#include <stdio.h>

int main(void)
{
    int value = 42;
    int *p = &value;                 /* p 中保存 value 的地址 */

    printf("value 的值：%d\n", value);
    printf("value 的地址：%p\n", (void *)&value);
    printf("指针 p 中保存的地址：%p\n", (void *)p);
    printf("通过 p 间接访问得到：%d\n", *p);
    printf("p 与 &value 是否相同：%s\n", (p == &value) ? "相同" : "不同");
    return 0;
}
```

## 指针变量的定义与初始化
定义指针的写法是“类型 * 变量名”，其中类型指的是指针所指对象的类型，星号表示这是一个指针。取地址运算符 & 作用于变量得到其地址，解引用运算符 * 作用于指针得到所指对象，两者互为逆运算。指针必须在首次使用前初始化：如果已经确定目标就写成 `int *p = &a;`，如果暂时没有目标就赋 NULL，绝不能留作未初始化的野指针。要注意 `int *p, q;` 中只有 p 是指针，q 是普通整型变量，每个指针都需要单独的星号。

```c
#include <stdio.h>

int main(void)
{
    int a = 10;
    int b = 20;
    int *p = &a;      /* 定义时立即初始化，最安全的写法 */
    int *q = NULL;    /* 暂无目标时置空 */

    *p = 100;         /* 修改 a 的值 */
    printf("通过指针修改后 a = %d\n", a);

    p = &b;           /* 指针本身可以重新赋值 */
    *p = 200;
    printf("p 改指 b 后：a = %d, b = %d\n", a, b);
    printf("p 当前是否指向 b：%s\n", (p == &b) ? "是" : "否");

    if (q == NULL) {
        printf("q 是空指针，解引用之前必须先判空\n");
    }
    return 0;
}
```

## 指针的类型与所指类型
指针的类型决定了三件事：一次间接访问能读写多少字节、指针加减整数时跨过多少字节、以及解引用结果的类型。int 指针加一前进 sizeof(int) 个字节，char 指针加一前进一个字节，在数组上移动指针时必须清楚步长。所指类型则决定编译器如何解释这块内存，把 double 的地址赋给 int 指针属于类型不匹配，即使强制转换后能通过编译，读写长度也不同，会造成数据错乱。把 `const int *` 赋给 `int *` 同样危险，因为它让程序获得了修改只读数据的途径。

```c
#include <stdio.h>

int main(void)
{
    int arr[4] = {10, 20, 30, 40};
    char str[4] = {'a', 'b', 'c', '\0'};
    int *ip = arr;
    char *cp = str;

    printf("ip 所指为 %d，ip+1 所指为 %d，步长 %zu 字节\n",
           *ip, *(ip + 1), sizeof(int));
    printf("cp 所指为 %c，cp+1 所指为 %c，步长 %zu 字节\n",
           *cp, *(cp + 1), sizeof(char));
    printf("用下标访问第三个元素：ip[2] = %d\n", ip[2]);
    printf("把 double 地址赋给 int 指针会改变解释方式，属于危险操作\n");
    return 0;
}
```

## 野指针、空指针与规避
野指针指指向位置不确定的指针，常见来源有三种：声明后未初始化，指针变量里保存的是垃圾值；指针所指对象已经释放或函数已经返回，指针仍然保留旧地址；指针越界移动后落在数组之外。解引用野指针的行为未定义，通常表现为段错误或难以复现的乱码。空指针 NULL 是明确表示“不指向任何对象”的指针常量，对空指针解引用同样会崩溃，但可以通过判空提前拦截。工程上的做法是：定义时立即初始化，释放内存后立刻把指针置为 NULL，函数内部对传入的指针先判空再使用。

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int *safe = NULL;                        /* 明确置空，用前判空 */
    int *heap = malloc(sizeof(int));

    if (heap == NULL) {
        printf("内存分配失败，直接返回\n");
        return 1;
    }
    *heap = 7;
    printf("堆内存中的值：%d\n", *heap);

    free(heap);        /* 释放后该地址不再属于本程序 */
    heap = NULL;       /* 立即置空，避免悬空指针 */
    printf("释放后已置空：%s\n", (heap == NULL) ? "是" : "否");

    if (safe == NULL) {
        printf("safe 为空指针，直接解引用会导致崩溃\n");
    }
    return 0;
}
```

## 指针的算术运算
指针支持加减整数、两个指针相减、以及指针之间的比较，但这些运算只在同一数组对象内部才有明确定义。指针加 n 表示向后移动 n 个所指类型的元素，而不是 n 个字节；两个指针相减得到它们之间相隔的元素个数，结果类型是 ptrdiff_t，输出时用 %td；比较运算符可用于判断先后顺序，常作为遍历的循环条件。指针加上数组长度得到的“尾后指针”可以参与比较，但不能解引用。对不是同一数组的两个指针做减法或比较，结果没有意义。

```c
#include <stdio.h>

int main(void)
{
    int a[5] = {1, 2, 3, 4, 5};
    int *p = a;
    int *q = a + 4;
    const int *begin = a;
    const int *end = a + 5;

    printf("*(p+2) = %d，与 a[2] = %d 一致\n", *(p + 2), a[2]);
    printf("q - p = %td，相隔 %td 个元素\n", q - p, q - p);
    printf("p 在 q 之前：%s\n", (p < q) ? "成立" : "不成立");

    p += 3;
    printf("p 前进 3 个元素后指向 %d\n", *p);
    p -= 2;
    printf("p 回退 2 个元素后指向 %d\n", *p);
    printf("区间长度为 %td\n", end - begin);
    return 0;
}
```

## 指针与数组的关系
数组名在大多数表达式中会转换成指向首元素的指针，因此 `a[i]` 与 `*(a + i)` 完全等价，编译器对下标运算符的定义就是后者加上指针加法；同理 `p[i]` 与 `*(p + i)` 也等价，即使 p 只是一个普通的指针变量。数组名与指针仍有两处本质差别：数组名不是变量，不能被赋值也不能自增，`a++` 无法通过编译；sizeof 作用于数组名得到整个数组的字节数，作用于指针只得到指针本身的大小，这就是数组作为函数参数后退化为指针、sizeof 结果随之改变的原因。

```c
#include <stdio.h>

int main(void)
{
    int a[5] = {2, 4, 6, 8, 10};
    int *p = a;
    size_t i;

    for (i = 0; i < 5; i++) {
        printf("a[%zu]=%d  *(a+%zu)=%d  p[%zu]=%d\n",
               i, a[i], i, *(a + i), i, p[i]);
    }
    printf("sizeof(a)=%zu（整个数组） sizeof(p)=%zu（一个指针）\n",
           sizeof(a), sizeof(p));
    printf("a 与 &a[0] 是否相同：%s\n", (a == &a[0]) ? "相同" : "不同");
    printf("a 是常量地址，不能执行自增运算\n");
    return 0;
}
```

## 用指针遍历数组与字符串
指针遍历的核心写法是让游标从首元素出发，每轮解引用取值后自增，直到超出有效范围。顺序遍历用 `p < a + n` 作为条件，倒序遍历从最后一个元素出发，条件是 `p >= a`，每次自减。字符串遍历则以 `*p != '\0'` 作为停止条件，因为字符串的有效长度由结束符决定，而不是数组容量。用指针求长度时，让游标一直走到结束符位置，再用游标减去起始指针即可得到字符个数，这种写法和标准库 strlen 的内部逻辑一致。

```c
#include <stdio.h>
#include <stddef.h>

size_t ptr_strlen(const char *s)
{
    const char *p = s;
    while (*p != '\0') {
        p++;
    }
    return (size_t)(p - s);
}

int main(void)
{
    int a[6] = {1, 2, 3, 4, 5, 6};
    const char *text = "pointer";
    int *p;
    const char *q;

    printf("顺序遍历：");
    for (p = a; p < a + 6; p++) {
        printf("%d ", *p);
    }
    printf("\n倒序遍历：");
    for (p = a + 5; p >= a; p--) {
        printf("%d ", *p);
    }
    printf("\n字符串倒序输出：");
    q = text + ptr_strlen(text) - 1;   /* 指向最后一个字符 */
    while (q >= text) {
        putchar(*q);
        q--;
    }
    putchar('\n');
    printf("字符串长度为 %zu\n", ptr_strlen(text));
    return 0;
}
```

## 指针数组与数组指针
这两个概念只差一对括号，含义却完全不同。指针数组 `int *p[3]` 是数组，三个元素都是 int 指针，常用来组织若干同类型数据的地址，也可以表示字符串列表。数组指针 `int (*p)[3]` 是指针，指向一个含三个 int 的数组，它在处理二维数组时非常有用，因为二维数组的数组名正是指向首行的数组指针。区分方法是看运算符优先级：下标运算符 [] 的优先级高于 *，所以没有括号时先结合成数组；加了括号后 p 先与 * 结合，成为指针。读法是“从变量名出发，先看右边再看左边”。

```c
#include <stdio.h>

int main(void)
{
    int x = 1, y = 2, z = 3;
    int *ptr_array[3] = {&x, &y, &z};        /* 指针数组：元素是指针 */
    int matrix[2][3] = {{1, 2, 3}, {4, 5, 6}};
    int (*row_ptr)[3] = matrix;              /* 数组指针：指向一行 */
    size_t i;

    for (i = 0; i < 3; i++) {
        printf("ptr_array[%zu] 指向的值：%d\n", i, *ptr_array[i]);
    }
    printf("row_ptr[1][2] = %d\n", row_ptr[1][2]);
    printf("*(*(row_ptr+1)+1) = %d\n", *(*(row_ptr + 1) + 1));
    printf("行数 %zu，每行 %zu 个元素\n",
           sizeof(matrix) / sizeof(matrix[0]),
           sizeof(matrix[0]) / sizeof(matrix[0][0]));
    return 0;
}
```

## 二级指针
二级指针就是指向指针的指针，形如 `int **pp`。它最常见的用途是让函数修改调用者手里的指针本身：如果函数参数写成一级指针，函数内只能改指针所指对象的值；写成二级指针后，`*pp = target;` 才能真正改变调用者的指针指向。另一个典型场景是字符串指针数组与命令行参数，`char *argv[]` 作为参数时等价于 `char **argv`，argv 本身是二级指针，argv[i] 是字符指针。使用二级指针时要逐层判空，先确认 pp 非空，再确认 *pp 非空，才能访问 **pp。

```c
#include <stdio.h>
#include <string.h>

/* 通过二级指针修改调用者的指针本身 */
void point_to(const char *target, const char **pp)
{
    if (pp != NULL) {
        *pp = target;      /* 改变调用者的指针指向 */
    }
}

int main(void)
{
    const char *names[] = {"alpha", "beta", "gamma"};
    const char *cur = "alpha";
    const char **pp = &cur;
    size_t i;

    printf("调用前 cur 指向：%s\n", cur);
    point_to("gamma", pp);
    printf("调用后 cur 指向：%s\n", cur);

    for (i = 0; i < sizeof(names) / sizeof(names[0]); i++) {
        printf("names[%zu] = %s，长度 %zu\n", i, names[i], strlen(names[i]));
    }
    printf("argv 作为参数时等价于二级指针，argv[i] 是字符指针\n");
    return 0;
}
```

## 指向函数的指针
函数名在表达式中会转换成函数入口地址，因此可以定义指向函数的指针：`int (*fp)(int, int);` 表示 fp 是一个指针，指向参数为两个 int、返回 int 的函数。把函数名赋给 fp 之后，`fp(3, 4)` 与 `(*fp)(3, 4)` 效果相同。函数指针最大的价值是回调：把函数指针作为参数传入，让库函数在合适的时机调用调用者提供的逻辑，例如排序的比较函数。函数指针数组则可以实现分支表，用下标代替冗长的多重 if 或 switch，结构更清晰、便于扩展。定义时那对括号必须保留：`int *f(int, int)` 是返回指针的函数声明，`int (*f)(int, int)` 才是指向函数的指针，两者含义完全不同。赋值时参数个数、参数类型与返回类型都必须严格一致，否则要么编译报错，要么在调用时产生未定义行为。

```c
#include <stdio.h>

int add(int a, int b) { return a + b; }
int sub(int a, int b) { return a - b; }
int mul(int a, int b) { return a * b; }

/* 回调：把函数指针作为参数 */
int apply(int (*op)(int, int), int a, int b)
{
    return op(a, b);
}

int main(void)
{
    int (*fp)(int, int) = add;
    int (*table[3])(int, int) = {add, sub, mul};
    const char *labels[3] = {"add", "sub", "mul"};
    size_t i;

    printf("直接调用：%d\n", fp(3, 4));
    printf("解引用后调用：%d\n", (*fp)(10, 4));
    printf("作为回调传入：%d\n", apply(mul, 6, 7));

    for (i = 0; i < 3; i++) {
        printf("%s(8, 2) = %d\n", labels[i], table[i](8, 2));
    }
    return 0;
}
```

## 返回指针的函数
函数可以返回指针，但返回的地址必须在函数结束后依然有效。合法的来源有三类：静态变量或全局变量，它们具有静态存储期，生命周期贯穿整个程序；堆上动态分配的内存，由调用者负责释放；以及通过参数传入的地址，原样返回即可。非法的情形是返回局部自动变量的地址，这类变量在函数返回时随栈帧一起失效，得到的指针立刻变成悬空指针，使用它属于未定义行为。编译器通常会对这种明显错误给出警告，但通过中间变量绕过后就不再报警，因此必须靠代码规范来保证。

```c
#include <stdio.h>
#include <stdlib.h>

static int counter = 0;              /* 静态存储期，函数结束后仍然有效 */

int *next_counter(void)
{
    counter++;
    return &counter;                 /* 合法：返回静态变量地址 */
}

int *make_array(size_t n)
{
    int *p = malloc(n * sizeof(int));
    return p;                        /* 合法：返回堆内存，调用者负责释放 */
}

/* 错误示范：局部数组在函数返回后失效
char *bad(void)
{
    char buf[16] = "temp";
    return buf;
}
*/

int main(void)
{
    int *v = next_counter();
    size_t i;

    printf("静态变量地址有效，值为 %d\n", *v);
    *v = 99;
    printf("通过返回的指针修改后 counter = %d\n", counter);

    int *arr = make_array(4);
    if (arr == NULL) {
        printf("分配失败\n");
        return 1;
    }
    for (i = 0; i < 4; i++) {
        arr[i] = (int)(i * i);
    }
    printf("堆数组内容：%d %d %d %d\n", arr[0], arr[1], arr[2], arr[3]);
    free(arr);
    arr = NULL;
    return 0;
}
```

## const 与指针的三种形式
const 与指针结合时有三种写法，区别在于 const 修饰的是所指数据还是指针本身。`const int *p` 表示所指对象只读，不能通过 p 修改数据，但 p 可以改指别处，常用于只读形参。`int *const p` 表示指针本身是常量，必须在定义时初始化，之后不能改指，但所指数据可以修改。`const int *const p` 两者都不可改，是限制最严的形式。读法要点是看 const 出现在星号的哪一侧：出现在左侧修饰所指数据，出现在右侧修饰指针变量本身。函数参数尽量使用第一种形式，可以同时接受可写与只读的实参。

```c
#include <stdio.h>

int main(void)
{
    int a = 10;
    int b = 20;

    const int *p1 = &a;         /* 所指数据只读 */
    int *const p2 = &a;         /* 指针本身只读 */
    const int *const p3 = &a;   /* 两者都只读 */

    p1 = &b;                    /* 合法：改变指向 */
    /* *p1 = 1;  非法：不能改写所指数据 */

    *p2 = 11;                   /* 合法：改写所指数据 */
    /* p2 = &b;  非法：指针本身不能改指 */

    printf("a = %d, b = %d\n", a, b);
    printf("*p1 = %d, *p2 = %d, *p3 = %d\n", *p1, *p2, *p3);
    printf("读法：const 在星号左侧修饰数据，在星号右侧修饰指针\n");
    return 0;
}
```

## 指针作为函数参数
C 语言的参数传递是值传递，函数内修改形参不会影响实参。把变量的地址传进去，函数通过解引用修改地址上的内容，就能真正改变调用者的变量，这是指针最重要的用途之一。交换两个变量的经典实现必须接收两个指针，函数体的三次赋值都作用于解引用后的对象。另一个常见用法是用输出参数模拟多返回值：函数只返回一个状态码，把多个结果通过指针参数写回，例如同时求出最小值与最大值。使用输出参数前要保证指针非空，并且所指对象可写。

```c
#include <stdio.h>

void swap(int *x, int *y)          /* 必须传入地址才能修改实参 */
{
    int tmp = *x;
    *x = *y;
    *y = tmp;
}

/* 用输出参数实现多返回值：同时求最小值和最大值 */
void min_max(const int *a, size_t n, int *out_min, int *out_max)
{
    size_t i;
    *out_min = a[0];
    *out_max = a[0];
    for (i = 1; i < n; i++) {
        if (a[i] < *out_min) {
            *out_min = a[i];
        }
        if (a[i] > *out_max) {
            *out_max = a[i];
        }
    }
}

int main(void)
{
    int x = 3, y = 8;
    int data[6] = {5, -2, 9, 0, 7, 4};
    int lo = 0, hi = 0;

    swap(&x, &y);
    printf("交换后 x = %d, y = %d\n", x, y);

    min_max(data, 6, &lo, &hi);
    printf("最小值 %d，最大值 %d\n", lo, hi);
    return 0;
}
```

## void 通用指针
void 指针是不带所指类型的指针，任何对象指针都能隐式转换成它，它也能隐式转换回原来的类型。正因为不知道所指类型，void 指针不能解引用，也不能做算术运算，必须先转换成具体类型再用。标准库中的 malloc、memcpy、qsort 都使用 void 指针对外提供通用接口，这是 C 语言实现泛型的主要手段。使用时的注意点是：转换回的类型必须与当初存入的类型一致，长度也要匹配，把 int 数组的首地址转成 char 指针并按照 int 的长度读写会造成数据被错误解释。

```c
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

/* 以字节为单位打印对象的内部表示 */
void show_bytes(const void *data, size_t n)
{
    const unsigned char *p = data;   /* 先转成字节指针才能逐字节访问 */
    size_t i;
    for (i = 0; i < n; i++) {
        printf("%02X ", p[i]);
    }
    putchar('\n');
}

int main(void)
{
    int value = 0x01020304;
    double pi = 3.5;
    char text[] = "ok";

    show_bytes(&value, sizeof(value));
    show_bytes(&pi, sizeof(pi));
    show_bytes(text, strlen(text) + 1);

    int *raw = malloc(4 * sizeof(int));
    if (raw == NULL) {
        printf("分配失败\n");
        return 1;
    }
    int *typed = (int *)raw;         /* 转回原类型后再使用 */
    typed[0] = 1;
    typed[3] = 4;
    printf("首元素 %d，末元素 %d\n", typed[0], typed[3]);
    free(raw);
    raw = NULL;
    return 0;
}
```

## 指针与字符串字面量、字符指针数组
字符串字面量的类型是字符数组，但位于只读区，因此用字符指针接收时应当写成 `const char *`。多个字符串可以用两种结构组织：字符指针数组 `const char *names[]` 让每个元素指向一个独立的字面量，各串长度可以不同，占用空间小，但内容不可修改；二维字符数组 `char names[3][8]` 按固定行长存放，内容可修改，但行长受限于最长的那一个。命令行参数正是字符指针数组的典型应用：main 的第二个参数 argv 是一个字符指针数组，argv[0] 是程序名，argv[1] 起是用户输入的参数，遍历时要用 argc 作为边界。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    const char *days[] = {"Mon", "Tue", "Wed", "Thu", "Fri"};
    char months[3][8] = {"Jan", "Feb", "Mar"};
    size_t i;

    for (i = 0; i < sizeof(days) / sizeof(days[0]); i++) {
        printf("%s ", days[i]);
    }
    putchar('\n');

    months[0][0] = 'j';              /* 二维数组内容可写 */
    printf("修改后的月份首项：%s\n", months[0]);
    printf("days[1] = %s，长度 %zu\n", days[1], strlen(days[1]));
    printf("指针数组占 %zu 字节，二维数组占 %zu 字节\n",
           sizeof(days), sizeof(months));
    return 0;
}
```

## 指针常见陷阱综合
指针相关的程序故障大多集中在四类。第一类是越界访问：合法下标只到长度减一，指针移动不能超出数组范围，尾后指针只能比较不能解引用。第二类是解引用空指针或失效指针：内存释放后继续使用、函数返回后继续使用局部变量的地址，都会造成难以定位的错误。第三类是类型不匹配：把一种类型的数据当作另一种类型读写，长度与解释方式同时出错。第四类是忘记释放动态内存，造成内存泄漏；或重复释放同一块内存，触发运行时检查失败。规避方法是坚持初始化、判空、成对使用申请与释放，并把释放后的指针立即置空。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
    int a[4] = {1, 2, 3, 4};
    int *p = a;
    int i;

    /* 要点一：下标只能取 0 到 3，避免越界写 */
    for (i = 0; i < 4; i++) {
        p[i] = i * 10;
    }
    printf("数组内容：%d %d %d %d\n", a[0], a[1], a[2], a[3]);

    /* 要点二：解引用空指针会崩溃，必须先判空 */
    int *empty = NULL;
    if (empty != NULL) {
        printf("%d\n", *empty);
    } else {
        printf("已识别空指针，未执行解引用\n");
    }

    /* 要点三：类型匹配，长度足够 */
    char buf[32];
    int number = 12345;
    snprintf(buf, sizeof(buf), "%d", number);
    printf("数字转字符串：%s，长度 %zu\n", buf, strlen(buf));

    /* 要点四：申请与释放成对出现，释放后置空 */
    int *heap = malloc(sizeof(int));
    if (heap != NULL) {
        *heap = 5;
        printf("堆上的值：%d\n", *heap);
        free(heap);
        heap = NULL;
    }
    printf("释放后指针已置空：%s\n", (heap == NULL) ? "是" : "否");
    return 0;
}
```

## 综合示例：指针排序与参数遍历
把指针用于数组处理的典型场景是排序与查找：形参写成 `int *a, size_t n` 后，函数内部既可用下标也可用指针访问，两种写法编译结果等价。排序过程中交换元素既可以直接借助下标，也可以通过指针解引用完成，一旦熟悉了指针写法，处理子区间会非常方便，只需传入起始指针与长度。命令行参数则是字符指针数组的实战：argc 给出参数个数，argv 中每个元素都是一个字符指针，遍历时以 argc 为边界，用 strlen 统计每个参数的长度，这就是许多命令行工具解析参数的基础结构。

```c
#include <stdio.h>
#include <string.h>

/* 用指针参数把数组降序排序 */
void sort_desc(int *a, size_t n)
{
    size_t i, j;
    for (i = 0; i + 1 < n; i++) {
        for (j = 0; j + 1 < n - i; j++) {
            if (a[j] < a[j + 1]) {
                int tmp = a[j];
                a[j] = a[j + 1];
                a[j + 1] = tmp;
            }
        }
    }
}

int main(int argc, char *argv[])
{
    int data[8] = {3, 1, 4, 1, 5, 9, 2, 6};
    int i;

    sort_desc(data, 8);
    printf("降序结果：");
    for (i = 0; i < 8; i++) {
        printf("%d ", data[i]);
    }
    putchar('\n');

    printf("程序名：%s，收到 %d 个命令行参数\n", argv[0], argc - 1);
    for (i = 1; i < argc; i++) {
        printf("参数 %d：%s，长度 %zu\n", i, argv[i], strlen(argv[i]));
    }
    return 0;
}
```
