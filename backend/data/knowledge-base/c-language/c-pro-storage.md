---
sourceKey: c-pro-storage
title: C语言讲义·变量作用域与存储类别
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 函数
language: zh-CN
sourceType: team_authored
documentKey: c-pro-storage
---

# 变量作用域与存储类别

## 作用域与可见性的基本概念

作用域（scope）指程序中某个标识符有效的代码区域，也就是用这个名字能够访问到对应声明的地方；可见性（visibility）指在某一点上这个名字是否真的可以被引用，以及引用的是哪一个声明。二者大体一致但并不总是相同：当内层块重新声明了同名标识符时，外层变量被遮蔽，此时它依然存在、依然占用存储空间，只是在内层暂时无法用这个名字访问。C 语言的作用域分为四类，即块作用域、函数作用域、函数原型作用域和文件作用域。判断一个变量属于哪一类，只需看它的声明写在哪里：花括号内部是块作用域，所有函数之外是文件作用域，标号是函数作用域，函数原型参数列表中声明的是函数原型作用域。

```c
#include <stdio.h>

int value = 100;   /* 文件作用域 */

int main(void)
{
    printf("文件作用域的 value = %d\n", value);

    {
        int value = 200;   /* 块作用域，遮蔽外层同名变量 */
        printf("块作用域的 value = %d\n", value);
    }

    printf("离开块之后 value = %d\n", value);
    return 0;
}
```

## 块作用域与嵌套块中的变量

块作用域又称局部作用域，指由一对花括号界定的复合语句内部声明的标识符。函数形参、函数体中声明的变量、if 与 while 语句体内声明的变量、for 语句的循环变量，以及单独写出的复合语句块，都属于块作用域。块作用域从声明处开始生效，到所在块结束为止；同一个块内不能重复声明同名变量，但不同块中的同名变量互不干扰，它们对应栈上彼此独立的存储单元。嵌套块中的内层声明会暂时遮蔽外层同名变量，内层块结束时外层变量重新可见。局部变量的生命随进入块而开始、随离开块而结束，这正是循环与递归中每次进入块都能获得一份全新副本的原因。

```c
#include <stdio.h>

int main(void)
{
    int outer = 10;
    printf("进入循环前外层变量 = %d\n", outer);

    for (int i = 0; i < 2; i++) {
        int outer = i * 100;   /* 内层块作用域，遮蔽外层变量 */
        printf("第 %d 次循环，内层变量 = %d\n", i + 1, outer);
    }

    printf("循环结束后外层变量 = %d\n", outer);
    return 0;
}
```

## 函数作用域与函数原型作用域

函数作用域只用于标号（label）以及 goto 语句的跳转目标：标号在整个函数体内都可以被 goto 引用，与它写在哪个块中无关，因此同名的标号不能在同一函数内重复定义。函数原型作用域指函数原型声明中参数列表里声明的标识符，它的有效范围从声明处开始，到该原型声明结束为止，因此原型中的参数名只起提示作用，可以与函数定义中的参数名不同，也可以整个不写。需要区分的是，函数定义中的形参属于块作用域，作用范围是函数体；而函数名本身具有文件作用域。理解这两类作用域有助于正确阅读标准库头文件中的函数声明，也能避免把原型里的参数名误当成可用的变量。

```c
#include <stdio.h>

/* 原型中的参数名 x、y 只具有函数原型作用域，可与定义处不同 */
int add(int x, int y);

int add(int left, int right)
{
    return left + right;
}

int main(void)
{
    int sum = 0;

    for (int i = 1; i <= 5; i++) {
        if (i == 3) {
            goto finish;   /* 标号具有函数作用域，可在块外跳转 */
        }
        sum = add(sum, i);
    }

finish:
    printf("累加结果 = %d\n", sum);
    return 0;
}
```

## 文件作用域与跨文件可见性

在所有函数之外声明的标识符具有文件作用域，从声明处开始生效，一直到本翻译单元（也就是本 .c 文件）结束。若某个函数写在声明之前，又想引用该名字，就必须先给出声明。文件作用域的变量通常称为全局变量或外部变量：不加 static 时它具有外部链接属性，可以被同一工程中其他源文件通过 extern 声明访问；加上 static 则变为内部链接，只在本文件内可见。因此文件作用域中的声明顺序很重要，先声明后使用是良好习惯，把被多个函数共用的数据集中定义在文件开头，可以明显提高多文件工程的可读性与可维护性。

```c
#include <stdio.h>

/* 文件作用域变量与函数原型写在前面，供后续函数引用 */
static int total = 0;
static void accumulate(int n);

int main(void)
{
    for (int i = 1; i <= 4; i++) {
        accumulate(i * 10);
    }
    printf("最终累计值 = %d\n", total);
    return 0;
}

static void accumulate(int n)
{
    total += n;
    printf("本次加入 %d，当前累计 %d\n", n, total);
}
```

## 局部变量（自动变量）的特点

在函数或块内部声明、并且不带 static 的变量称为局部变量，其存储类别默认为 auto，所以也叫自动变量。自动变量具有自动存储期：程序执行到声明所在的块时在栈上分配空间，离开该块时空间立即回收，值随之消失，因此函数调用结束之后局部变量的值不再有任何意义。自动变量不会自动清零，它的初值是此前遗留在该内存位置上的垃圾值，直接读取属于未定义行为，必须先赋值再使用。由于每次调用都会重新分配，递归函数中每一层的同名局部变量彼此独立，这也是递归能够正确回退的关键。

```c
#include <stdio.h>

void show_local(void)
{
    int uninitialized;    /* 未初始化：内容是不确定值 */
    int initialized = 0;  /* 显式初始化后才可靠 */

    printf("initialized = %d\n", initialized);
    printf("uninitialized 占用 %d 字节，其值不可依赖\n",
           (int)sizeof uninitialized);
}

int main(void)
{
    int counter = 0;      /* 先定义并初始化，再使用 */
    counter = counter + 5;
    printf("main 中的 counter = %d\n", counter);

    show_local();
    printf("调用结束后 counter 仍为 %d\n", counter);
    return 0;
}
```

## 全局变量：定义、零初始化与跨函数共享

在函数之外定义的变量是全局变量（外部变量），具有文件作用域和静态存储期。它与自动变量最大的区别是：未显式初始化的全局变量由编译器自动初始化为 0，整型与浮点型为 0，字符型为 '\0'，指针为 NULL，因此全局变量不手工清零也处于确定状态。全局变量在整个程序运行期间一直存在，任何函数都可以读写它，适合保存需要跨函数共享、且与具体调用无关的数据，例如配置参数、累计计数器。但滥用全局变量会破坏函数的独立性：函数行为依赖外部状态，难以单独测试与复用，还会带来重名冲突与并发访问问题，应优先用参数和返回值传递数据。

```c
#include <stdio.h>

int call_count;       /* 全局变量，未初始化时自动为 0 */
double total_score;   /* 同样自动初始化为 0.0 */

static void record(double score);

int main(void)
{
    record(88.5);
    record(92.0);
    record(79.5);

    printf("调用次数 = %d\n", call_count);
    printf("平均分 = %.2f\n", total_score / call_count);
    return 0;
}

static void record(double score)
{
    call_count++;
    total_score += score;
}
```

## 局部变量对全局变量的遮蔽

当块作用域中声明了与全局变量同名的变量时，块内的这个名字指向局部变量，全局变量被遮蔽（shadowing）。遮蔽并不是覆盖：全局变量依然存在，值也不会改变，只是在该块内无法用这个名字访问它，离开内层块之后全局变量重新可见。遮蔽容易引发难以察觉的错误，例如在函数里随手写了一个同名局部变量，结果本应修改全局数据的语句只改了局部副本，函数外看到的仍是旧值。避免的办法是保持命名清晰，例如给全局变量加统一前缀，或者干脆减少全局变量的使用。C 语言没有命名空间机制，编译器通常可以用 -Wshadow 选项对遮蔽行为发出警告，建议在开发时开启。

```c
#include <stdio.h>

int count = 10;   /* 全局变量 */

int main(void)
{
    printf("块外 count = %d\n", count);

    {
        int count = 999;   /* 局部同名变量，遮蔽全局变量 */
        count = count + 1;
        printf("块内 count = %d（修改的只是局部副本）\n", count);
    }

    printf("块外 count = %d（全局变量并未改变）\n", count);
    return 0;
}
```

## static 修饰局部变量

用 static 修饰局部变量，改变的是它的存储期而不是作用域：它仍然具有块作用域，只在声明它的函数或块中可见，但具有静态存储期，在程序开始运行时就已分配好并常驻内存，直到程序结束才释放。因此它只在第一次执行到声明处时初始化一次，之后每次进入函数都保留上一次离开时的值。这一特性常用来实现跨调用保持状态的计数器、缓存或只需执行一次的初始化。要注意两点：static 局部变量的初始化表达式必须是常量，不能用运行时才能求出的值；它使函数带有隐藏状态，因而是不可重入的，在多线程环境中需要额外同步。

```c
#include <stdio.h>

void counter(void);

int main(void)
{
    for (int i = 0; i < 5; i++) {
        counter();
    }
    return 0;
}

void counter(void)
{
    static int times = 0;   /* 只初始化一次，跨调用保持数值 */
    int local = 0;          /* 每次调用都重新创建 */

    times++;
    local++;
    printf("第 %d 次调用：static times = %d，局部 local = %d\n",
           times, times, local);
}
```

## static 修饰全局变量与函数

在文件作用域用 static 修饰变量或函数，改变的不是存储期（它们本来就是静态存储期），而是链接属性：由外部链接变为内部链接，即该名字只在本翻译单元内可见，其他源文件即使写出 extern 声明也无法引用它，这种效果被称为文件私有。它的价值在于信息隐藏与避免重名：大型工程中不同模块完全可以各自拥有同名的 static 辅助函数，链接器不会报重复定义。工程实践上，只被本文件使用的全局变量和辅助函数都应加上 static，把模块的对外接口缩到最小。需要注意，static 修饰函数时既可以写在定义处，也可以写在原型处，但两处必须保持一致。

```c
#include <stdio.h>

static int base = 1000;      /* 仅本文件可见的全局变量 */
static int scale(int v);     /* 内部链接函数原型 */

int main(void)
{
    printf("对 3 缩放得到 %d\n", scale(3));
    printf("对 7 缩放得到 %d\n", scale(7));
    return 0;
}

static int scale(int v)
{
    base += v;   /* 只有本文件内的函数能访问 base */
    return base;
}
```

## 存储类别说明符总览

C 语言共有四个存储类别说明符：auto、static、extern 与 register，此外还有用于线程局部存储的 _Thread_local。auto 只能修饰块作用域变量，表示自动存储期，写与不写完全等价，所以几乎总是直接不写。static 修饰块内局部变量时赋予静态存储期，修饰文件作用域的变量或函数时赋予内部链接。extern 用于声明某名字在别处定义，表示外部链接；对变量而言它使该声明成为引用型声明而不是定义。register 建议编译器把变量放入寄存器以加快访问。一个声明中至多出现一个存储类别说明符，互相矛盾的组合（例如同一名字同时用 extern 与 static 修饰）属于语法错误。

```c
#include <stdio.h>

extern int shared;      /* 引用型声明，定义写在文件下方 */
static int calls = 0;   /* 内部链接的全局变量 */

int shared = 42;        /* 定义，真正分配存储空间 */

int main(void)
{
    auto int a = 1;         /* auto 可以不写，写出仅为说明 */
    register int fast = 2;  /* 建议放入寄存器 */
    static int hidden = 3;  /* 块作用域但具有静态存储期 */

    calls++;
    printf("a = %d，fast = %d，hidden = %d，shared = %d，calls = %d\n",
           a, fast, hidden, shared, calls);
    return 0;
}
```

## extern 声明与多文件工程的编译链接

当变量或函数定义在另一个源文件中时，当前文件需要用 extern 声明来引用它：extern 修饰的变量声明不分配存储空间，只是告诉编译器这个名字在别处已有定义、类型是什么。函数的声明默认就是 extern，所以函数原型通常不写 extern。多文件工程的典型做法是把定义写在 ex.c 中，把 extern 声明放进头文件 ex.h，再由 main.c 通过 #include 引入。编译时先用 gcc -c 把每个 .c 文件分别编译成目标文件，再链接成可执行文件，例如 gcc main.c ex.c -o app。外部变量在整个程序中只能定义一次，若多个文件都写了带初始化的定义，链接阶段会报重复定义错误。

```c
#include <stdio.h>

/* 实际工程中把下面两行声明写进 ex.h，由多个 .c 文件共享 */
extern int shared_total;        /* 声明：不分配存储空间 */
extern int accumulate(int n);   /* 函数原型，默认即 extern */

int shared_total = 0;           /* 定义：分配空间，且全程序只有一处 */

int accumulate(int n)
{
    shared_total += n;
    return shared_total;
}

int main(void)
{
    accumulate(10);
    accumulate(25);
    printf("外部变量 shared_total = %d\n", shared_total);
    return 0;
}
```

## register 的历史、现状与限制

register 说明符的语义是建议而不是命令：它提示编译器把变量放在 CPU 寄存器中以加快访问速度，编译器可以采纳，也可以不采纳。它只能用于块作用域变量和函数形参，并且该变量不能取地址，因为寄存器没有内存地址，所以既不能用 & 求地址，也不能让它出现在需要地址的上下文中。在现代编译器上 register 基本已经失去意义：优化器会依据变量的活跃区间自动分配寄存器，人工提示往往没有收益，写多了反而可能妨碍优化。它的残余价值主要是表达意图。C++17 起 register 关键字被弃用，C 语言中虽然仍然保留，但实际工程中通常不再使用。

```c
#include <stdio.h>

int sum_loop(int n)
{
    register int i;   /* 仅作建议，编译器可以不采纳 */
    int total = 0;

    for (i = 1; i <= n; i++) {
        total += i;
    }
    /* 注意：register 变量不能用 &i 取地址 */
    return total;
}

int main(void)
{
    int n = 100;
    printf("1 到 %d 的和为 %d\n", n, sum_loop(n));
    return 0;
}
```

## 存储期与作用域的区别

作用域描述名字在源码的哪个范围内可以被引用，是编译期概念；存储期描述变量的存储空间何时分配、何时释放，是运行期概念。C 语言有三种存储期：自动存储期，变量进入块时分配、离开块时释放，例如普通局部变量；静态存储期，程序启动时分配、程序结束时释放，例如全局变量与 static 变量；动态存储期，由 malloc 等函数在运行中显式申请、用 free 显式释放。三者的组合并不受作用域约束：static 局部变量的作用域是块，存储期却是静态的，正是二者分离的典型例证。判断变量行为时必须同时看作用域和存储期两个维度，只看其中一个都会得出错误结论。

```c
#include <stdio.h>
#include <stdlib.h>

void demo(void)
{
    static int s = 0;            /* 块作用域 + 静态存储期 */
    int a = 0;                   /* 块作用域 + 自动存储期 */
    int *p = malloc(sizeof *p);  /* 指向动态存储期的对象 */

    if (p == NULL) {
        return;
    }

    s++;
    a++;
    *p = s * 10;
    printf("static s = %d，auto a = %d，动态对象 = %d\n", s, a, *p);

    free(p);      /* 动态存储期必须显式释放 */
    p = NULL;
}

int main(void)
{
    demo();
    demo();
    return 0;
}
```

## 链接属性：外部链接、内部链接与无链接

链接属性决定不同翻译单元或同一文件内的多个声明是否指向同一个实体。C 语言有三种：外部链接，名字在整个程序范围内唯一，可以在其他源文件中用 extern 引用，例如非 static 的全局变量和普通函数；内部链接，名字只在本翻译单元内有效，例如 static 修饰的全局变量和函数；无链接，名字只属于声明本身，例如局部变量、函数形参与类型名。链接属性只对文件作用域的名字和函数有意义，所有局部变量一律无链接。一个实用的判断口诀是：文件作用域加 static 是内部链接，文件作用域不加 static 是外部链接，块作用域一律无链接。

```c
#include <stdio.h>

int external_var = 1;         /* 外部链接 */
static int internal_var = 2;  /* 内部链接 */
static int helper(void);      /* 内部链接函数 */

int main(void)
{
    int no_linkage = 3;       /* 无链接：普通局部变量 */

    printf("外部链接变量 = %d\n", external_var);
    printf("内部链接变量 = %d\n", internal_var);
    printf("无链接变量 = %d\n", no_linkage);
    printf("helper 返回 %d\n", helper());
    return 0;
}

static int helper(void)
{
    return external_var + internal_var;
}
```

## 初始化与默认值

静态存储期的对象，包括全局变量、static 变量和字符串字面量，在程序装入时由系统统一清零，因此未显式初始化的它们值确定为 0；而且它们的初始化表达式必须是编译期常量，初始化在 main 函数开始执行之前就已完成。自动存储期的对象没有这项待遇，栈上的空间会被反复复用，其内容是不确定值，若未初始化就读取，结果不可预测，属于未定义行为。动态存储期对象由 malloc 获得，初值同样不确定，习惯上用 memset 清零或改用 calloc。一个容易忽视的细节是：静态变量若有显式初始化式，该初始化只执行一次；没有显式初始化式时被零初始化，二者都不等同于自动变量的随机值。

```c
#include <stdio.h>

int g_zero;                  /* 自动零初始化为 0 */
static double g_pi = 3.14;   /* 使用常量初始化式 */
static char g_name[8];       /* 全部元素为 '\0' */

void local_demo(void)
{
    int local_arr[4] = {1, 2};   /* 部分初始化，其余元素补 0 */

    printf("部分初始化的数组：%d %d %d %d\n",
           local_arr[0], local_arr[1], local_arr[2], local_arr[3]);
}

int main(void)
{
    printf("全局整型 g_zero = %d\n", g_zero);
    printf("全局浮点 g_pi = %.2f\n", g_pi);
    printf("全局字符数组首元素 g_name[0] = %d\n", g_name[0]);
    local_demo();
    return 0;
}
```

## 递归中的局部变量与 static 变量

递归函数每一层调用都会创建一份独立的局部变量副本，各层的同名变量互不干扰，这是递归能够正确回退的基础。但如果把本该每层独立的变量写成 static，就会出现严重错误：static 变量在整个程序中只有一份，所有递归层共享它，累加、计数或暂存中间结果都会互相覆盖。经典陷阱是用 static 变量在递归中做计数或累加，结果与预期相差甚远，因为累加结果包含了所有层的影响。正确做法是让递归状态通过参数向下传递、通过返回值向上回传，只在确实需要整个程序只初始化一次，或者要统计总调用次数时才使用 static。下面程序对比了两种写法的运行差异。

```c
#include <stdio.h>

/* 正确写法：count 是局部变量，每层都有独立副本 */
void correct(int n)
{
    int count = n;

    if (n == 0) {
        return;
    }
    printf("正确版本第 %d 层，局部 count = %d\n", n, count);
    correct(n - 1);
}

/* 错误示范：static 变量被所有递归层共享 */
void wrong(int n)
{
    static int count = 0;

    count++;    /* 累加的是所有层的次数，而非本层 */
    if (n == 0) {
        printf("错误版本的共享 count = %d\n", count);
        return;
    }
    wrong(n - 1);
}

int main(void)
{
    correct(3);
    wrong(3);
    return 0;
}
```

## 作用域与生命周期的综合判断练习

判断程序输出需要两步：第一步确定每个标识符在哪一次声明之后生效，即作用域；第二步确定该存储单元何时存在、何时被重置，即存储期。常见组合有四种：全局变量是文件作用域加静态存储期，只初始化一次；static 局部变量是块作用域加静态存储期，同样只初始化一次；普通局部变量是块作用域加自动存储期，每次进入块都重新初始化；动态对象的作用域由持有它的指针决定，存储期由程序员手动控制。把函数多次调用的结果与只调用一次的直觉区分开，是这类题目的关键。下面程序混合使用了静态变量与自动变量，请先自行推算输出，再上机验证。

```c
#include <stdio.h>

int g = 1;              /* 文件作用域，静态存储期 */

void f(void)
{
    static int s = 1;   /* 只初始化一次 */
    int a = 1;          /* 每次调用都重新初始化 */

    g++;
    s++;
    a++;
    printf("本次调用后：g = %d，s = %d，a = %d\n", g, s, a);
}

int main(void)
{
    for (int i = 0; i < 3; i++) {
        f();
    }
    return 0;
}
```
