---
sourceKey: c-pro-struct-file
title: C语言讲义·结构体、共用体、预处理与文件操作
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 结构体
language: zh-CN
sourceType: team_authored
documentKey: c-pro-struct-file
---
# 结构体、共用体、预处理与文件操作

## 结构体的定义、变量声明与初始化

结构体把若干类型不同但逻辑相关的数据成员组合为一个整体，是 C 语言描述复合数据类型的核心手段。定义语法为 struct 名字 { 成员列表; };，右花括号之后的分号绝不能漏写，否则会引发难以定位的语法错误。结构体定义本身只是描述内存布局的模板，并不占用存储空间；只有用它声明变量时，系统才按照成员布局分配内存。声明变量有几种等价形式：先定义结构体类型再声明变量、在定义类型的同时直接声明变量，或者省去标签写成匿名结构体并立即声明变量。初始化时可用花括号按成员声明顺序依次赋值；C99 起还支持指定初始化器，以点号加成员名的形式显式指定成员，初始化顺序可以与声明顺序不同，未被显式指定的成员一律被初始化为零。局部结构体变量若未初始化，其成员的值是不确定的，使用前必须逐个赋值；而具有静态存储期的结构体变量若未显式初始化，则所有成员自动置零。

```c
#include <stdio.h>

struct Point {
    int x;
    int y;
};

int main(void) {
    struct Point p1;                    /* 先定义类型，再声明变量 */
    struct Point p2 = {3, 4};           /* 按成员声明顺序初始化 */
    struct Point p3 = {.y = 7, .x = 1}; /* C99 指定初始化器，顺序可打乱 */
    struct Point p4 = {0};              /* 未指定的成员自动置 0 */

    p1.x = 10;
    p1.y = 20;

    printf("p1=(%d,%d) p2=(%d,%d)\n", p1.x, p1.y, p2.x, p2.y);
    printf("p3=(%d,%d) p4=(%d,%d)\n", p3.x, p3.y, p4.x, p4.y);
    printf("sizeof(struct Point) = %zu 字节\n", sizeof(struct Point));
    return 0;
}
```

## 成员访问：圆点运算符与箭头运算符

访问结构体成员有两种运算符。圆点运算符作用于结构体变量本身，其左操作数必须是结构体类型的对象；箭头运算符作用于指向结构体的指针，ptr->member 完全等价于 (*ptr).member，但写法更简洁、可读性更好，是访问指针所指结构体成员的惯用形式。两种运算符优先级都很高，仅次于后缀自增自减、函数调用和数组下标，因此 p->x++ 表示对成员自增而不是对指针自增。结构体变量之间可以整体赋值，编译器按成员逐一拷贝，这属于浅拷贝：成员为数组时数组内容被完整复制，成员为指针时只复制地址，两个结构体随即共享同一块动态内存，需要格外小心。结构体不能用双等号直接比较，必须逐成员比较。还有一种常见写法是先取得某个成员的地址再用指针操作，对于嵌套较深的成员，这样比连续书写运算符更加清晰；无论采用哪种写法，都必须保证指针指向一个有效的结构体对象，对未初始化或已经失效的指针解引用属于未定义行为。

```c
#include <stdio.h>

struct Point {
    int x;
    int y;
};

int main(void) {
    struct Point a = {1, 2};
    struct Point b = a;          /* 整体赋值：逐成员拷贝 */
    struct Point *p = &a;

    p->x = 100;                  /* 与 (*p).x = 100 等价 */
    (*p).y = 200;

    printf("a=(%d,%d) b=(%d,%d)\n", a.x, a.y, b.x, b.y);
    printf("&a=%p p=%p\n", (void *)&a, (void *)p);
    printf("a 与 b 的第一个成员相等吗：%s\n", (a.x == b.x) ? "相等" : "不等");
    return 0;
}
```

## typedef、结构体别名与匿名结构体

typedef 为已有类型引入新名字，配合结构体可以省去每次书写 struct 关键字的麻烦。常见写法是 typedef struct 标签 { 成员列表 } 别名;，此后即可直接用别名声明变量，标签甚至可以省去。命名习惯上，结构体标签常用小写加下划线，typedef 别名常用大写字母开头或者加 _t 后缀，例如 Point 与 point_t，团队内部应保持一致以便阅读。匿名结构体没有标签，只能依靠 typedef 别名或直接声明的变量来使用，适合一次性、局部的小结构。需要提醒的是，typedef 建立的是类型别名而不是新类型，编译器仍视其为原类型，因此别名之间可以互相赋值；typedef 也不参与预处理，不能用它做条件编译判断。使用别名之后，声明指针、数组与函数参数都更加简洁，例如 Node *head 或者 Complex arr[10]；还可以为结构体指针本身起别名，此时别名与原来的指针类型完全等价，但要记住指针本身为常量与所指内容为常量是两回事，前者表示指针不能被修改，后者表示不能通过它修改所指对象。

```c
#include <stdio.h>

typedef struct {
    double real;
    double imag;
} Complex;                        /* 匿名结构体加别名 */

typedef struct Node {
    int value;
    struct Node *next;            /* 自引用必须保留标签 */
} Node;

int main(void) {
    Complex c1 = {1.0, 2.0};
    Complex c2 = c1;              /* 同一类型，可直接整体赋值 */
    Node n1 = {10, NULL};
    Node n2 = {20, &n1};

    printf("c1 = %.1f + %.1fi\n", c1.real, c1.imag);
    printf("c2 = %.1f + %.1fi\n", c2.real, c2.imag);
    printf("n2.value=%d, n2.next->value=%d\n", n2.value, n2.next->value);
    printf("sizeof(Complex)=%zu sizeof(Node)=%zu\n", sizeof(Complex), sizeof(Node));
    return 0;
}
```

## 结构体数组：定义、遍历与按成员排序

结构体数组把同类型的结构体连续存放，是存储表格型数据的常规做法。声明形式为 struct 类型名 数组名[元素个数];，初始化时用嵌套花括号为每个元素提供初值，内层花括号可以省去，此时初值按成员顺序扁平地依次填充。访问元素使用 数组名[i].成员 的形式，遍历时通常用 sizeof(arr) / sizeof(arr[0]) 计算元素个数，避免把长度写死。实际工程中常常需要按某个成员排序，标准库的 qsort 是最直接的方案：比较函数接收两个 const void * 参数，先转换为指向结构体的指针再比较目标成员，返回值小于零、等于零、大于零分别表示前者小于、等于、大于后者。排序只交换结构体整体，记录内部各成员的对应关系不会被破坏。若需要按多个关键字排序，可以在比较函数里先比较主关键字，相等时再比较次关键字。结构体数组占用连续内存，因此也可以把首地址整体传给二进制块读写函数一次保存，只是其中的填充字节会一并写入。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char name[16];
    int score;
} Student;

static int cmp_by_score(const void *a, const void *b) {
    const Student *pa = (const Student *)a;
    const Student *pb = (const Student *)b;
    return (pa->score > pb->score) - (pa->score < pb->score);
}

int main(void) {
    Student class1[4] = {
        {"Wang", 88}, {"Li", 95}, {"Zhao", 72}, {"Chen", 91}
    };
    size_t n = sizeof(class1) / sizeof(class1[0]);
    size_t i;

    printf("排序前：\n");
    for (i = 0; i < n; i++) {
        printf("  %s : %d\n", class1[i].name, class1[i].score);
    }

    qsort(class1, n, sizeof(class1[0]), cmp_by_score);

    printf("按成绩升序排序后：\n");
    for (i = 0; i < n; i++) {
        printf("  %s : %d\n", class1[i].name, class1[i].score);
    }
    return 0;
}
```

## 结构体作为函数参数与返回结构体

结构体作为函数参数默认是值传递，实参的全部成员会被完整拷贝给形参，形参在函数内部的修改不会影响调用者。当结构体较大时，这份拷贝在时间和栈空间上的开销都很可观，因此工程上普遍改为传递指针或者指向常量的指针：const struct Point *p 既避免了拷贝，又通过 const 承诺函数不会修改实参内容。函数也可以返回结构体，C 语言允许直接返回一个结构体对象，调用处可以整体接收，编译器会把它拷贝到接收变量中。返回局部结构体是安全的，但要特别注意绝不能返回指向函数内部局部变量的指针，因为函数返回后该变量的生存期已经结束，继续访问属于未定义行为。判断该传值还是传指针有一条实用准则：结构体明显大于几个指针的宽度时传递指针通常更快，而当结构体只含一两个基本类型成员时直接传值反而省去了解引用开销，也更容易被编译器优化。

```c
#include <stdio.h>

typedef struct {
    double x;
    double y;
} Point;

/* 值传递：拷贝整个结构体，函数内修改不影响实参 */
static Point move_copy(Point p, double dx, double dy) {
    p.x += dx;
    p.y += dy;
    return p;                     /* 返回结构体，安全 */
}

/* 指针传递：避免拷贝，const 保证不改动实参 */
static void print_point(const Point *p) {
    printf("(%.2f, %.2f)\n", p->x, p->y);
}

int main(void) {
    Point a = {1.0, 2.0};
    Point b;

    b = move_copy(a, 10.0, 20.0);
    printf("实参 a 未被修改：");
    print_point(&a);
    printf("返回值 b：");
    print_point(&b);
    printf("sizeof(Point) = %zu\n", sizeof(Point));
    return 0;
}
```

## 结构体嵌套：成员是结构体

结构体嵌套指一个结构体的成员本身又是另一个结构体类型，用于表达层次化的数据，例如学生拥有姓名与出生日期，而日期本身由年、月、日三个成员组成。嵌套初始化时内层结构体用一组花括号括起，书写形式与声明层次一一对应；如果省去内层花括号，初值会按成员展开顺序依次填充，容易出错，建议始终写全花括号。访问嵌套成员需要连续使用圆点或者箭头运算符，逐层深入，例如 stu.birth.year 或 pstu->birth.month。当嵌套层次较深时，长表达式可读性明显下降，通常先用一个局部指针指向内层结构体，再通过该指针访问成员，既简洁又避免重复解引用。还要注意结构体不能包含自身的实例，因为那样大小无法确定，只能包含指向自身类型的指针，链表与树正是这样构造出来的；若两个结构体需要互相引用，可以先声明不完全类型，再放置指向对方的指针成员。

```c
#include <stdio.h>

typedef struct {
    int year;
    int month;
    int day;
} Date;

typedef struct {
    char name[16];
    Date birth;                   /* 成员是另一个结构体 */
    double height;
} Student;

int main(void) {
    Student s1 = {"Zhang San", {2003, 9, 1}, 1.75};
    Student s2 = {"Li Si", {.year = 2004, .month = 2, .day = 18}, 1.68};
    Student *ps = &s1;
    Date *pd = &s1.birth;         /* 局部指针，简化深层访问 */

    printf("%s 出生于 %d 年 %d 月 %d 日\n",
           s1.name, s1.birth.year, s1.birth.month, s1.birth.day);
    printf("%s 出生于 %d-%02d-%02d，身高 %.2f 米\n",
           ps->name, pd->year, pd->month, pd->day, ps->height);
    printf("%s 出生于 %d-%02d-%02d\n",
           s2.name, s2.birth.year, s2.birth.month, s2.birth.day);
    printf("sizeof(Student) = %zu\n", sizeof(Student));
    return 0;
}
```

## 结构体的内存对齐与布局

结构体成员在内存中按声明顺序排列，但编译器会进行内存对齐：每个成员的起始地址必须是其自身对齐要求的整数倍，整个结构体的大小也必须是最大成员对齐值的整数倍。对齐由硬件访问效率和平台应用二进制接口决定，代价是引入填充字节，使结构体大小往往大于成员大小之和；基本类型一般按其自身大小对齐，指针在 64 位平台对齐到 8 字节。计算 sizeof 的方法是：从偏移零开始逐个放置成员，每个成员之前补齐到它的对齐边界，最后整体补齐到最大对齐值的整数倍。标准头文件 stddef.h 提供的 offsetof 宏可以在编译期取得成员偏移，便于验证布局；#pragma pack(n) 可临时降低最大对齐值，常用于与文件格式、网络协议对齐，但会牺牲访问性能且可移植性较差。调整成员声明顺序也能减少填充：把对齐要求高的成员排在前面，把字符型成员集中放在末尾，往往可以显著缩小结构体。

```c
#include <stdio.h>
#include <stddef.h>

struct A {
    char c;      /* 偏移 0，占 1 字节 */
    int i;       /* 需对齐到 4，偏移 4，填充 3 字节 */
    char d;      /* 偏移 8 */
};               /* 整体补齐到 12 */

#pragma pack(push, 1)          /* 按 1 字节对齐，取消填充 */
struct B {
    char c;
    int i;
    char d;
};
#pragma pack(pop)              /* 恢复默认对齐 */

int main(void) {
    printf("struct A 大小 = %zu\n", sizeof(struct A));
    printf("A.c 偏移 = %zu, A.i 偏移 = %zu, A.d 偏移 = %zu\n",
           offsetof(struct A, c), offsetof(struct A, i), offsetof(struct A, d));
    printf("struct B 大小 = %zu\n", sizeof(struct B));
    printf("B.c 偏移 = %zu, B.i 偏移 = %zu, B.d 偏移 = %zu\n",
           offsetof(struct B, c), offsetof(struct B, i), offsetof(struct B, d));
    return 0;
}
```

## 共用体、枚举与位域

共用体 union 的多个成员共享同一段内存，其大小等于最大成员的大小并按最大对齐值对齐，同一时刻只有一个成员的值有意义：写入一个成员会覆盖其他成员的内容。共用体常用于节省内存以及在同一块字节上做不同类型的解释，判断当前机器的字节序就是经典例子，把整数一写入整型成员后检查首字节，首字节为一说明是小端序。枚举 enum 用一组具名整型常量提高代码可读性，枚举常量默认从零开始依次加一，也可以显式指定初值。位域允许在结构体中按位声明成员，形式为 unsigned int 成员名 : 位数;，用于紧凑地表示标志位或者协议字段；位域的布局与分配顺序由实现定义，可移植性较差，而且不能对位域取地址。三者的取舍原则是：需要同时保存多个属性时用结构体，需要多种解释共用同一块存储时用共用体，需要一组具名常量时用枚举，需要按位节省空间时用位域。

```c
#include <stdio.h>

union Number {
    unsigned int value;
    unsigned char bytes[4];
};

enum Color { RED, GREEN, BLUE = 5, WHITE };

struct Flags {
    unsigned int readable : 1;
    unsigned int writable : 1;
    unsigned int executable : 1;
    unsigned int reserved : 5;
};

int main(void) {
    union Number n;
    struct Flags f = {1, 1, 0, 0};

    n.value = 1;
    printf("union 大小 = %zu\n", sizeof(union Number));
    printf("本机为%s端序\n", (n.bytes[0] == 1) ? "小" : "大");

    printf("枚举值：RED=%d GREEN=%d BLUE=%d WHITE=%d\n", RED, GREEN, BLUE, WHITE);
    printf("标志位：可读=%u 可写=%u 可执行=%u，结构体大小=%zu\n",
           f.readable, f.writable, f.executable, sizeof(struct Flags));
    return 0;
}
```

## 预处理过程与四个编译阶段

从源代码到可执行程序要经过四个阶段。预处理阶段由预处理器处理所有以井号开头的指令，完成头文件展开、宏替换、条件编译与注释删除，输出纯净的翻译单元；编译阶段把翻译单元翻译成汇编代码，并进行语法语义检查与优化；汇编阶段把汇编代码转换为机器指令组成的目标文件；链接阶段把多个目标文件与库文件合并，解析外部符号引用，最终生成可执行文件。gcc 提供了分阶段观察的手段：加上 -E 只做预处理并输出展开后的源文本，加上 -S 生成汇编，加上 -c 生成目标文件，直接调用则完成链接。所谓翻译单元，是指一个源文件连同它递归包含的所有头文件在预处理之后形成的完整文本，编译器正是以翻译单元为单位进行编译的。理解这一流程有助于定位错误来源：宏替换与头文件缺失属于预处理阶段的问题，类型不匹配与语法错误属于编译阶段的问题，而重复定义或者找不到符号则发生在链接阶段。

```c
#include <stdio.h>

#define SQUARE(x) ((x) * (x))

int main(void) {
    /* 预处理阶段：宏被替换、注释被删除、头文件被展开 */
    int value = 3;

    printf("当前源文件：%s\n", __FILE__);
    printf("SQUARE(%d) 展开后为 ((%d) * (%d)) = %d\n",
           value, value, value, SQUARE(value));
    printf("编译本行时所在行号约为 %d\n", __LINE__);
    return 0;
}
```

## #include 的两种形式与嵌套包含

#include 指令在预处理阶段把指定文件的内容原样插入当前位置，有两种书写形式，区别在于搜索路径。尖括号形式表示从系统标准包含目录开始搜索，适用于标准库头文件与已安装的第三方库；双引号形式先在当前源文件所在目录查找，找不到再到系统目录搜索，因此适合项目自带头文件。头文件可以嵌套包含，被包含的头文件又包含其他头文件，形成包含树，预处理后展开为一个翻译单元。如果缺乏保护，同一个头文件被重复包含会导致重复定义错误，因此编写头文件时几乎总要加上包含保护。此外，包含是纯文本替换，如果把函数实现写在头文件中并在多处包含，会造成符号重复定义，链接阶段报错。搜索路径还可以用编译选项追加目录来调整，因此遇到找不到头文件的报错时，应先确认目标文件究竟位于源文件所在的当前目录，还是位于系统标准的包含目录中。

```c
#include <stdio.h>     /* 系统头文件：从标准包含目录搜索 */
#include <string.h>    /* 双引号形式则先搜索源文件所在目录 */

int main(void) {
    char buf[32] = "include demo";
    size_t len = strlen(buf);

    printf("字符串：%s，长度：%zu\n", buf, len);
    printf("本工程自带头文件应写作双引号形式，"
           "如 #include \"myheader.h\"，会先在当前目录查找\n");
    return 0;
}
```

## 对象宏、函数宏与宏展开的陷阱

#define 用于定义宏，分为对象宏与函数宏两类。对象宏本质是文本替换；函数宏带参数，例如求最大值的宏。宏展开是纯文本替换，不受类型与作用域约束，也没有函数调用开销，但不做类型检查，并且容易因为缺少括号而出错：如果写成 #define SQ(x) x*x，那么 SQ(a+b) 会展开成 a+b*a+b，运算顺序完全错误，因此每个参数与整个宏体都必须用括号包裹。函数宏还有更隐蔽的陷阱：实参若带副作用会被求值多次，例如在最大值宏中传入自增表达式，自增可能执行两遍。井号运算符把宏参数转换为字符串字面量，双井号运算符把两个记号拼接成一个记号。宏定义可用 #undef 取消，也可用 do { ... } while (0) 包装多语句宏，使其在 if 语句中像单条语句一样使用。由于宏在预处理阶段就被展开，调试器无法在宏内部设置断点，宏名也不会出现在符号表里，所以逻辑复杂、需要类型检查的场合，用内联函数代替函数宏往往更稳妥。

```c
#include <stdio.h>

#define SQ_BAD(x)  x * x              /* 危险写法 */
#define SQ_GOOD(x) ((x) * (x))        /* 正确写法：加足括号 */
#define MAX(a, b)  ((a) > (b) ? (a) : (b))
#define STR(x)     #x                 /* 井号：转成字符串 */
#define CAT(a, b)  a##b               /* 双井号：拼接记号 */
#define LOG(fmt, ...) printf("[日志] " fmt "\n", __VA_ARGS__)

int main(void) {
    int a = 2, b = 3;

    printf("SQ_BAD(a + b)  = %d  （期望 25，实际被当作 a + b*a + b）\n", SQ_BAD(a + b));
    printf("SQ_GOOD(a + b) = %d\n", SQ_GOOD(a + b));
    printf("MAX(a, b) = %d\n", MAX(a, b));
    printf("STR(a + b) 展开为字符串 %s\n", STR(a + b));

    int CAT(my, Var) = 66;            /* 拼接成标识符 myVar */
    printf("拼接后的变量 myVar = %d\n", myVar);
    LOG("数值为 %d", myVar);
#undef MAX                            /* 取消宏定义 */
    return 0;
}
```

## 条件编译、头文件保护与预定义宏

条件编译让同一份源代码按不同条件生成不同代码。#if 之后跟常量表达式，#elif、#else、#endif 构成分支结构，#ifdef 与 #ifndef 用于判断宏是否已经定义，常用来区分平台、调试版本与功能开关。被排除的分支在预处理阶段就被丢弃，编译器根本看不到它，因此未定义分支中的语法错误不会报错。头文件保护的经典写法是先用 #ifndef 判断宏未定义，进入文件内容后立即定义该宏，第二次包含时条件为假，内容被整体跳过；#pragma once 是更简洁的非标准写法，多数编译器支持，效果相同但依赖具体实现。预定义宏 __FILE__、__LINE__、__DATE__、__TIME__ 可打印文件名、行号、编译日期与时间，__func__ 是编译器提供的函数名标识符；配合 assert 断言十分有用，定义 NDEBUG 之后 assert 会被完全移除。条件编译与运行期的 if 语句有本质区别：前者在编译前就决定哪些代码参与编译，可以彻底排除不适用于当前平台的代码，而后者无论条件是否成立，代码都必须能够通过编译。

```c
#include <stdio.h>
#include <assert.h>

#define VERSION 2

#ifndef FEATURE_GUARD          /* 头文件保护的典型结构 */
#define FEATURE_GUARD
#endif

int main(void) {
    int x = 10;

#if VERSION >= 2
    printf("使用新版本实现，VERSION = %d\n", VERSION);
#elif VERSION == 1
    printf("使用旧版本实现\n");
#else
    printf("未知版本\n");
#endif

#ifdef NDEBUG
    printf("断言已关闭（NDEBUG 已定义）\n");
#else
    printf("断言已开启\n");
    assert(x > 0);
#endif

    printf("文件：%s，行号：%d\n", __FILE__, __LINE__);
    printf("编译日期：%s，编译时间：%s\n", __DATE__, __TIME__);
    printf("当前函数：%s\n", __func__);
    return 0;
}
```

## 文件与流：文本流、二进制流与 FILE 指针

文件是存储在外部介质上的数据集合，程序通过流与之交互。流是数据的逻辑通道，把文件抽象为有序的字节序列，从而屏蔽具体设备的差异。文本流由可读的字符行组成，行以换行符结束，读写时可能发生换行符转换；二进制流则是未经转换的字节序列，读写内容与文件内容逐字节一致，适合存放结构体、图像等数据。C 标准库用 FILE 结构类型表示一个流，程序持有的是指向它的 FILE * 文件指针，所有文件操作函数都以它为句柄。程序启动时会自动打开三个标准流：stdin 标准输入、stdout 标准输出、stderr 标准错误，其中 stderr 不带缓冲，便于错误信息及时显示；还可以用 freopen 重定向标准流，实现输入输出转向。需要区分文件与流：文件是磁盘上的实体，流是内存中带有缓冲区与位置指示器等状态的对象，同一个文件既可以对应多个流，也可以被同一个流以不同模式重新打开；缓冲区的作用是减少设备访问次数，写满或被显式刷新时内容才真正落盘。

```c
#include <stdio.h>

int main(void) {
    /* 三个标准流在程序启动时自动打开，可直接使用 */
    fprintf(stdout, "这是写入标准输出的普通信息\n");
    fprintf(stderr, "这是写入标准错误的告警信息\n");

    printf("stdin 句柄是否可用：%s\n", (stdin != NULL) ? "可用" : "不可用");
    printf("stdout 句柄是否可用：%s\n", (stdout != NULL) ? "可用" : "不可用");
    printf("stderr 句柄是否可用：%s\n", (stderr != NULL) ? "可用" : "不可用");

    /* stdout 有缓冲，换行一般会触发刷新 */
    fflush(stdout);
    return 0;
}
```

## fopen 的打开模式与 fclose

fopen 按指定模式打开文件并返回 FILE *，失败时返回空指针 NULL，因此每次打开都必须判断返回值，否则后续操作可能直接崩溃。常用模式有：只读模式要求文件必须存在；只写模式把文件截断为零长度，文件不存在则创建；追加模式在文件末尾写入，文件不存在则创建；读写模式要求文件必须存在；读写截断模式会清空原内容；读写追加模式可读也可在末尾追加。在模式字符串中再加字母 b 表示二进制模式，例如 rb、wb+。在 Windows 平台上文本模式会把换行符转换成回车换行，读写的字节数可能与预期不同，而二进制模式不做任何转换；因此处理结构体、数组等二进制数据时必须使用带 b 的模式。文件使用完毕后应调用 fclose 关闭，它会刷新缓冲区并释放资源，成功返回 0，失败返回 EOF。同一时刻让一个文件对应多个写流要格外小心，各流自带的缓冲区会互相覆盖内容；打开失败的原因很多，例如路径不存在、没有读写权限或者文件被其他程序独占，排查时应当输出具体的错误信息。

```c
#include <stdio.h>

int main(void) {
    const char *name = "cpro_mode_demo.txt";
    FILE *fp;

    fp = fopen(name, "w");            /* 只写模式：不存在则创建，存在则截断 */
    if (fp == NULL) {
        perror("以 w 模式打开文件失败");
        return 1;
    }
    fprintf(fp, "第一行内容\n");
    fprintf(fp, "第二行内容\n");
    if (fclose(fp) != 0) {            /* 关闭会刷新缓冲区 */
        perror("关闭文件失败");
        return 1;
    }
    printf("写入完成：%s\n", name);

    fp = fopen(name, "a");            /* 追加模式：在末尾继续写入 */
    if (fp == NULL) {
        perror("以 a 模式打开文件失败");
        return 1;
    }
    fprintf(fp, "追加的一行内容\n");
    fclose(fp);

    fp = fopen(name, "r");            /* 只读模式：文件必须存在 */
    if (fp == NULL) {
        perror("以 r 模式打开文件失败");
        return 1;
    }
    int ch;
    while ((ch = fgetc(fp)) != EOF) {
        putchar(ch);
    }
    fclose(fp);
    return 0;
}
```

## 字符级与行级读写：fgetc、fputc、fgets、fputs

字符级读写函数 fgetc 从流中读取一个字符并以 int 形式返回，到达文件末尾或者出错时返回 EOF；fputc 把字符写入流，成功时返回写入的字符，失败时返回 EOF。这两个函数的返回类型必须是 int 而不能是 char，因为需要能够表示 EOF 这个通常为负一的值。行级读写使用 fgets 与 fputs：fgets 最多读入缓冲区长度减一个字符，遇到换行符即停止并把换行符一并存入缓冲区，最后自动补上字符串结束符，读失败时返回 NULL。fgets 比已经废弃的 gets 安全得多，因为它限制了写入长度。使用时要判断返回值而不是直接使用缓冲区；fgets 会保留换行符，若不需要可用 strcspn 查找并删除。fputs 不会自动追加换行符，需要换行时必须在字符串中显式写出。对于超过缓冲区长度的一行，fgets 会分多次读完，此时行尾不一定带换行符，程序应根据是否读到换行符判断一行是否真正结束；同时要避免把指针的大小误当作数组大小传给长度参数。

```c
#include <stdio.h>
#include <string.h>

int main(void) {
    const char *name = "cpro_line_demo.txt";
    FILE *fp;
    char line[64];

    fp = fopen(name, "w");
    if (fp == NULL) {
        perror("打开文件失败");
        return 1;
    }
    fputs("hello file\n", fp);            /* 需换行则显式写 \n */
    fputc('C', fp);                       /* 字符级写入 */
    fputc('\n', fp);
    fclose(fp);

    fp = fopen(name, "r");
    if (fp == NULL) {
        perror("打开文件失败");
        return 1;
    }
    while (fgets(line, sizeof line, fp) != NULL) {   /* 以返回值作为循环条件 */
        line[strcspn(line, "\n")] = '\0';            /* 去掉行尾换行符 */
        printf("读到一行，长度 %zu：%s\n", strlen(line), line);
    }
    if (ferror(fp)) {
        printf("读取过程中发生错误\n");
    }
    fclose(fp);
    return 0;
}
```

## 格式化读写：fprintf 与 fscanf

格式化读写函数 fprintf 与 fscanf 的用法和 printf、scanf 几乎相同，区别只是多了一个 FILE * 流参数，并且可以作用于任意流，而 printf 与 scanf 固定使用标准输出与标准输入。fprintf 返回实际写入的字符数，出错时返回负值；fscanf 返回成功赋值的输入项个数，遇到输入结束返回 EOF，因此可以用返回值判断读取是否成功。fscanf 按格式串解析文本，对格式匹配要求严格，遇到不匹配的字符会停止转换并把它留在流中，容易造成死循环，处理不规范文本时通常先用 fgets 读入整行再用 sscanf 解析。向文件写入数据后，如果缓冲区尚未刷新，立即读取可能读不到刚写的内容，此时可以调用 fflush 刷新，或者先关闭再以读模式重新打开，也可以借助文件定位函数在读写模式之间切换。格式串中的宽度限制十分重要，读取字符串时若不加宽度限制，输入过长就会越过缓冲区边界，因此应显式限定最大宽度；fscanf 也不会自动清空行尾剩余字符，混用格式化读取与行级读取时要留意残留内容。

```c
#include <stdio.h>

int main(void) {
    const char *name = "cpro_fmt_demo.txt";
    FILE *fp;
    int id = 0, score = 0;
    char namebuf[32];
    int count;

    fp = fopen(name, "w");
    if (fp == NULL) {
        perror("打开文件失败");
        return 1;
    }
    fprintf(fp, "%d %s %d\n", 1001, "Wang", 88);
    fprintf(fp, "%d %s %d\n", 1002, "Li", 95);
    fclose(fp);                            /* 关闭后重新打开，确保内容落盘 */

    fp = fopen(name, "r");
    if (fp == NULL) {
        perror("打开文件失败");
        return 1;
    }
    while ((count = fscanf(fp, "%d %31s %d", &id, namebuf, &score)) == 3) {
        printf("学号 %d，姓名 %s，成绩 %d\n", id, namebuf, score);
    }
    printf("读取结束，最后一次 fscanf 返回值 = %d（EOF 表示输入结束）\n", count);
    fclose(fp);
    return 0;
}
```

## 二进制块读写：fread 与 fwrite

fread 与 fwrite 用于二进制块读写，二者都以项为单位搬运数据，总共读写项大小乘以项数个字节，返回实际成功读写的项数而不是字节数；如果返回值小于请求的项数，说明遇到文件末尾或者发生了错误，可以用文件末尾判断函数与错误判断函数加以区分。结构体数组的批量读写非常方便：直接把数组首地址、单个元素大小与元素个数传给 fwrite 即可一次写入全部记录，读取时用相同参数调用 fread，并以其返回值作为实际读到的记录数。需要特别注意，fwrite 写入的是内存中的原始字节，其中包含为了对齐而填充的字节，因此生成的文件与编译平台严格绑定，跨平台交换数据应由更规范的序列化格式完成。判断块读写是否真的出错不能只看返回值：若已经到达文件末尾，返回值不足属于正常结束；若尚未到达末尾而项数不足，才说明发生了读取错误。写入时同样应当检查返回值，否则可能得到内容不完整的文件。

```c
#include <stdio.h>

typedef struct {
    int id;
    char name[16];
    double score;
} Record;

int main(void) {
    const char *name = "cpro_bin_demo.dat";
    Record out[3] = {
        {1001, "Wang", 88.5},
        {1002, "Li", 95.0},
        {1003, "Zhao", 72.5}
    };
    Record in[3];
    FILE *fp;
    size_t n;

    fp = fopen(name, "wb");
    if (fp == NULL) {
        perror("以二进制写模式打开失败");
        return 1;
    }
    n = fwrite(out, sizeof(Record), 3, fp);      /* 返回写入的项数 */
    printf("计划写入 3 条，实际写入 %zu 条记录\n", n);
    fclose(fp);

    fp = fopen(name, "rb");
    if (fp == NULL) {
        perror("以二进制读模式打开失败");
        return 1;
    }
    n = fread(in, sizeof(Record), 3, fp);        /* 返回值是实际读到的项数 */
    printf("实际读到 %zu 条记录\n", n);
    for (size_t i = 0; i < n; i++) {
        printf("  学号 %d，姓名 %s，成绩 %.1f\n", in[i].id, in[i].name, in[i].score);
    }
    if (n < 3 && feof(fp)) {
        printf("文件中的数据少于预期条数\n");
    }
    fclose(fp);
    return 0;
}
```

## 文件定位、状态判断与常见错误

fseek 移动文件位置指针，第二个参数是偏移量，第三个参数是起始位置，可取文件开头、当前位置与文件末尾三者之一，成功返回零，失败返回非零。ftell 返回当前位置相对于文件开头的字节偏移，失败返回负一；rewind 把位置重置到文件开头并清除错误标志。配合 fseek 与 ftell 可以求出文件长度，也可以实现随机访问。文件末尾函数只在读操作已经尝试越过末尾之后才返回真，因此在读取之前用 while(!feof(fp)) 判断是错误的：最后一次读取失败之后循环体仍会执行一次，从而重复处理旧数据。正确做法是以读取函数的返回值作为循环条件，例如判断 fgets 是否返回 NULL，或者判断 fread 返回的项数是否大于零。常见错误还包括忘记 fclose 导致缓冲区数据丢失、文本模式与二进制模式混用、未判断 fopen 是否返回 NULL，以及写入之后未刷新或未重新定位就直接读取。养成检查每个函数返回值的习惯，是写出可靠文件操作代码的关键。

```c
#include <stdio.h>

int main(void) {
    const char *name = "cpro_seek_demo.txt";
    FILE *fp;
    long size;
    char buf[16];

    fp = fopen(name, "w+");                  /* 读写模式，可写也可定位读 */
    if (fp == NULL) {
        perror("打开文件失败");
        return 1;
    }
    fputs("ABCDEFGHIJ", fp);                 /* 写入 10 个字符，位置在末尾 */

    fflush(fp);                              /* 立即读取前必须刷新缓冲区 */
    if (fseek(fp, 0L, SEEK_END) != 0) {      /* 定位到文件末尾 */
        perror("fseek 失败");
        fclose(fp);
        return 1;
    }
    size = ftell(fp);                        /* 求文件长度 */
    printf("文件长度 = %ld 字节\n", size);

    rewind(fp);                              /* 回到文件开头 */
    printf("从头读取全部内容：");
    while (fgets(buf, sizeof buf, fp) != NULL) {
        fputs(buf, stdout);
    }
    putchar('\n');

    if (fseek(fp, 2L, SEEK_SET) != 0) {      /* 定位到偏移 2 */
        perror("fseek 失败");
        fclose(fp);
        return 1;
    }
    printf("偏移 2 处的一个字符是：%c\n", fgetc(fp));
    printf("当前位置 ftell = %ld\n", ftell(fp));

    rewind(fp);
    if (fseek(fp, 0L, SEEK_END) == 0 && fgetc(fp) == EOF) {
        printf("读到末尾后再判断 feof，结果为%s\n", feof(fp) ? "真" : "假");
    }

    fclose(fp);
    return 0;
}
```
