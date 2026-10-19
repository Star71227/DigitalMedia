---
sourceKey: c-pro-basics
title: C语言讲义·基本数据类型与运算符
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 基础语法
language: zh-CN
sourceType: team_authored
documentKey: c-pro-basics
---
# 基本数据类型与运算符

## C 程序的整体结构与 main 函数

C 语言程序由预处理指令、函数、语句和注释构成。以 # 开头的行是预处理指令，例如 #include <stdio.h> 会在编译之前把标准头文件 stdio.h 的内容插入到源文件中，使 printf、scanf 等标准库函数可以被调用。每个可执行程序有且仅有一个 main 函数，操作系统把它作为程序的入口，从函数体的第一条语句开始执行，遇到 return 语句或到达函数末尾时结束，并把返回值交给操作系统，习惯上返回 0 表示正常结束，返回非 0 表示出现了异常情况。除了 main 之外，程序员可以把功能封装成若干自定义函数，通过函数名和参数列表调用它们，从而形成以 main 为根、层层调用的结构。头文件只提供函数的声明，函数的实现由标准库在链接阶段提供。

```c
#include <stdio.h>

/* 自定义函数：计算两个整数之和 */
int add(int a, int b)
{
    return a + b;
}

int main(void)
{
    int x = 3;
    int y = 5;
    int sum = add(x, y);          /* 调用自定义函数 */

    printf("x = %d, y = %d\n", x, y);
    printf("sum = %d\n", sum);
    return 0;                      /* 返回 0 表示程序正常结束 */
}
```

## 语句、分号与注释

语句是程序执行的基本单位，C 语言的每条简单语句都必须以分号结尾，忘记写分号是最常见的编译错误之一。用一对花括号把若干语句括起来可以构成复合语句，也叫语句块，块内定义的变量只在块内可见。C 语言提供两种注释形式：以 /* 开始、以 */ 结束的块注释可以跨越多行；以两个斜杠开始的行注释只作用于本行，是 C99 起支持的形式。注释不参与编译，不生成任何目标代码，它的作用是对代码意图、算法思路和接口约定作出说明，方便他人阅读和后期维护。需要注意的是块注释不能嵌套，也不要把有效的代码长期用注释的方式屏蔽掉，被注释的代码容易与真正的说明文字混淆，应该交给版本控制工具管理。

```c
#include <stdio.h>

int main(void)
{
    int a = 10;      /* 定义并初始化变量 a */
    // 行注释：输出 a 的值
    printf("a = %d\n", a);

    {
        int b = 20;                 /* 复合语句中的局部变量，只在本块内可见 */
        printf("a + b = %d\n", a + b);
    }

    printf("程序结束\n");           /* 每条语句都以分号结束 */
    return 0;
}
```

## 基本数据类型总览

C 语言的基本数据类型可以分成几个大类。整型用于表示整数，包括 char、short、int、long 和 long long，它们还可以带上 signed 或 unsigned 修饰。浮点型用于表示实数，包括 float、double 和 long double，分别对应单精度、双精度和扩展精度。字符型 char 在本质上是一个小整数，存放的是字符在字符集中的编码值，所以它可以参与算术运算。C99 标准还引入了 _Bool 类型表示逻辑真假，使用时需要包含 <stdbool.h> 才能使用 bool、true、false 这些名字。选择类型时要综合考虑取值范围、精度要求和内存开销：一般的整数运算用 int，较大的计数用 long long，而像金额这种需要精确小数的数据不应当使用浮点型，而应改用整数配合单位换算。

```c
#include <stdio.h>

int main(void)
{
    char c = 'A';                    /* 字符型，本质是小整数 */
    short s = -12;                   /* 短整型 */
    int i = 2024;                    /* 基本整型，最常用 */
    long l = 123456L;                /* 长整型，字面量加 L 后缀 */
    long long ll = 1234567890123LL;  /* 更长的整型，加 LL 后缀 */
    float f = 3.5f;                  /* 单精度浮点，加 f 后缀 */
    double d = 2.718281828;          /* 双精度浮点，默认的浮点类型 */

    printf("c = %c, s = %hd, i = %d\n", c, s, i);
    printf("l = %ld, ll = %lld\n", l, ll);
    printf("f = %.2f, d = %.6f\n", (double)f, d);
    printf("(int)c = %d，字符可以参与算术运算\n", (int)c);
    return 0;
}
```

## signed、unsigned 与 sizeof 运算符

数据类型占用的字节数由具体实现决定，标准只保证最小范围：char 至少 8 位，short 和 int 至少 16 位，long 至少 32 位，long long 至少 64 位，并且 sizeof(char) 恒等于 1。常见的 64 位 Linux 平台上 int 为 4 字节、long 为 8 字节，而 64 位 Windows 平台上 long 仍然是 4 字节、只有 long long 才是 8 字节，这就是同一份代码在不同平台表现不同的典型原因。写程序时不要硬编码字节数，而应使用 sizeof 运算符获取实际长度；确实需要固定宽度时，可以使用 <stdint.h> 中的 int32_t、uint64_t 等类型。signed 与 unsigned 决定最高位是否作为符号位：有符号数用补码表示，无符号数把所有位都当作数值，因此无符号数递减到边界之后会回绕成最大值。

```c
#include <stdio.h>

int main(void)
{
    printf("char      : %zu 字节\n", sizeof(char));
    printf("short     : %zu 字节\n", sizeof(short));
    printf("int       : %zu 字节\n", sizeof(int));
    printf("long      : %zu 字节\n", sizeof(long));
    printf("long long : %zu 字节\n", sizeof(long long));
    printf("float     : %zu 字节\n", sizeof(float));
    printf("double    : %zu 字节\n", sizeof(double));

    unsigned int u = 0;
    u = u - 1;                       /* 无符号下溢，按 2 的位宽取模回绕 */
    printf("0u - 1 = %u\n", u);

    signed int s = -1;
    printf("(unsigned)(-1) = %u\n", (unsigned int)s);
    return 0;
}
```

## 常量：字面常量与符号常量

常量是在程序运行期间不能被修改的量。字面常量直接写在代码里，例如 100、3.14、'A'、"hello"；后缀可以明确它的类型，10L 是 long 型，10u 是无符号型，3.14f 是 float 型，3.14L 是 long double 型。符号常量通常用 #define 定义，预处理阶段进行的是原样的文本替换，它没有类型信息，也不占用存储空间，习惯上用全大写字母命名以便和变量区分。更符合现代 C 语言风格的做法是用 const 限定符定义常量，例如 const double PI = 3.14159; 这样的常量具有明确的类型，编译器可以做类型检查，调试时也能看到名字，作用域遵循普通变量的规则。需要注意的是，const 修饰的对象在 C 语言中仍然是变量，只是不允许通过它本身去修改值。

```c
#include <stdio.h>

#define PI 3.14159            /* 宏定义的符号常量，无类型 */
#define MAX_STUDENT 50        /* 习惯上使用全大写命名 */

int main(void)
{
    const double gravity = 9.8;      /* const 常量，有类型，只读 */
    double radius = 2.0;

    printf("PI = %f\n", PI);
    printf("半径 %.1f 的圆面积 = %.4f\n", radius, PI * radius * radius);
    printf("最多容纳学生 %d 人\n", MAX_STUDENT);
    printf("重力加速度 = %.1f\n", gravity);
    return 0;
}
```

## 变量：定义、初始化与赋值

变量是程序中可以改变的量，使用之前必须先定义，定义时给出类型和名字，编译器据此为其分配存储空间，并决定该变量能够存放的值的范围。定义的同时可以初始化，例如 int age = 20; 也可以先定义、稍后再用赋值语句写入值。在函数内部定义的局部变量如果没有初始化，它的值是内存中残留的不确定数据，读取它属于未定义行为，所以局部变量一定要先赋初值再使用。在函数外部定义的全局变量会由系统自动初始化为 0，但依赖这种默认值会降低代码的可读性，仍然建议显式初始化。定义会真正分配存储空间，而声明只是告诉编译器某个名字的类型，通常用 extern 关键字修饰，用于在多个源文件之间共享全局变量。

```c
#include <stdio.h>

int main(void)
{
    extern int total;            /* 声明：total 在后面的某处定义 */
    int age = 20;                /* 定义并初始化 */
    double score;                /* 先定义 */
    score = 95.5;                /* 后赋值 */

    printf("age = %d, score = %.1f\n", age, score);
    printf("total = %d\n", total);
    return 0;
}

int total = 500;                 /* 定义全局变量 */
```

## 标识符命名规则与关键字

标识符是程序员为变量、函数、类型等起的名字。命名规则是：只能由字母、数字和下划线组成，必须以字母或下划线开头，区分大小写，并且不能与关键字重名。C11 的关键字共有 44 个，包括 int、char、if、else、while、for、return、sizeof、const、static、struct 等，它们在语言中有固定含义，不能被当作普通标识符使用。以单个下划线开头、尤其是以双下划线开头的标识符被标准库保留，程序中应当避免使用。良好的命名应当见名知义：变量用名词，函数用动词短语，多个单词之间用下划线分隔，例如 student_count、calculate_average，尽量避免使用 a1、tmp、data 这类含义模糊的名字，因为可读性直接影响长期维护成本。

```c
#include <stdio.h>

int student_count = 3;              /* 全局变量：名词短语，含义清晰 */
double average_score = 88.5;

/* 计算平均分：函数名使用动词短语 */
double compute_average(int total, int count)
{
    if (count == 0) {
        return 0.0;
    }
    return (double)total / count;
}

int main(void)
{
    int max_value = 100;            /* 合法：字母开头，含下划线 */
    int value2 = 2;                 /* 合法：可以包含数字，但不能以数字开头 */
    int total_score = 265;

    printf("%d %d\n", max_value, value2);
    printf("人数 %d，平均分 %.2f\n", student_count,
           compute_average(total_score, student_count));
    printf("平均值常量 %.2f\n", average_score);
    return 0;
}
```

## 整数进制表示与进制转换

C 语言的整数字面常量可以用三种进制书写。十进制是最常见的形式；以 0 开头表示八进制，例如 0377 等于十进制的 255；以 0x 或 0X 开头表示十六进制，例如 0xFF 与 0xff 也都等于 255。C11 标准没有提供二进制字面量，0b 前缀只是部分编译器的扩展，直到 C23 才正式加入标准。各种进制之间可以按位权展开互相转换：二进制转八进制时每三位并成一位，转十六进制时每四位并成一位；十进制转其他进制用除基取余法，把每次得到的余数从下往上读出即可得到结果。程序中写八进制和十六进制主要是为了直观地表达位模式，例如文件权限、寄存器配置和颜色值。

```c
#include <stdio.h>

int main(void)
{
    int dec = 255;              /* 十进制字面常量 */
    int oct = 0377;             /* 八进制：以 0 开头 */
    int hex = 0xFF;             /* 十六进制：以 0x 开头 */
    unsigned int uhex = 0xffu;  /* 无符号十六进制：加 u 后缀 */

    printf("dec = %d, oct = %d, hex = %d, uhex = %u\n", dec, oct, hex, uhex);
    printf("255 的八进制 = %o，十六进制 = %x，大写 = %X\n", dec, dec, dec);
    printf("八进制 10 的十进制值 = %d\n", 010);
    printf("十六进制 1A 的十进制值 = %d\n", 0x1A);
    return 0;
}
```

## 转义字符与字符常量

转义字符是用反斜杠引导的字符序列，用来表示无法直接书写或者具有特殊含义的字符。常用的有：\n 表示换行，\t 表示水平制表符，\r 表示回车，\b 表示退格，\a 表示响铃，\\ 表示反斜杠本身，\' 表示单引号，\" 表示双引号，\0 表示空字符。空字符的编码值是 0，它是字符串的结束标志，每个字符串字面量末尾都会被编译器自动补上一个空字符。除此之外还可以用八进制和十六进制转义表示任意字符，例如 \101 和 \x41 都表示字符 A；八进制转义最多吸收三位数字，而十六进制转义会尽可能多地吸收后面的十六进制数字，所以 \x41 后面紧跟数字时容易产生歧义，建议把字符串拆成两段书写。

```c
#include <stdio.h>

int main(void)
{
    char ch = 'A';
    char newline = '\n';
    char tab = '\t';
    char quote = '\'';
    char backslash = '\\';
    char oct_escape = '\101';        /* 八进制转义，等于 'A' */
    char hex_escape = '\x42';        /* 十六进制转义，等于 'B' */
    char end = '\0';                 /* 空字符，字符串结束标志 */

    printf("ch = %c, quote = %c, backslash = %c\n", ch, quote, backslash);
    printf("newline = %d, tab = %d, end = %d\n", newline, tab, end);
    printf("八进制转义 %c，十六进制转义 %c\n", oct_escape, hex_escape);
    printf("第一段\\t带制表符\\n第二段\\a响铃后结束\\n");
    return 0;
}
```

## 浮点类型与浮点字面量

浮点类型用于表示带有小数部分的实数。float 通常是 4 字节，提供大约 7 位有效数字；double 通常是 8 字节，提供大约 15 位有效数字；long double 的长度和精度由实现决定。浮点字面量默认是 double 类型，加上 f 后缀表示 float，加上 L 后缀表示 long double，也支持 1.5e-3 这样的科学计数法写法。浮点数在内存中按 IEEE 754 标准以符号位、指数位和尾数位的形式存储，许多十进制小数例如 0.1 无法用二进制精确表示，只能近似存储。因此浮点数通常不能直接用 == 判断相等，正确的做法是判断两个数之差的绝对值是否小于给定的容差；在要求精确计算的场合，例如金额统计，应当改用整数或者定点数表示。

```c
#include <stdio.h>
#include <math.h>

int main(void)
{
    float f = 3.14f;                  /* f 后缀表示 float 字面量 */
    double d = 3.14;                  /* 无后缀默认是 double */
    long double ld = 3.14L;           /* L 后缀表示 long double */
    double sci = 1.5e-3;              /* 科学计数法，等于 0.0015 */
    const double eps = 1e-9;          /* 比较浮点数用的容差 */

    printf("f = %.8f\n", (double)f);
    printf("d = %.15f\n", d);
    printf("ld = %.15Lf\n", ld);
    printf("sci = %.6f\n", sci);

    printf("0.1 + 0.2 = %.20f\n", 0.1 + 0.2);
    if (fabs((0.1 + 0.2) - 0.3) < eps) {
        printf("在容差范围内认为相等\n");
    } else {
        printf("直接用 == 比较会判定为不相等\n");
    }
    return 0;
}
```

## 隐式类型转换与整型提升

当运算符两侧的操作数类型不一致时，编译器会按照规则自动完成隐式类型转换。对于 char、short 以及位域这类长度小于 int 的整数类型，首先进行整型提升，转换为 int（如果 int 装不下该类型的全部取值则转换为 unsigned int）之后再参与运算，这也是 sizeof('a' + 'b') 通常等于 4 的原因。此后的常见算术转换遵循向精度更高、范围更大的类型看齐的原则：如果一方是 long double，另一方就转换为 long double；否则依次考虑 double、float、unsigned long long、long long 等类型。当相同等级的有符号类型与无符号类型相遇时，有符号类型会转换为无符号类型，这常常导致负数被解释成一个很大的正数，是隐蔽错误的常见来源。

```c
#include <stdio.h>

int main(void)
{
    char c = 100;
    short s = 200;
    int i = 70000;
    double d = 1.5;
    unsigned int u = 10u;

    int sum = c + s;                  /* char 与 short 先提升为 int 再相加 */
    double result = i + d;            /* int 转换为 double 后相加 */
    printf("c + s = %d, i + d = %.2f\n", sum, result);
    printf("sizeof(c + s) = %zu（整型提升为 int）\n", sizeof(c + s));

    if ((int)(-1) < u) {
        printf("-1 < 10u 成立\n");
    } else {
        printf("-1 与 unsigned 比较时被转成无符号大数，条件为假\n");
    }

    printf("(unsigned)(-1) = %u\n", (unsigned int)(-1));
    return 0;
}
```

## 强制类型转换、精度丢失与溢出

强制类型转换用圆括号写出目标类型，语法形式为 (类型名)表达式，它把表达式的值转换之后交给上下文使用，但不会改变原变量本身。从浮点类型转换为整数类型时直接截断小数部分，而不是四舍五入，所以 (int)3.99 的结果是 3。从长类型转换为短类型时会发生高位截断，例如把 300 存入 char 类型会得到 44，因为 300 减去 256 之后只剩下低 8 位，这种情况称为溢出。有符号整数的算术溢出属于未定义行为，结果不可预测，编译器也可能做出意想不到的优化；无符号整数的溢出则被标准明确定义为按 2 的位宽取模回绕。为了避免溢出，可以在运算之前判断边界，或者把中间结果提升为更宽的类型。

```c
#include <stdio.h>
#include <limits.h>

int main(void)
{
    double d = 3.99;
    int i = (int)d;                       /* 浮点转整数：直接截断 */
    float f = (float)1.234567890123;      /* 双精度转单精度：精度丢失 */
    double back = (double)f;

    printf("i = %d\n", i);
    printf("f = %.10f, back = %.15f\n", (double)f, back);

    int big = INT_MAX;
    int overflow = big + 1;               /* 有符号溢出，行为未定义 */
    printf("INT_MAX = %d, INT_MAX + 1 = %d\n", big, overflow);

    unsigned int u = UINT_MAX;
    unsigned int wrap = u + 1;            /* 无符号回绕，标准定义为 0 */
    printf("UINT_MAX = %u, UINT_MAX + 1 = %u\n", u, wrap);

    int wide = 300;
    char narrow = (char)wide;             /* 截断为低 8 位 */
    printf("300 存入 char 之后 = %d\n", (int)narrow);
    return 0;
}
```

## 算术运算符与赋值运算符

算术运算符包括加、减、乘、除和取余。两个整数相除执行整数除法，结果向零截断，7/2 得到 3，-7/2 得到 -3；取余运算符 % 只能用于整数，结果的符号与被除数一致。如果希望得到小数结果，必须让参与运算的操作数中至少有一个是浮点类型，例如写成 (double)a / b。运算符的优先级是：单目运算符高于乘除取余，乘除取余高于加减，同级运算符从左到右结合。赋值运算符 = 是右结合的，a = b = 5 等价于 a = (b = 5)。复合赋值运算符 +=、-=、*=、/=、%= 等把运算与赋值合并，写法简洁，而且左侧表达式的下标或指针只求值一次，例如 a[i++] += 1 中 i 只自增一次。

```c
#include <stdio.h>

int main(void)
{
    int a = 7;
    int b = 2;

    printf("a + b = %d, a - b = %d, a * b = %d\n", a + b, a - b, a * b);
    printf("a / b = %d（整数除法，结果截断）\n", a / b);
    printf("a %% b = %d（结果的符号与被除数一致）\n", a % b);
    printf("(double)a / b = %.2f\n", (double)a / b);
    printf("-7 / 2 = %d, -7 %% 2 = %d\n", -7 / 2, -7 % 2);

    int acc = 10;
    acc += 5;          /* 等价于 acc = acc + 5 */
    acc -= 3;
    acc *= 2;
    acc /= 4;
    acc %= 5;
    printf("复合赋值之后 acc = %d\n", acc);

    a = b = 5;         /* 赋值右结合 */
    printf("a = %d, b = %d\n", a, b);
    return 0;
}
```

## 关系运算符与逻辑运算符

关系运算符有 <、<=、>、>=、==、!=，用于比较两个值的大小或相等关系，结果是 int 类型的 1 表示真、0 表示假。很多初学者把赋值号 = 与相等判断 == 写混，导致条件永远成立或者永远不成立，这类错误编译器通常不会报错，需要格外小心。逻辑运算符有 &&、||、!，操作数按非零即真的规则处理，结果同样是 1 或 0。&& 和 || 具有短路求值特性：&& 的左侧为假时右侧不再计算，|| 的左侧为真时右侧不再计算。这一特性既提高了执行效率，也可以用来保护运算，例如写成 if (p != NULL && *p > 0) 就能避免空指针解引用，把判零条件放在前面也能有效防止除零。

```c
#include <stdio.h>

int main(void)
{
    int a = 5;
    int b = 8;

    printf("a < b = %d, a == b = %d, a != b = %d, a >= b = %d\n",
           a < b, a == b, a != b, a >= b);
    printf("a < b && b < 10 = %d\n", a < b && b < 10);
    printf("a > b || b > 0 = %d\n", a > b || b > 0);
    printf("!a = %d（非零取反为 0）\n", !a);

    if (b != 0 && a / b >= 0) {          /* 短路：先判断 b 是否为 0 */
        printf("b 不为 0，除法安全\n");
    }

    int n = 0;
    if (b == 0 || ++n > 0) {             /* 左侧为假，右侧被求值 */
        printf("右侧参与计算，n = %d\n", n);
    } else {
        printf("右侧被短路，n = %d\n", n);
    }
    return 0;
}
```

## 位运算符

位运算符直接对整数的二进制位进行操作，常用于底层编程、标志位管理和对性能敏感的场景。& 按位与可以取出指定的位，也常用来判断奇偶，例如 x & 1；| 按位或可以把某些位置 1；^ 按位异或可以把某些位取反，同一个数与自身异或得到 0，与 0 异或保持原值；~ 是按位取反的单目运算符，会把包括符号位在内的所有位全部翻转。左移 << 把各位向左移动，右边补 0，在不溢出的前提下相当于乘以 2 的幂；右移 >> 把各位向右移动，对无符号数是逻辑右移，左边补 0，对有符号负数是实现定义的算术右移，左边补符号位。移位的位数不能为负数，也不能大于或等于操作数的位宽，否则属于未定义行为。

```c
#include <stdio.h>

int main(void)
{
    unsigned int a = 0xF0u;      /* 1111 0000 */
    unsigned int b = 0x3Cu;      /* 0011 1100 */
    unsigned int flags = 0x5Au;  /* 0101 1010 */

    printf("a & b  = 0x%X\n", a & b);
    printf("a | b  = 0x%X\n", a | b);
    printf("a ^ b  = 0x%X\n", a ^ b);
    printf("~a     = 0x%X\n", ~a);
    printf("a << 2 = 0x%X, a >> 2 = 0x%X\n", a << 2, a >> 2);

    printf("flags & 1 = %u，所以该数是%s\n",
           flags & 1u, (flags & 1u) ? "奇数" : "偶数");
    printf("flags 的第 3 位（从 0 开始编号）= %u\n", (flags >> 3) & 1u);
    printf("把第 1 位置 1 后 = 0x%X\n", flags | (1u << 1));
    printf("把第 1 位清 0 后 = 0x%X\n", flags & ~(1u << 1));
    return 0;
}
```

## 条件运算符、逗号运算符与自增自减

条件运算符是 C 语言中唯一的三目运算符，形式为 条件 ? 表达式1 : 表达式2，先求条件的值，为真时取表达式1的值，否则取表达式2的值，它能写出简洁的取最值、根据条件赋值这类代码。逗号运算符把多个表达式串联起来，从左到右依次求值，整个表达式的值等于最后一个表达式的值，常用于 for 循环的初始化和更新部分。自增 ++ 和自减 -- 各有前置与后置两种形式：前置形式先把变量加一，再把新值作为表达式的值；后置形式先取变量的原值作为表达式的值，再把变量加一。当自增的结果不参与其他运算时，两种写法效果相同；不要写出 i = i++ + ++i 这类在同一表达式中多次修改同一个变量的代码，其行为是未定义的。

```c
#include <stdio.h>

int main(void)
{
    int a = 10;
    int b = 20;

    int max_value = (a > b) ? a : b;      /* 条件运算符 */
    printf("较大值 = %d\n", max_value);

    int i = 0;
    int j = 0;
    int k = (i++, j++, i + j);            /* 逗号运算符：取最后一个表达式的值 */
    printf("k = %d, i = %d, j = %d\n", k, i, j);

    int m = 5;
    int pre = ++m;                        /* 前置：先加 1 再取值 */
    int post = m++;                       /* 后置：先取值再加 1 */
    printf("pre = %d, post = %d, m = %d\n", pre, post, m);

    int n = 5;
    n--;                                  /* 结果不参与其他运算时二者等价 */
    --n;
    printf("n = %d\n", n);
    return 0;
}
```

## 运算符优先级与结合性

运算符优先级决定了没有括号时表达式的结合方式，结合性决定了同级运算符的计算方向。记忆顺序可以简记为：括号、下标、函数调用与成员访问最优先；其次是单目运算符，包括逻辑非、按位取反、自增自减、强制类型转换和 sizeof；然后是乘、除、取余；再是加、减和移位；接着是关系运算符和相等运算符；随后是位运算中的按位与、异或、或；再是逻辑与和逻辑或；最后是条件运算符、赋值运算符和逗号运算符。其中条件运算符和赋值运算符是右结合的，其余多数运算符是左结合的。实践经验是：遇到位运算、移位与算术混合，或者逻辑运算与比较运算混合时，宁可多写一对括号，既能保证语义正确，也方便他人阅读。

```c
#include <stdio.h>

int main(void)
{
    int a = 2;
    int b = 3;
    int c = 4;

    printf("a + b * c = %d（先乘后加）\n", a + b * c);
    printf("(a + b) * c = %d（括号最优先）\n", (a + b) * c);
    printf("(a > b) == 0 = %d（括号保证比较先算）\n", (a > b) == 0);
    int shifted = a << (2 + 1);   /* 加法优先于移位：先算 2 + 1，再左移 */
    printf("a << 2 + 1 = %d（加法先算，等价于 a << 3）\n", shifted);
    printf("1 + 2 > 2 && 3 - 1 < 5 = %d\n", (1 + 2 > 2) && (3 - 1 < 5));
    printf("a & 1 == 0 需要写成 (a & 1) == 0，结果 %d\n", (a & 1) == 0);

    a = b = c = 5;                     /* 赋值运算符右结合 */
    printf("a = %d, b = %d, c = %d\n", a, b, c);

    int x = 1;
    int y = 2;
    x = y = x + y;
    printf("x = %d, y = %d\n", x, y);
    return 0;
}
```

## 综合示例：位运算交换与溢出检测

本节用一个综合示例把前面的知识串联起来。第一个函数用异或运算在不借助临时变量的条件下交换两个整数，原理是同一个数与自己异或得到 0，而任何数与 0 异或仍然等于它本身，三次异或之后两个变量的值就完成了互换；需要注意当两个指针指向同一个变量时必须直接返回，否则第一次异或就把值清零了。第二个函数在相加之前判断是否越界：两个正数相加时，如果一个加数大于 INT_MAX 减去另一个加数，结果就会溢出；两个负数相加时与 INT_MIN 比较即可。这种先判断、后运算的写法能够避免触发有符号溢出的未定义行为，是把类型边界知识落到实处的典型做法。

```c
#include <stdio.h>
#include <limits.h>

/* 用异或运算交换两个整数，不使用临时变量 */
void swap_by_xor(int *px, int *py)
{
    if (px == py) {            /* 指向同一变量时不能使用异或交换 */
        return;
    }
    *px = *px ^ *py;
    *py = *px ^ *py;
    *px = *px ^ *py;
}

/* 判断两个 int 相加是否会溢出 */
int will_overflow(int a, int b)
{
    if (a > 0 && b > 0 && a > INT_MAX - b) {
        return 1;
    }
    if (a < 0 && b < 0 && a < INT_MIN - b) {
        return 1;
    }
    return 0;
}

int main(void)
{
    int x = 12;
    int y = 25;

    swap_by_xor(&x, &y);
    printf("交换后 x = %d, y = %d\n", x, y);

    printf("2000000000 + 2000000000 溢出？%s\n",
           will_overflow(2000000000, 2000000000) ? "是" : "否");
    printf("100 + 200 溢出？%s\n", will_overflow(100, 200) ? "是" : "否");
    printf("INT_MAX = %d, INT_MIN = %d\n", INT_MAX, INT_MIN);
    return 0;
}
```
