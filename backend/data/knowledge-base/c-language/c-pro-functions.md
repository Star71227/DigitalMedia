---
sourceKey: c-pro-functions
title: C语言讲义·函数与递归
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 函数
language: zh-CN
sourceType: team_authored
documentKey: c-pro-functions
---

# 函数与递归

## 函数定义：返回类型、函数名、参数列表与函数体
函数定义由返回类型、函数名、参数列表和函数体四部分组成，它把一个可以重复使用的计算过程封装成独立的代码单元。返回类型说明函数把什么类型的结果交给调用者，函数名是调用时使用的标识符，参数列表写在圆括号中，由若干以逗号分隔的参数声明构成，形参相当于函数内部的局部变量，其初值由调用者在调用时提供。函数体用花括号括起，其中可以包含变量声明、语句以及返回语句。C 语言不允许函数嵌套定义，每个函数都是彼此独立的代码块，函数之间通过调用与返回建立联系。若函数不需要参数，参数列表应写成 void，明确表示它不接受任何实参；函数定义中的返回类型和参数类型都应当显式写出，让接口清晰可查。

```c
#include <stdio.h>

int max_of(int a, int b)        /* 返回类型 int，函数名 max_of，两个 int 形参 */
{
    if (a > b) {
        return a;
    }
    return b;
}

int square(int n)               /* 只有一个形参的函数 */
{
    return n * n;
}

int main(void)
{
    int x = 15, y = 42;

    printf("两个变量中较大的是 %d\n", max_of(x, y));
    printf("两个常量中较大的是 %d\n", max_of(7, 3));
    printf("8 的平方是 %d\n", square(8));
    return 0;
}
```

## void 返回类型与函数的副作用
当函数不需要向调用者返回结果、只是完成某项动作时，应把返回类型写成 void。这类函数通过修改全局变量、写入文件、向屏幕输出或者修改指针所指向的对象等方式产生作用，这种对外部状态的影响称为副作用。void 函数中可以使用不带表达式的 return 语句提前结束执行，例如在参数非法时立即返回，但不能写成返回一个值，因为 void 函数没有返回值。调用 void 函数时不能把调用结果赋给变量或参与运算，否则编译器会报错。还要区分 void 与不写返回类型：在 C99 及以后的标准中，不写返回类型已经不再合法，所有函数都必须显式声明返回类型。参数列表写成 void 表示没有参数，而 void 指针表示通用指针类型，两者含义完全不同。

```c
#include <stdio.h>

void print_line(int width, char ch)     /* 无返回值，只产生输出副作用 */
{
    int i;
    for (i = 0; i < width; i++) {
        putchar(ch);
    }
    putchar('\n');
}

void show_result(const char *label, int value)
{
    if (label == NULL) {
        return;                         /* 无返回值的 return，用于提前结束 */
    }
    printf("%s: %d\n", label, value);
}

int main(void)
{
    print_line(20, '=');
    show_result("总分", 278);
    show_result("平均分", 92);
    print_line(20, '-');
    return 0;
}
```

## 函数声明（原型）与函数调用
函数声明也叫函数原型，它告诉编译器函数的名称、返回类型以及各个参数的类型，形式为返回类型、函数名和参数类型列表，末尾必须写分号。声明只描述接口而不提供实现，函数定义才给出函数体。当函数定义出现在调用点之后时，必须先在调用之前给出声明，否则编译器无法检查实参的类型与个数，也无法确定返回类型。函数调用的过程是：先求值各个实参，再按位置与形参一一对应，把控制权交给被调函数，函数执行完毕后带着返回值回到调用点，调用表达式的值就是该返回值。参数按位置传递而不是按名字匹配，因此实参的顺序不能写错。函数原型中的参数名可以不写，只保留类型即可，但写上参数名更便于阅读。

```c
#include <stdio.h>

double average(int a, int b, int c);    /* 函数声明（原型） */

int main(void)
{
    double result = average(80, 90, 76);   /* 调用点位于定义之前 */
    printf("三个数的平均分是 %.2f\n", result);
    printf("直接作为表达式的值使用：%.2f\n", average(60, 70, 71));
    return 0;
}

double average(int a, int b, int c)     /* 函数定义 */
{
    return (a + b + c) / 3.0;
}
```

## 声明与定义分离、隐式声明的问题
在较早的 C 标准中，如果调用一个没有声明过的函数，编译器会按隐式声明规则假定它返回 int，并且完全不检查参数的类型与个数。这种做法会掩盖严重错误，例如把返回指针的函数当成返回 int，结果在高位被截断，或者在 64 位平台上引发难以定位的崩溃。C99 已经取消了隐式声明，现代编译器会将其视为错误或严重警告，因此每个被调用的函数在使用之前都应当有可用的声明。做到这一点的方法是按需包含对应的标准头文件：使用输入输出函数就包含 stdio.h，使用字符串函数就包含 string.h，使用数学函数就包含 math.h。此外，函数原型与函数定义必须严格一致，只要两者在返回类型或参数类型上不符，都可能带来无法预料的结果。

```c
#include <stdio.h>
#include <string.h>
#include <math.h>

int main(void)
{
    char text[] = "control";
    double root = sqrt(81.0);
    int len = (int)strlen(text);

    printf("字符串长度为 %d\n", len);
    printf("81 的平方根为 %.1f\n", root);
    printf("字符串与字面量比较的结果为 %d\n", strcmp(text, "control"));
    printf("2 的 10 次方为 %.0f\n", pow(2.0, 10.0));
    return 0;
}
```

## 形参与实参：求值顺序与类型匹配
调用函数时提供的表达式叫实参，函数定义中接收值的变量叫形参，两者在数量和类型上应当匹配。C 标准没有规定各个实参的求值顺序，编译器可以从右向左求值，也可以从左向右，因此不应在实参中写入相互依赖、相互影响的表达式，例如同时用自增运算修改同一个变量，其结果不可移植。若实参类型与形参类型不一致，并且函数原型在作用域内可见，编译器会按照赋值规则自动进行类型转换，例如把 double 实参转换成 int 形参时会直接截断小数部分，这种隐式转换常常是数值计算错误的来源。若实参个数少于形参个数，多余形参的值是不确定的；若实参个数多于形参个数，多余实参会被丢弃，两种情况都应当避免。

```c
#include <stdio.h>

int add(int a, int b)
{
    printf("进入 add：a = %d, b = %d\n", a, b);
    return a + b;
}

int main(void)
{
    int i = 1;
    double d = 3.9;

    /* 实参类型与形参不一致时按原型做隐式转换，3.9 被截断为 3 */
    printf("相加结果是 %d\n", add(i, (int)d));

    /* 形参是独立的局部变量，修改形参不会影响实参 */
    int a = 10, b = 20;
    printf("调用之前：a = %d, b = %d\n", a, b);
    add(a, b);
    printf("调用之后：a = %d, b = %d，实参没有被改动\n", a, b);
    return 0;
}
```

## C 语言只有值传递
C 语言的参数传递只有一种方式，就是值传递：调用时把实参的值复制一份交给形参，形参只是函数内部的局部变量，与实参占用不同的存储单元。因此函数内部对形参所做的一切修改都不会影响调用者的实参，这是初学者最容易误解的地方。在值传递的基础上，C 语言通过传递地址来实现输出参数的效果：把变量的地址作为实参传入，形参声明为指针，函数通过解引用指针修改调用者空间中的数据。传递数组名时，实际传递的是数组首元素的地址，形参看起来像数组，本质仍然是指针，所以函数内对数组元素的修改会反映到调用者那里。牢牢记住值传递这一条规则，就能准确判断一个函数能否改变调用者的数据。

```c
#include <stdio.h>

void try_to_change(int x)       /* 形参只是实参的一份副本 */
{
    x = 100;
    printf("函数内部：x = %d\n", x);
}

void really_change(int *px)     /* 形参是指针，可以通过它修改外部变量 */
{
    *px = 100;
    printf("函数内部：*px = %d\n", *px);
}

int main(void)
{
    int value = 7;

    try_to_change(value);
    printf("按值传递之后：value = %d\n", value);

    really_change(&value);
    printf("传递地址之后：value = %d\n", value);
    return 0;
}
```

## 传数组名与传指针：交换两数的经典反例
交换两个变量的值是讲解参数传递时最经典的例子。如果写出接收两个整型形参、并在函数内借助临时变量交换它们的函数，调用之后会发现两个实参毫无变化，因为被交换的只是形参这两份副本，这就是传值交换的反例。要让交换真正生效，必须把两个变量的地址传进去，形参声明为指针，函数内部通过解引用交换两个内存单元中的内容。传递数组名的情况与之类似：数组名在表达式中会退化为指向首元素的指针，所以函数可以修改数组的元素，但无法通过形参得知数组的长度，通常要额外传入一个长度参数，并约定不越界访问。把数组长度写成 sizeof 表达式的做法只在定义数组的那个作用域内正确，在函数内部得到的只是指针本身的大小。

```c
#include <stdio.h>

void swap_wrong(int x, int y)   /* 只交换了形参副本，外部数据不变 */
{
    int t = x;
    x = y;
    y = t;
}

void swap_correct(int *px, int *py)   /* 通过指针交换调用者的变量 */
{
    int t = *px;
    *px = *py;
    *py = t;
}

void scale_array(int *a, int n, int factor)   /* 数组名退化为指针 */
{
    int i;
    for (i = 0; i < n; i++) {
        a[i] *= factor;
    }
}

int main(void)
{
    int a = 1, b = 2;

    swap_wrong(a, b);
    printf("传值版本：a = %d, b = %d（交换失败）\n", a, b);

    swap_correct(&a, &b);
    printf("传指针版本：a = %d, b = %d（交换成功）\n", a, b);

    int data[5] = {1, 2, 3, 4, 5};
    int n = (int)(sizeof data / sizeof data[0]);
    scale_array(data, n, 10);
    printf("放大十倍之后：%d %d %d %d %d\n",
           data[0], data[1], data[2], data[3], data[4]);
    return 0;
}
```

## return 语句与返回值
return 语句用于把控制权交还给调用者，并可以附带一个表达式的值作为函数的返回值。函数中允许出现多个 return，通常配合分支在满足条件时提前返回，这样可以减少嵌套层数，让主流程更清晰。带返回值的函数在所有可能的执行路径上都应当返回一个值，否则返回值不确定，属于未定义行为，开启编译警告后一般会得到提示。返回值的类型会按函数原型转换为返回类型，例如把 double 表达式作为 int 函数的返回值时小数部分会被截断。一个必须避免的错误是返回指向局部变量的指针或返回局部数组：函数返回之后局部对象的生存期已经结束，再访问那段地址就是未定义行为。正确做法有两种：由调用者提供缓冲区，函数只负责填充；或者使用静态数组并通过指针返回，但要清楚它会被下一次调用覆盖。

```c
#include <stdio.h>

int sign_of(int n)              /* 多个 return：每个分支立即给出结果 */
{
    if (n > 0) {
        return 1;
    }
    if (n < 0) {
        return -1;
    }
    return 0;
}

int main(void)
{
    printf("sign_of(9) = %d\n", sign_of(9));
    printf("sign_of(-4) = %d\n", sign_of(-4));
    printf("sign_of(0) = %d\n", sign_of(0));
    return 0;
}
```

```c
#include <stdio.h>

/* 正确做法一：由调用者提供缓冲区，函数只负责写入 */
void build_squares(int *out, int n)
{
    int i;
    for (i = 0; i < n; i++) {
        out[i] = (i + 1) * (i + 1);
    }
}

/* 正确做法二：返回静态数组的地址，注意它会被下一次调用覆盖 */
const int *even_table(void)
{
    static int table[3] = {2, 4, 6};
    return table;
}

int main(void)
{
    int squares[5];
    const int *evens;
    int i;

    build_squares(squares, 5);
    printf("平方表：");
    for (i = 0; i < 5; i++) {
        printf("%d ", squares[i]);
    }
    printf("\n");

    evens = even_table();
    printf("偶数表：");
    for (i = 0; i < 3; i++) {
        printf("%d ", evens[i]);
    }
    printf("\n");
    return 0;
}
```

## 函数原型与头文件组织：多文件工程与 extern
稍大一些的程序通常拆分成多个源文件：把函数定义放在扩展名为 c 的源文件中，把函数原型、类型定义和常量放在头文件中，再由使用者通过预处理指令包含头文件。这样做的核心思想是声明与定义分离，接口对使用者可见，实现细节被封在源文件里。头文件中只放声明，不放函数定义和变量定义，否则多个源文件同时包含它时会产生重复定义错误。若要使用定义在另一个源文件中的全局变量，应在头文件中用 extern 关键字声明它，而在某一个源文件中给出真正的定义；extern 声明不分配存储空间，只是告诉编译器这个名字在别处存在。为防止头文件被重复包含，通常会使用条件编译构成的包含保护写法。

```c
#include <stdio.h>

/* 以下两行通常写在头文件 mylib.h 中：对外公开的声明 */
int add(int a, int b);
extern int g_call_count;        /* 声明：变量定义在别处 */

/* 以下两行通常写在源文件 mylib.c 中：给出定义 */
int g_call_count = 0;

int add(int a, int b)
{
    g_call_count++;             /* 每次调用都累加调用次数 */
    return a + b;
}

int main(void)
{
    printf("add(2, 3) = %d\n", add(2, 3));
    printf("add(10, 20) = %d\n", add(10, 20));
    printf("add 一共被调用了 %d 次\n", g_call_count);
    return 0;
}
```

## 递归的概念：递归出口、递归体与栈帧
递归是函数直接或间接调用自身的一种编程技术。一个正确的递归函数必须包含两部分：递归出口，即不再继续调用自身、直接给出结果的最小情形；递归体，即把原问题分解成规模更小、形式相同的子问题，并用递归调用求解它们。递归执行时，每一次调用都会在运行栈上压入一个新的栈帧，其中保存形参、局部变量和返回地址；调用层层深入的过程称为递推，到达出口之后逐层返回并逐层计算的过程称为回归。正因为每个栈帧都要保存数据，递归深度直接决定了额外的空间开销。设计递归时应当先确认问题能够被缩小并最终达到出口，再确定每次分解后结果如何组合，切忌在递归体中随意修改全局状态而导致结果不可预测。

```c
#include <stdio.h>

void print_binary(unsigned int n)   /* 十进制转二进制：先处理高位，再输出低位 */
{
    if (n < 2) {                   /* 递归出口：只剩一位 */
        printf("%u", n);
        return;
    }
    print_binary(n / 2);           /* 递归体：规模减半 */
    printf("%u", n % 2);           /* 回归阶段：从高位向低位依次输出 */
}

int main(void)
{
    printf("26 的二进制形式是 ");
    print_binary(26u);
    printf("\n");

    printf("255 的二进制形式是 ");
    print_binary(255u);
    printf("\n");
    return 0;
}
```

## 递归案例：阶乘
阶乘是最基础的递归案例，n 的阶乘定义为从 1 到 n 的所有整数之积，并规定 0 的阶乘等于 1。它的递归关系十分直观：n 的阶乘等于 n 乘以 n 减 1 的阶乘，出口是 n 等于 0 或 1 时结果为 1。写代码时要把出口放在最前面，确保递归一定能够终止，否则会因栈空间耗尽而崩溃。阶乘的增长非常快，13 的阶乘已经超出 32 位有符号整数的表示范围，因此应使用 64 位无符号类型，若需要更大的结果则改用数组模拟高精度乘法。把递归版本与循环版本对照可以看出差别：递归版本更贴近数学定义，循环版本则省去了函数调用与栈帧的开销，在深度较大时更为稳妥。

```c
#include <stdio.h>

unsigned long long factorial(unsigned int n)
{
    if (n <= 1) {
        return 1ULL;                        /* 递归出口：0 和 1 的阶乘都是 1 */
    }
    return (unsigned long long)n * factorial(n - 1);
}

unsigned long long factorial_loop(unsigned int n)
{
    unsigned long long acc = 1ULL;
    unsigned int i;
    for (i = 2; i <= n; i++) {
        acc *= i;
    }
    return acc;
}

int main(void)
{
    unsigned int i;
    for (i = 0; i <= 10; i++) {
        printf("%u! = %llu\n", i, factorial(i));
    }
    printf("循环版本 20! = %llu\n", factorial_loop(20));
    return 0;
}
```

## 递归案例：斐波那契数列与性能对比
斐波那契数列由前两项相加得到后一项，通常约定第一项为 0、第二项为 1。按定义直接写成递归函数只需两行，但朴素递归会把同一个子问题重复计算许多次，计算第三十项就要执行上百万次调用，时间复杂度随项数呈指数增长。改进办法有两种：一是记忆化，用一个数组保存已经算出的结果，再次需要时直接返回，把指数级复杂度降为线性；二是改用迭代，用两个变量滚动保存相邻两项，额外空间恒定而且速度最快。对比三种写法可以清楚看到，递归的简洁与效率之间需要权衡，遇到重叠子问题时应当引入记忆化或改写为迭代。对于要求更大项数的场合，还要注意结果可能超出整数类型的表示范围。

```c
#include <stdio.h>

#define MAX_N 45

static unsigned long long memo[MAX_N + 1];   /* 记忆化数组，0 表示尚未计算 */

unsigned long long fib_naive(int n)          /* 朴素递归：存在大量重复计算 */
{
    if (n < 2) {
        return (unsigned long long)n;
    }
    return fib_naive(n - 1) + fib_naive(n - 2);
}

unsigned long long fib_memo(int n)           /* 记忆化递归：每个子问题只算一次 */
{
    if (n < 2) {
        return (unsigned long long)n;
    }
    if (memo[n] != 0) {
        return memo[n];
    }
    memo[n] = fib_memo(n - 1) + fib_memo(n - 2);
    return memo[n];
}

unsigned long long fib_iterative(int n)      /* 迭代：滚动保存相邻两项 */
{
    unsigned long long a = 0ULL, b = 1ULL, t;
    int i;
    for (i = 0; i < n; i++) {
        t = a + b;
        a = b;
        b = t;
    }
    return a;
}

int main(void)
{
    int n = 30;

    printf("朴素递归 fib(%d) = %llu\n", n, fib_naive(n));
    printf("记忆化递归 fib(%d) = %llu\n", n, fib_memo(n));
    printf("迭代法 fib(%d) = %llu\n", n, fib_iterative(n));
    printf("迭代法 fib(45) = %llu\n", fib_iterative(45));
    return 0;
}
```

## 递归案例：汉诺塔
汉诺塔问题要求在若干大小不同的圆盘之间按规则搬运：每次只能移动一个盘，并且大盘不能压在小盘之上。当盘数为 1 时，可以直接把它从起始柱移到目标柱，这就是递归出口。当盘数大于 1 时，整个过程可以分成三步：先把上面的 n 减 1 个盘借助目标柱搬到中转柱，再把最大的第 n 号盘从起始柱搬到目标柱，最后把中转柱上的 n 减 1 个盘借助起始柱搬到目标柱。三步中有两步与原问题同形但规模减一，因此特别适合递归求解。移动次数的递推关系是总次数等于二倍的上层次数加一，解得总移动次数为 2 的 n 次方减 1。这个数字随盘数指数增长，所以汉诺塔也常被用来演示指数级的工作量与递归调用次数。

```c
#include <stdio.h>

int g_move_count = 0;           /* 统计实际移动次数 */

void hanoi(int n, char from, char via, char to)
{
    if (n == 1) {                                   /* 递归出口：只剩一个盘 */
        printf("把第 1 号盘从 %c 柱移到 %c 柱\n", from, to);
        g_move_count++;
        return;
    }
    hanoi(n - 1, from, to, via);                    /* 先把上面 n-1 个盘移到中转柱 */
    printf("把第 %d 号盘从 %c 柱移到 %c 柱\n", n, from, to);
    g_move_count++;
    hanoi(n - 1, via, from, to);                    /* 再把 n-1 个盘搬到目标柱 */
}

int main(void)
{
    int n = 3;

    hanoi(n, 'A', 'B', 'C');
    printf("三盘共移动 %d 次，理论值为 2 的 %d 次方减 1，即 %d 次\n",
           g_move_count, n, (1 << n) - 1);
    return 0;
}
```

## 递归案例：二分查找
二分查找在有序数组中以折半方式缩小查找区间，每次比较中间元素就能排除一半的搜索范围，时间复杂度为对数级。递归实现把区间左端与右端作为参数，出口是区间为空即查找失败，或者中间元素恰好等于目标值；否则根据比较结果在左半区间或右半区间继续查找。迭代实现用循环维护左右边界，逻辑等价但只使用常数级的额外空间，省去了函数调用的开销，在实际工程中更常用。写二分查找有三个易错点：必须保证数组已经按关键字有序；求中点时写成左端加上两端之差的一半，可以避免两端相加造成整数溢出；缩小边界时必须去掉已经比较过的中点，即左端取中点加一、右端取中点减一，否则区间不会收缩而形成死循环。

```c
#include <stdio.h>

int binary_search_iterative(const int *a, int n, int target)
{
    int low = 0, high = n - 1;

    while (low <= high) {
        int mid = low + (high - low) / 2;       /* 避免 low+high 溢出 */
        if (a[mid] == target) {
            return mid;
        }
        if (a[mid] < target) {
            low = mid + 1;                      /* 去掉已经比较过的中点 */
        } else {
            high = mid - 1;
        }
    }
    return -1;
}

int binary_search_recursive(const int *a, int low, int high, int target)
{
    int mid;

    if (low > high) {                           /* 递归出口：区间为空，查找失败 */
        return -1;
    }
    mid = low + (high - low) / 2;
    if (a[mid] == target) {
        return mid;
    }
    if (a[mid] < target) {
        return binary_search_recursive(a, mid + 1, high, target);
    }
    return binary_search_recursive(a, low, mid - 1, target);
}

int main(void)
{
    int a[] = {3, 8, 15, 23, 42, 57, 68, 91};
    int n = (int)(sizeof a / sizeof a[0]);

    printf("迭代法查找 42 的下标是 %d\n", binary_search_iterative(a, n, 42));
    printf("递归法查找 42 的下标是 %d\n", binary_search_recursive(a, 0, n - 1, 42));
    printf("递归法查找 100 的结果是 %d\n", binary_search_recursive(a, 0, n - 1, 100));
    return 0;
}
```

## 递归的限制与递归转迭代
递归的主要限制来自运行栈：每次调用都会建立新的栈帧，递归深度过大时栈空间被耗尽，程序会异常终止，这种情形称为栈溢出。此外函数调用本身带有额外的时间开销，同一个问题用递归求解通常比迭代慢。把递归改写为迭代的一般思路是：先找出递推关系与循环不变式，再用循环变量保存本来由形参传递的状态，用少量变量保存本来由返回值传递的结果。若递归调用位于函数最后一条语句且其返回值被直接返回，这种形式叫尾递归，理论上可以复用当前栈帧，但 C 语言标准并不要求编译器做尾调用优化，因此不能依赖编译器替我们节省栈空间。当问题规模无法预估或者明显会达到很深的层次时，应优先考虑迭代，或者使用自己管理的栈结构来模拟递归。

```c
#include <stdio.h>

unsigned long long sum_recursive(int n)   /* 递归深度等于 n，n 过大时会栈溢出 */
{
    if (n <= 0) {
        return 0ULL;
    }
    return (unsigned long long)n + sum_recursive(n - 1);
}

unsigned long long sum_iterative(int n)   /* 迭代版本只用一个循环，栈空间恒定 */
{
    unsigned long long acc = 0ULL;
    int i;
    for (i = 1; i <= n; i++) {
        acc += (unsigned long long)i;
    }
    return acc;
}

int main(void)
{
    int n = 1000;

    printf("递归求和 sum(1 到 %d) = %llu\n", n, sum_recursive(n));
    printf("迭代求和 sum(1 到 %d) = %llu\n", n, sum_iterative(n));
    printf("两者结果一致，但迭代版本不额外占用 %d 个栈帧\n", n);
    return 0;
}
```

## 函数指针初步
函数在内存中有自己的入口地址，函数名在表达式中会退化为指向该函数的指针，因此可以定义函数指针变量来保存函数的地址。函数指针的声明形式是返回类型、带括号的指针名以及参数类型列表，这对括号不能省去，否则会被解析成返回指针的函数声明。通过函数指针调用与直接调用写法一致，也可以先显式解引用再调用。函数指针最重要的用途是作为参数传入另一个函数，实现回调机制，让调用者决定被调函数的行为，标准库中用于排序和查找的函数就采用这种设计。把若干个同类型的函数指针放进数组，还可以用下标选择要执行的函数，从而替代冗长的分支结构。更深入的类型解读与复杂声明留待指针专题讲解。

```c
#include <stdio.h>

int add(int a, int b)
{
    return a + b;
}

int sub(int a, int b)
{
    return a - b;
}

int mul(int a, int b)
{
    return a * b;
}

int apply(int (*op)(int, int), int a, int b)   /* 形参是函数指针，实现回调 */
{
    return op(a, b);
}

int main(void)
{
    int (*fp)(int, int) = add;      /* 定义函数指针并让它指向 add */

    printf("通过函数指针调用：%d\n", fp(6, 3));

    fp = sub;                       /* 同一个指针可以改指其他函数 */
    printf("改指 sub 之后：%d\n", fp(6, 3));

    printf("回调 apply(add, 6, 3) = %d\n", apply(add, 6, 3));
    printf("回调 apply(mul, 6, 3) = %d\n", apply(mul, 6, 3));

    int (*table[2])(int, int) = {add, mul};    /* 函数指针数组 */
    printf("函数指针数组：%d 和 %d\n", table[0](2, 5), table[1](2, 5));
    return 0;
}
```

## 综合示例：用函数改造成绩统计程序
把一段已经写好的统计程序按职责拆分成若干函数，是掌握函数的良好练习。拆分的原则是每个函数只做一件事，通过参数接收输入数据，通过返回值或者输出参数给出结果。成绩统计程序可以拆分为求最高分、求最低分、求平均分、统计及格人数和输出报表五个函数，它们都接收数组与长度两个参数，其中查找类函数返回具体数值，平均分函数返回浮点值，输出函数返回 void。改写之后主函数只剩准备数据与调用报表函数两行，逻辑一目了然；如果以后要更换数据来源或者增加标准差统计，只需在同样的层次新增函数，而不必修改已有的实现。拆分时还要注意不要在函数内硬编码数组长度，长度应由参数传入，这样同一个函数就能处理任意规模的成绩表。

```c
#include <stdio.h>

#define NUM 8

int find_max(const int *a, int n)
{
    int i, best = a[0];
    for (i = 1; i < n; i++) {
        if (a[i] > best) {
            best = a[i];
        }
    }
    return best;
}

int find_min(const int *a, int n)
{
    int i, worst = a[0];
    for (i = 1; i < n; i++) {
        if (a[i] < worst) {
            worst = a[i];
        }
    }
    return worst;
}

double average(const int *a, int n)
{
    int i, sum = 0;
    for (i = 0; i < n; i++) {
        sum += a[i];
    }
    return (double)sum / n;
}

int count_pass(const int *a, int n, int threshold)
{
    int i, pass = 0;
    for (i = 0; i < n; i++) {
        if (a[i] >= threshold) {
            pass++;
        }
    }
    return pass;
}

void print_report(const int *a, int n)
{
    printf("最高分：%d\n", find_max(a, n));
    printf("最低分：%d\n", find_min(a, n));
    printf("平均分：%.2f\n", average(a, n));
    printf("及格人数：%d 人（共 %d 人）\n", count_pass(a, n, 60), n);
}

int main(void)
{
    int scores[NUM] = {88, 56, 92, 74, 60, 45, 99, 81};

    print_report(scores, NUM);
    return 0;
}
```
