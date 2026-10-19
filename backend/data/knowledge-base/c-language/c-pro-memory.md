---
sourceKey: c-pro-memory
title: C语言讲义·动态内存管理
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 指针
language: zh-CN
sourceType: team_authored
documentKey: c-pro-memory
---

# 动态内存管理

## 程序的内存分区
一个正在运行的 C 程序，其地址空间通常被划分为五个区域：代码区存放机器指令，只读；常量区存放字符串字面量和 const 常量，同样只读，向其中写入会触发段错误；全局/静态区存放全局变量和 static 变量，已初始化的部分在程序启动时从可执行文件中载入，未初始化的部分（BSS 段）由系统清零；栈区由编译器自动管理，存放函数的形参、返回地址和局部变量；堆区则是一片由程序员手动申请、手动释放的自由内存。理解这五个分区是掌握动态内存管理的前提，因为 malloc 与 free 只对堆区有效，而局部变量的地址不能跨越函数返回后继续使用。

```c
#include <stdio.h>
#include <stdlib.h>

int g_var = 10;            /* 已初始化全局变量：全局/静态区 */
int g_zero;                /* 未初始化全局变量：BSS 段，自动为 0 */
static int s_var = 20;     /* 静态变量：同样位于全局/静态区 */

int main(void)
{
    int local = 30;                 /* 栈区 */
    const char *lit = "hello";      /* 指针在栈上，字面量在常量区 */
    int *heap = malloc(sizeof *heap);   /* 堆区 */

    if (heap == NULL) {
        return 1;
    }
    *heap = 40;

    printf("代码区(函数地址) : %p\n", (void *)main);
    printf("全局区(g_var)    : %p\n", (void *)&g_var);
    printf("全局区(g_zero)   : %p\n", (void *)&g_zero);
    printf("全局区(s_var)    : %p\n", (void *)&s_var);
    printf("常量区(字面量)   : %p\n", (void *)lit);
    printf("栈区(local)      : %p\n", (void *)&local);
    printf("堆区(heap)       : %p\n", (void *)heap);

    free(heap);
    heap = NULL;
    return 0;
}
```

## 栈区：自动管理的函数栈帧
每次函数调用，系统都会在栈顶压入一个栈帧，用于保存返回地址、形参、局部变量以及被调用者保存的寄存器。函数返回时整个栈帧被弹出，其中的局部变量随之失效，这正是“不能返回局部数组地址”的根本原因。栈的生长方向通常是由高地址向低地址，容量有限（Windows 默认约 1 MB，Linux 常用 8 MB），因此大数组或过深的递归会导致栈溢出。栈的分配与回收只是一次指针移动，速度极快，也无需程序员干预，但它要求大小在编译期基本确定。

```c
#include <stdio.h>

void recurse(int n)
{
    int local = n * 100;      /* 每次调用都有独立的局部变量副本 */

    printf("第 %d 层：局部变量地址 = %p，值 = %d\n", n, (void *)&local, local);
    if (n < 3) {
        recurse(n + 1);
    }
}

int main(void)
{
    recurse(1);
    printf("提示：栈从高地址向低地址生长，层号越大地址通常越小\n");
    return 0;
}
```

## 堆区与动态内存的意义
堆是一段在程序运行期间由程序员显式申请、显式释放的内存，它的生存期与函数调用无关：函数返回后堆块依然有效，直到被 free。当出现以下需求时就必须使用堆：编译期无法确定数据规模（如按用户输入的人数分配数组）；数据需要跨越函数调用长期存活；需要分配很大的内存块而不想占用栈；需要实现长度可变的容器。C 语言中动态内存接口都声明在 stdlib.h 中，包括 malloc、calloc、realloc 和 free。malloc 返回 void *，只保证按最大对齐要求对齐，不初始化内容；分配失败时返回 NULL，必须检查。

```c
#include <stdio.h>
#include <stdlib.h>

/* 在堆上创建一个长度为 n 的数组并返回首地址；调用者负责 free */
int *create_array(int n, int init)
{
    int *p = malloc((size_t)n * sizeof *p);
    if (p == NULL) {
        return NULL;
    }
    for (int i = 0; i < n; i++) {
        p[i] = init + i;
    }
    return p;      /* 局部指针变量 p 已失效，但它指向的堆内存仍然有效 */
}

int main(void)
{
    int *a = create_array(5, 100);
    if (a == NULL) {
        fprintf(stderr, "分配失败\n");
        return EXIT_FAILURE;
    }

    for (int i = 0; i < 5; i++) {
        printf("%d ", a[i]);
    }
    putchar('\n');

    free(a);
    a = NULL;
    return 0;
}
```

## malloc：按字节申请未初始化内存
malloc 的原型是 `void *malloc(size_t size)`，参数以字节为单位，返回所申请块的首地址，失败返回 NULL。它分配的内存内容是不确定的，可能残留着上一次释放的数据，因此不能假设初值为 0，使用前应先赋值或调用 memset 清零。申请大小通常写成 `n * sizeof *p` 的形式，这样即使 p 的类型将来改变也不容易算错。当元素个数与元素大小都来自外部输入时，乘法可能溢出 size_t 而得到一个很小的值，健壮的代码应先判断元素个数是否超过 `SIZE_MAX / sizeof *p`。malloc(0) 的行为由实现定义，可能返回 NULL，也可能返回一个可以传给 free 的唯一指针。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
    size_t n = 5;
    int *p = malloc(n * sizeof *p);

    if (p == NULL) {
        fprintf(stderr, "内存分配失败\n");
        return EXIT_FAILURE;
    }

    /* malloc 不初始化内容，用 memset 清零以获得可预测的初值 */
    memset(p, 0, n * sizeof *p);

    for (size_t i = 0; i < n; i++) {
        p[i] = (int)i * 2;
    }
    for (size_t i = 0; i < n; i++) {
        printf("p[%zu] = %d\n", i, p[i]);
    }

    free(p);
    p = NULL;
    return EXIT_SUCCESS;
}
```

## calloc：申请并清零的内存
calloc 的原型是 `void *calloc(size_t nmemb, size_t size)`，它接收“元素个数”和“单个元素大小”两个参数，并把整块内存全部置为 0 位模式。对整型和浮点数组来说，这意味着初值为 0；对指针数组来说，在常见平台上意味着初值为 NULL。calloc 的效果等价于 malloc 之后再 memset 为 0，适合用来建立计数表、哈希桶、标志数组等依赖“初始为 0”语义的结构。由于参数是分开的两个值，calloc 的实现有机会检测乘法溢出并在溢出时返回 NULL，这一点比手写 `n * size` 更安全。当元素数量为 0 时其行为同样由实现定义。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
    const char *text = "hello world, c language";
    size_t len = strlen(text);
    int *count = calloc(128, sizeof *count);   /* 计数表，自动清零 */

    if (count == NULL) {
        return EXIT_FAILURE;
    }

    for (size_t i = 0; i < len; i++) {
        count[(unsigned char)text[i]]++;       /* 用无符号值做下标更安全 */
    }

    printf("字母 a 出现 %d 次\n", count['a']);
    printf("字母 l 出现 %d 次\n", count['l']);
    printf("空格   出现 %d 次\n", count[' ']);

    free(count);
    count = NULL;
    return 0;
}
```

## realloc：调整已分配块的大小
realloc 的原型是 `void *realloc(void *ptr, size_t size)`，用于把已分配的内存块调整为 size 字节。如果原块后面有足够空间，它可能原地扩大并返回同一个地址；否则会在别处分配新块、把原数据复制过去、释放原块，并返回新地址。无论哪种情况，原数据的前 min(旧大小, 新大小) 字节都被保留，新增部分不初始化。若 ptr 为 NULL，等价于 malloc(size)；若 size 为 0，行为等价于释放（具体由实现定义，可能返回 NULL）。最关键的陷阱是：分配失败时返回 NULL 且原块仍然有效，所以绝不能写 `p = realloc(p, n)`，否则一旦失败原地址就丢失，造成内存泄漏。

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    size_t cap = 2;                  /* 容量 */
    size_t len = 0;                  /* 已有元素个数 */
    int *a = malloc(cap * sizeof *a);

    if (a == NULL) {
        return EXIT_FAILURE;
    }

    for (int i = 1; i <= 10; i++) {
        if (len == cap) {                       /* 空间不足，扩容为两倍 */
            size_t newcap = cap * 2;
            int *tmp = realloc(a, newcap * sizeof *a);

            if (tmp == NULL) {                  /* 失败时原指针 a 仍然有效 */
                free(a);
                return EXIT_FAILURE;
            }
            a = tmp;                            /* 成功之后才更新原指针 */
            cap = newcap;
        }
        a[len++] = i;
    }

    printf("元素个数 = %zu，容量 = %zu\n", len, cap);
    for (size_t i = 0; i < len; i++) {
        printf("%d ", a[i]);
    }
    putchar('\n');

    free(a);
    a = NULL;
    return 0;
}
```

## free：释放内存的规则
free 的原型是 `void free(void *ptr)`，它把 ptr 指向的堆块归还给内存管理器。合法参数只有两种：malloc、calloc、realloc 返回的指针，或者 NULL。传递 NULL 是合法的空操作，这让清理代码可以统一书写而无需层层判空。传递指向栈变量、全局变量、静态数组或堆块中间地址的指针都是未定义行为，通常会直接导致程序崩溃。同一块内存被 free 两次称为 double free，会破坏堆的数据结构。另外，free 只是标记这块内存可以被复用，它既不会把指针变量本身置为 NULL，也不会擦除其中的数据，因此释放后应立即把指针置空。

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int *p = malloc(sizeof *p);

    if (p == NULL) {
        return EXIT_FAILURE;
    }

    *p = 42;
    printf("释放前 *p = %d\n", *p);

    free(p);
    p = NULL;        /* 立即置空，避免悬空指针 */

    free(p);         /* free(NULL) 是合法操作，什么也不做 */

    /* 以下写法都是错误的：
       int x = 5;  free(&x);          // 不是堆内存
       int arr[3]; free(arr);         // 不是堆内存
       int *q = malloc(2 * sizeof *q); free(q); free(q);   // double free */

    printf("已安全释放\n");
    return 0;
}
```

## 用结构体封装动态数组
把“数据指针 + 当前长度 + 容量”封装成一个结构体，是管理动态数组最清晰的工程做法。结构体中 data 指向堆上的连续元素区，size 记录当前有效元素个数，capacity 记录已分配的容量。追加元素时若 size 已达 capacity，就按两倍策略扩容，这样连续 n 次追加的总拷贝代价是线性的，即平摊 O(1)。释放时只需提供统一的 destroy 接口，把 data 释放并置空，避免调用者漏掉某条清理路径。这种“容量翻倍 + 统一析构”的模式正是 C++ vector 与 Java ArrayList 的内部原理，在 C 语言中需要手工实现。

```c
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int *data;         /* 指向堆上的元素区 */
    size_t size;       /* 当前元素个数 */
    size_t capacity;   /* 已分配容量 */
} IntVec;

int vec_init(IntVec *v, size_t cap)
{
    v->data = malloc(cap * sizeof *v->data);
    if (v->data == NULL) {
        return -1;
    }
    v->size = 0;
    v->capacity = cap;
    return 0;
}

int vec_push(IntVec *v, int value)
{
    if (v->size == v->capacity) {
        size_t newcap = v->capacity * 2;
        int *tmp = realloc(v->data, newcap * sizeof *v->data);

        if (tmp == NULL) {
            return -1;
        }
        v->data = tmp;
        v->capacity = newcap;
    }
    v->data[v->size++] = value;
    return 0;
}

void vec_destroy(IntVec *v)
{
    free(v->data);
    v->data = NULL;
    v->size = 0;
    v->capacity = 0;
}

int main(void)
{
    IntVec v;

    if (vec_init(&v, 2) != 0) {
        return EXIT_FAILURE;
    }
    for (int i = 0; i < 6; i++) {
        if (vec_push(&v, i * i) != 0) {
            vec_destroy(&v);       /* 出错路径也要释放 */
            return EXIT_FAILURE;
        }
    }

    printf("size = %zu，capacity = %zu\n", v.size, v.capacity);
    for (size_t i = 0; i < v.size; i++) {
        printf("%d ", v.data[i]);
    }
    putchar('\n');

    vec_destroy(&v);
    return 0;
}
```

## 动态二维数组的两种实现
动态二维数组有两种常见做法。第一种是“指针数组 + 每行独立分配”：先分配 rows 个 int *，再让每个元素指向一行 cols 个 int。它的优点是 tab[i][j] 的写法自然，缺点是各行地址不连续、需要逐行释放、容易漏掉某一行。第二种是“一维数组模拟二维”：只分配 rows*cols 个元素，用 `a[i * cols + j]` 访问，内存完全连续、缓存友好、只需一次 free，因此在数值计算中更受青睐。实际分配时还要考虑出错回滚：若第 k 行分配失败，必须先把 0 到 k-1 行释放掉再返回。

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int rows = 3;
    int cols = 4;

    int **tab = malloc((size_t)rows * sizeof *tab);   /* 行指针数组 */
    if (tab == NULL) {
        return EXIT_FAILURE;
    }

    for (int i = 0; i < rows; i++) {
        tab[i] = malloc((size_t)cols * sizeof **tab);   /* 每行单独一块 */
        if (tab[i] == NULL) {
            for (int k = 0; k < i; k++) {
                free(tab[k]);                  /* 回滚已成功的行 */
            }
            free(tab);
            return EXIT_FAILURE;
        }
        for (int j = 0; j < cols; j++) {
            tab[i][j] = i * cols + j;
        }
    }

    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            printf("%3d", tab[i][j]);
        }
        putchar('\n');
    }

    for (int i = 0; i < rows; i++) {
        free(tab[i]);          /* 先释放每一行 */
    }
    free(tab);                 /* 再释放行指针数组 */
    return 0;
}
```

## 动态内存与函数的所有权约定
堆内存可以安全地跨函数传递，问题在于“谁负责释放”。工程上常见的三种接口约定是：其一，调用方预先分配好缓冲区并连同容量一起传给函数，函数只填充数据，所有权始终在调用方；其二，函数内部负责分配并返回指针，调用方负责 free，函数返回 NULL 表示失败；其三，通过二级指针把新分配的指针“回传”给调用方，例如 `int init(int **out)` 这种形式。无论采用哪一种，都必须在函数注释或接口文档里写清楚所有权归属，否则调用者与实现者互相等待对方释放，就会产生内存泄漏或重复释放。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* 读入一整行（任意长度），返回堆内存，调用者负责 free；
   返回 NULL 表示分配失败或到达文件末尾。 */
char *read_line(void)
{
    size_t cap = 8;
    size_t len = 0;
    char *buf = malloc(cap);

    if (buf == NULL) {
        return NULL;
    }

    int c;
    while ((c = getchar()) != EOF && c != '\n') {
        if (len + 1 >= cap) {                 /* 预留 '\0' 的位置 */
            size_t newcap = cap * 2;
            char *tmp = realloc(buf, newcap);

            if (tmp == NULL) {
                free(buf);
                return NULL;
            }
            buf = tmp;
            cap = newcap;
        }
        buf[len++] = (char)c;
    }

    if (len == 0 && c == EOF) {               /* 没有读到任何内容 */
        free(buf);
        return NULL;
    }
    buf[len] = '\0';                          /* 补上字符串结束符 */
    return buf;
}

int main(void)
{
    printf("请输入一行文字：");

    char *line = read_line();
    if (line != NULL) {
        printf("共 %zu 个字符：%s\n", strlen(line), line);
        free(line);          /* 按照约定，由调用方释放 */
        line = NULL;
    } else {
        printf("未读到内容\n");
    }
    return 0;
}
```

## 内存泄漏：成因与后果
内存泄漏指一块已经分配给程序、却再也无法被引用的堆内存，因为它既不会被自动回收，也没有指针能传给 free。常见成因包括：忘记释放；在多个 return 或错误分支上漏掉释放；把 malloc 返回的指针赋给另一个变量导致原地址丢失；只释放了容器的外壳而没释放其中的元素；realloc 失败后又覆盖了原指针。长期运行的服务器程序即使每次只泄漏几十字节，累积数天后也会耗尽内存。检测手段包括 Linux 下的 valgrind 与 `gcc -fsanitize=address`，以及 Windows 下 CRT 的堆调试接口。

```c
#include <stdio.h>
#include <stdlib.h>

int *leak_example(void)
{
    int *p = malloc(10 * sizeof *p);
    if (p == NULL) {
        return NULL;
    }

    int *q = malloc(10 * sizeof *q);      /* 第二块内存 */
    if (q == NULL) {
        free(p);
        return NULL;
    }

    /* 这里忘记释放 q，并且没有把 q 返回给调用者，
       q 指向的堆内存失去了所有引用，形成内存泄漏。 */
    free(p);
    return q;                             /* 只把 q 的所有权交给调用者 */
}

int main(void)
{
    int *r = leak_example();

    if (r == NULL) {
        return EXIT_FAILURE;
    }

    r[0] = 1;
    printf("r[0] = %d\n", r[0]);

    /* 依照“谁返回谁说明”的约定，调用者负责释放 */
    free(r);
    r = NULL;
    return 0;
}
```

## 悬空指针与 use-after-free
悬空指针是指仍然保存着地址、但所指内存已经失效的指针。它的三个典型来源是：free 之后没有置空就继续使用；函数返回了局部变量的地址；realloc 把数据搬迁到新地址后，仍然通过旧指针访问。悬空指针的危害比内存泄漏更直接——内存管理器可能已经把这块空间分配给了别的变量，于是写入会悄悄破坏别人的数据，读取会得到垃圾值，严重时崩溃，甚至被攻击者利用。防御原则很简单：free 之后立刻把指针置为 NULL；坚持单一所有权，只让一个变量持有并负责释放；不使用函数返回的局部变量地址。

```c
#include <stdio.h>
#include <stdlib.h>

int *make_bad(void)
{
    int local = 10;
    return &local;        /* 错误：返回局部变量地址，函数返回后该地址失效 */
}

int main(void)
{
    int *p = malloc(sizeof *p);
    if (p == NULL) {
        return EXIT_FAILURE;
    }

    *p = 7;
    printf("*p = %d\n", *p);

    free(p);
    /* 错误示范：free 之后再访问 *p 属于 use-after-free，是未定义行为
       printf("%d\n", *p); */

    p = NULL;             /* 正确做法：释放后立刻置空 */
    if (p == NULL) {
        printf("指针已置空，不能解引用\n");
    }

    /* make_bad() 的返回值同样不能使用，这里仅作说明，不调用 */
    printf("提示：不要返回局部变量的地址\n");
    return 0;
}
```

## 内存越界与常见错误
越界是动态内存中最常见也最隐蔽的错误。典型情形有：循环写成 `i <= n` 造成 off-by-one；为字符串分配时只写了 strlen(s) 而忘记为结束符 '\0' 多留一个字节；strcpy 写入的目标缓冲区太小；用 `sizeof(int *)` 而不是 `sizeof(int)` 计算元素大小，导致申请的量只有预期的四分之一或八分之一；把栈地址或堆块中间地址交给 free。越界写往往不会立刻崩溃，而是破坏了堆块的头部信息，等到后面某次 malloc 或 free 时才莫名其妙地报错，因此调试时要把“越界发生在何处”和“崩溃发生在何处”区分开来。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
    const char *src = "hello";

    /* 正确：为目标串额外留出结束符 '\0' 的位置 */
    char *dst = malloc(strlen(src) + 1);
    if (dst == NULL) {
        return EXIT_FAILURE;
    }
    strcpy(dst, src);
    printf("dst = %s，长度 = %zu\n", dst, strlen(dst));

    free(dst);
    dst = NULL;

    /* 错误示范：malloc(strlen(src)) 少分配 1 个字节，
       strcpy 会越界写入 1 个字节并破坏堆的管理信息：
       char *bad = malloc(strlen(src));
       strcpy(bad, src);
       free(bad); */

    return 0;
}
```

## 常见误解与健壮编程原则
围绕动态内存有不少流行误解。malloc 的内存并没有确定的初值；free 不会清空数据，也不会把指针置为 NULL；`sizeof(指针)` 得到的是指针本身的大小，与它指向的数组长度无关；局部数组的地址不能返回，但函数内 malloc 出来的地址可以返回；malloc(0) 的返回值不可依赖。编写健壮代码的原则是：申请与释放严格配对，每条出错路径都要释放；坚持单一所有权，避免多个指针指向同一块内存却都以为该由自己释放；所有来自外部的长度都要做边界检查；使用前先初始化；规模已知且不大时优先用栈上的固定数组，只有确实需要时才动用堆。

```c
#include <stdio.h>
#include <stdlib.h>

/* 数组作参数会退化为指针，sizeof 拿不到元素个数，必须额外传长度 */
void fill(int *a, size_t n, int value)
{
    for (size_t i = 0; i < n; i++) {
        a[i] = value;
    }
}

int main(void)
{
    int stack_arr[10];
    int *heap_arr = malloc(10 * sizeof *heap_arr);

    if (heap_arr == NULL) {
        return EXIT_FAILURE;
    }

    printf("sizeof(stack_arr) = %zu 字节（10 个 int）\n", sizeof stack_arr);
    printf("sizeof(heap_arr)  = %zu 字节（只是指针本身）\n", sizeof heap_arr);

    fill(heap_arr, 10, 3);          /* 必须把长度一起传进去 */
    printf("heap_arr[0] = %d，heap_arr[9] = %d\n", heap_arr[0], heap_arr[9]);

    free(heap_arr);
    heap_arr = NULL;
    return 0;
}
```

## 综合示例与排查手段
把本篇的知识串起来：按用户输入的人数动态分配成绩数组，读入后求平均分与最值，用 qsort 排序输出，所有出错路径都要释放内存，正常结束也要释放并置空。排查内存问题时，最有效的组合是“编译器告警 + 运行期检测工具 + 最小复现”：用 `gcc -Wall -Wextra -g -fsanitize=address` 编译运行，AddressSanitizer 能直接报出越界访问与泄漏的调用栈；Linux 下可用 `valgrind --leak-check=full ./程序`；Windows 下可用 CRT 的 `_CrtSetDbgFlag(_CRTDBG_ALLOC_MEM_DF | _CRTDBG_LEAK_CHECK_DF)` 在调试输出中看到泄漏报告。若手边没有工具，就逐步注释代码缩小范围，并打印每次 malloc/free 的地址做配对检查。

```c
#include <stdio.h>
#include <stdlib.h>

/* qsort 的比较函数：从大到小 */
int cmp_desc(const void *a, const void *b)
{
    int x = *(const int *)a;
    int y = *(const int *)b;

    return (x < y) - (x > y);
}

int main(void)
{
    int n;

    printf("请输入学生人数：");
    if (scanf("%d", &n) != 1 || n <= 0) {
        fprintf(stderr, "输入无效\n");
        return EXIT_FAILURE;
    }

    int *score = malloc((size_t)n * sizeof *score);
    if (score == NULL) {
        fprintf(stderr, "内存分配失败\n");
        return EXIT_FAILURE;
    }

    double sum = 0.0;
    for (int i = 0; i < n; i++) {
        printf("第 %d 个成绩：", i + 1);
        if (scanf("%d", &score[i]) != 1) {
            fprintf(stderr, "输入无效\n");
            free(score);                 /* 出错路径同样要释放 */
            return EXIT_FAILURE;
        }
        sum += score[i];
    }

    qsort(score, (size_t)n, sizeof *score, cmp_desc);

    printf("平均分：%.2f，最高分：%d，最低分：%d\n",
           sum / n, score[0], score[n - 1]);
    printf("从高到低排序：");
    for (int i = 0; i < n; i++) {
        printf("%d ", score[i]);
    }
    putchar('\n');

    free(score);
    score = NULL;
    return 0;
}
```
