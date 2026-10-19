---
sourceKey: c-pro-io
title: C语言讲义·输入输出与格式控制
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 基础语法
language: zh-CN
sourceType: team_authored
documentKey: c-pro-io
---
# 输入输出与格式控制

## 标准输入输出的基本模型

C 语言本身没有输入输出语句，输入输出功能由标准库 <stdio.h> 提供，其核心思想是“流”：程序把数据写入标准输出流 stdout，从标准输入流 stdin 读取数据，把出错信息写入标准错误流 stderr。默认情况下 stdin 连接键盘，stdout 和 stderr 连接屏幕，借助重定向或者管道还能把它们连接到文件或者另一个程序。这三条流在程序启动时由系统自动打开，程序结束时自动关闭，因此不需要调用 fopen 和 fclose。stdout 通常是行缓冲的，只有遇到换行符或者缓冲区满时才真正输出，所以在打印不带换行的提示之后立即要求输入时，应当调用 fflush(stdout) 确保提示先显示出来。

```c
#include <stdio.h>

int main(void)
{
    int age = 0;
    double height = 0.0;

    printf("请输入年龄和身高（例如 20 1.75）：");
    fflush(stdout);                    /* 保证提示先于输入显示 */

    if (scanf("%d %lf", &age, &height) == 2) {
        printf("年龄 %d 岁，身高 %.2f 米\n", age, height);
    } else {
        fprintf(stderr, "输入格式不正确\n");   /* 错误信息写入 stderr */
        return 1;
    }
    return 0;
}
```

## printf 常用转换说明总览

printf 通过格式串中的转换说明决定输出的形式。常用的有：%d 与 %i 输出有符号十进制整数；%u 输出无符号十进制整数；%o 输出八进制；%x 与 %X 分别输出小写和大写的十六进制；%c 输出单个字符；%s 输出字符串；%f、%e、%g 分别以小数形式、指数形式以及自动选择的形式输出浮点数；%% 输出一个百分号本身。格式串中不属于转换说明的字符会原样输出，包括空格和标点符号。每一种转换说明都要求实参具有对应的类型，这是使用 printf 时最重要的一条纪律：类型不匹配时程序仍然能够编译通过，但运行结果往往是乱码甚至直接崩溃。

```c
#include <stdio.h>

int main(void)
{
    int d = -42;
    unsigned int u = 42u;
    char c = 'Z';
    const char *s = "C语言";
    double f = 3.14159;

    printf("%%d -> %d\n", d);
    printf("%%i -> %i\n", d);
    printf("%%u -> %u\n", u);
    printf("%%o -> %o\n", u);
    printf("%%x -> %x, %%X -> %X\n", u, u);
    printf("%%c -> %c\n", c);
    printf("%%s -> %s\n", s);
    printf("%%f -> %f\n", f);
    printf("%%e -> %e\n", f);
    printf("%%g -> %g\n", f);
    printf("%%%% -> %%\n");
    return 0;
}
```

## 长度修饰符与实参类型匹配

为了输出不同长度的整数，C 语言在转换说明中引入了长度修饰符。h 表示 short，hh 表示 char，l 表示 long，ll 表示 long long，z 表示 size_t，j 表示 intmax_t。例如 %hd 对应 short，%ld 对应 long，%lld 对应 long long，%lu 对应 unsigned long，%zu 对应 sizeof 的结果。对于浮点数，%lf 中的 l 在 printf 里其实不起作用，因为 float 会先被提升为 double，只有 L 才表示 long double，如 %Lf；而在 scanf 中 %lf 是必需的，因为那里需要区分 float 与 double 的地址。长度修饰符与实参类型必须严格对应，把 long long 用 %d 输出时只会读取低 32 位，在常见平台上得到错误结果，而且这类错误不会导致编译失败，只会让输出的数值莫名其妙。养成习惯：只要变量的类型不是 int 或者 double，就先确认它应当使用哪个修饰符，再动手写格式串；打开编译器的警告选项之后，这类不匹配大多能被自动检查出来。

```c
#include <stdio.h>

int main(void)
{
    short s = -1234;
    long l = 1234567890L;
    long long ll = 123456789012345LL;
    unsigned long ul = 4000000000UL;
    size_t sz = sizeof(double);
    long double ld = 2.5L;

    printf("short 用 %%hd        : %hd\n", s);
    printf("long 用 %%ld         : %ld\n", l);
    printf("long long 用 %%lld   : %lld\n", ll);
    printf("unsigned long 用 %%lu: %lu\n", ul);
    printf("size_t 用 %%zu       : %zu\n", sz);
    printf("long double 用 %%Lf  : %.4Lf\n", ld);
    return 0;
}
```

## 浮点格式与精度控制

浮点数的输出由格式说明中的精度和转换字符共同控制。%f 以定点小数形式输出，默认精度为 6 位小数，写成 %.2f 就保留两位；%e 以科学计数法输出，指数部分至少显示两位数字；%g 会根据数值的大小自动在 %f 与 %e 之间选择，并且去掉末尾多余的零，适合输出范围跨度比较大的数据。对 %g 而言，精度表示的是有效数字位数而不是小数位数。%f 与 %e 都会按照精度进行四舍五入，需要打印对齐的表格时把宽度和精度一起使用即可。还要留意 float 只有大约 7 位有效数字，即使指定 %.15f 也无法凭空得到更精确的结果，多出来的位数只是无意义的数字。

```c
#include <stdio.h>

int main(void)
{
    double value = 12345.6789;

    printf("默认 %%f   : %f\n", value);
    printf("%%.2f      : %.2f\n", value);
    printf("%%.0f      : %.0f\n", value);
    printf("%%e        : %e\n", value);
    printf("%%.3e      : %.3e\n", value);
    printf("%%g        : %g\n", value);
    printf("%%.4g      : %.4g\n", value);
    printf("大数 %%g    : %g\n", 1.0e8);
    printf("小数 %%g    : %g\n", 1.0e-8);
    printf("表格形式   : [%10.2f][%10.2f]\n", 3.14159, 12.5);
    return 0;
}
```

## printf 的格式标志

printf 格式说明的完整形式是 %[标志][宽度][.精度][长度修饰符]转换字符，其中标志部分可以组合使用，用来控制对齐方式和符号显示。减号 - 表示左对齐，默认是右对齐；加号 + 让正数前面也显示正号；空格标志在正数前面留一个空格，与加号同时出现时加号优先；井号 # 对八进制加上前缀 0、对十六进制加上前缀 0x，对浮点数则强制保留小数点；数字 0 表示用前导零填充空位，当它与左对齐标志同时出现时不起作用。合理使用这些标志可以让输出整齐美观，例如让表格中的数字右对齐、让十六进制常量带上 0x 前缀、让金额统一保留两位小数。

```c
#include <stdio.h>

int main(void)
{
    int num = 42;

    printf("[%d]\n", num);
    printf("[%5d] 右对齐\n", num);
    printf("[%-5d] 左对齐\n", num);
    printf("[%+d] [%+d] 显示正负号\n", num, -num);
    printf("[% d] [% d] 空格标志\n", num, -num);
    printf("[%05d] 前导零填充\n", num);
    printf("[%#o] [%#x] [%#X] 进制前缀\n", num, num, num);
    printf("[%8.3f] [%-8.3f] 浮点对齐\n", 3.14159, 3.14159);
    printf("[%+.1f] [%+.1f]\n", 3.14159, -3.14159);
    return 0;
}
```

## 字段宽度与精度的动态指定

当输出的宽度或者精度需要在运行时才能确定时，可以把星号写在格式串中宽度或者精度的位置，实际的数值由后面的 int 实参依次提供，这种写法称为动态宽度和动态精度。例如 printf("%*d", width, value) 会按照 width 指定的宽度右对齐输出 value；%.*f 中的星号对应精度；宽度和精度都需要动态指定时写成 %*.*f，并且按照宽度、精度、数值的顺序给出实参。这项技术非常适合把对齐宽度、小数位数做成参数或者配置项，从而让同一个打印函数适应不同的报表格式；使用时要注意星号对应的实参必须是 int 类型，参数顺序也不能颠倒。

```c
#include <stdio.h>

int main(void)
{
    int value = 7;
    double pi = 3.14159265358979;
    int width = 6;
    int precision = 3;
    int i = 0;

    printf("[%*d]\n", width, value);          /* 宽度由参数给出 */
    printf("[%-*d]\n", width, value);         /* 动态宽度加左对齐 */
    printf("[%.*f]\n", precision, pi);        /* 精度由参数给出 */
    printf("[%*.*f]\n", 12, 4, pi);           /* 宽度和精度都由参数给出 */

    for (i = 1; i <= 4; i++) {                /* 打印对齐的平方立方表 */
        printf("%*d | %-*d\n", width, i * i, width, i * i * i);
    }
    return 0;
}
```

## printf 的返回值与常见错误

printf 的返回值是实际输出的字符个数，如果发生输出错误则返回负值。利用返回值可以判断输出是否成功，也可以计算已经输出的长度。最常见的错误是格式符与实参类型不匹配：用 %f 输出 int，会按照浮点的规则去解释整数的位模式，得到毫无意义的结果；用 %d 输出 double 则可能只读到数据的一部分；用 %s 输出一个非字符串指针会直接导致程序崩溃。另一类错误是忘记转义百分号，想输出百分号本身必须写成 %%。现代编译器通常能够对格式串做检查，打开 -Wall 之后会给出警告，应当把这些警告当作错误认真处理，因为在不同的平台上它可能真的变成致命的运行时问题。

```c
#include <stdio.h>

int main(void)
{
    int count = printf("Hello, C!\n");
    printf("上一次 printf 输出的字符数 = %d\n", count);

    int a = 10;
    /* 错误示范：printf("%f\n", a); 类型不匹配，不要模仿 */

    printf("正确做法：先显式转换类型，%.1f\n", (double)a);

    const char *name = "Zhang San";
    printf("姓名：%s，字符数（不含结束标志）= %d\n",
           name, (int)(sizeof("Zhang San") - 1));

    long long total = 1234567890123LL;
    printf("用 %%lld 打印 long long：%lld\n", total);

    int n = printf("12345");       /* 输出 5 个字符 */
    printf("\n输出 12345 的返回值 = %d\n", n);
    return 0;
}
```

## scanf 的基本用法与取地址运算符

scanf 从标准输入按照格式串读取数据并存入变量，因此除了字符数组名之外，每个参数都必须传递变量的地址，也就是在变量名前面加上取地址运算符 &。原因是 C 语言采用值传递，只有把地址交给 scanf，它才能把读到的值写回调用者的变量；数组名本身代表首元素的地址，所以字符数组作为 %s 的参数时不需要再加 &。scanf 在开始数值转换之前会跳过空白字符，包括空格、制表符和换行符，读到不符合格式的内容时停止并返回。scanf 的返回值是成功赋值的项数，遇到输入结束返回宏 EOF，因此检查返回值是保证输入可靠的基本手段。

```c
#include <stdio.h>

int main(void)
{
    int age = 0;
    double weight = 0.0;
    char grade = '?';
    char name[32] = {0};
    int ret = 0;

    printf("请输入 姓名 年龄 体重 等级：");
    ret = scanf("%31s %d %lf %c", name, &age, &weight, &grade);

    if (ret == 4) {
        printf("姓名 = %s\n", name);          /* 数组名本身就是地址 */
        printf("年龄 = %d，体重 = %.1f，等级 = %c\n", age, weight, grade);
    } else {
        printf("成功读取 %d 项，输入项不足\n", ret);
        return 1;
    }
    return 0;
}
```

## scanf 格式串的细节写法

scanf 的格式串写法非常讲究。在转换说明中加入数字可以限定最大读取宽度，例如 %3d 最多读取三位数字，%10s 最多读取十个字符，这是防止字符数组溢出的重要手段。%*d 中的星号表示读取之后直接丢弃，不赋给任何变量，适合跳过输入中不需要的字段。%[^\n] 是扫描集写法，表示读取除换行符之外的所有字符，常用于读入包含空格的整行文本，但它不会跳过开头的空白字符，所以通常写成 " %[^\n]" 的形式并配合宽度限制。格式串中的普通字符必须与输入逐个匹配，而空白字符在 scanf 中表示跳过任意多个空白字符，这条规则与普通字符不同，容易造成理解上的偏差。

```c
#include <stdio.h>

int main(void)
{
    int year = 0;
    int month = 0;
    int day = 0;
    int first = 0;
    int third = 0;
    char line[64] = {0};

    printf("请按 2024-10-01 的格式输入日期：");
    if (scanf("%4d-%2d-%2d", &year, &month, &day) == 3) {
        printf("年 = %d，月 = %d，日 = %d\n", year, month, day);
    }

    printf("请输入三个整数，中间那个会被跳过：");
    if (scanf("%d%*d%d", &first, &third) == 2) {
        printf("读到 %d 和 %d，中间的数字已丢弃\n", first, third);
    }

    printf("请输入一行文字：");
    if (scanf(" %63[^\n]", line) == 1) {
        printf("你输入的是：%s\n", line);
    }
    return 0;
}
```

## scanf 的常见陷阱与返回值判断

使用 scanf 时要警惕几个经典陷阱。第一，%d 之后紧跟 %c 时，%c 会读到上一个数字后面的换行符，而不是用户真正输入的字符，解决办法是在 %c 前面加一个空格写成 " %c"。第二，如果输入内容与格式不匹配，例如要求整数却输入了字母，scanf 会立即返回 0 并把非法字符留在缓冲区里，如果循环中不处理就会反复读取同一个字符形成死循环，正确做法是检查返回值并清空本行剩余字符。第三，忘记检查返回值会让程序在输入失败的情况下继续使用未初始化的变量。第四，读取字符串时不限制宽度会造成缓冲区溢出，应当写成 %31s 这样的带宽度形式。

```c
#include <stdio.h>

int main(void)
{
    int value = 0;
    int ret = 0;
    int sum = 0;
    int count = 0;
    int ch = 0;

    printf("请输入若干整数，以字母 q 结束：");
    while ((ret = scanf("%d", &value)) == 1) {
        sum += value;
        count++;
    }

    if (ret == 0) {
        while ((ch = getchar()) != '\n' && ch != EOF) {
            /* 丢弃导致失败的非法字符，避免死循环 */
        }
        printf("遇到非数字输入，已跳过\n");
    } else if (ret == EOF) {
        printf("读到文件结束标志\n");
    }

    printf("共读入 %d 个数，和为 %d\n", count, sum);
    return 0;
}
```

## 输入缓冲区与残留字符的处理

输入缓冲区是 scanf 与 getchar 混用时问题的根源。scanf 按格式读取数据时，会把读到的不属于当前转换的字符留在缓冲区中，最典型的就是数字后面的换行符，它一直等待下一次读取。于是先用 scanf("%d") 读整数、再用 getchar 或者 scanf("%c") 读字符时，得到的往往是那个换行符而不是新输入的内容。常用的解决办法有三种：一是在格式串的 %c 前面加一个空格，让 scanf 先跳过空白字符；二是在两次读取之间用循环调用 getchar 直到读到换行符或者 EOF，把本行剩余内容清空；三是改用 fgets 整行读入，再用 sscanf 解析，这种方式最容易控制，也是工程中更推荐的输入方案。

```c
#include <stdio.h>

/* 清空当前行的剩余字符，直到换行符或者文件结束 */
void clear_input_line(void)
{
    int ch;
    while ((ch = getchar()) != '\n' && ch != EOF) {
        /* 逐个丢弃 */
    }
}

int main(void)
{
    int age = 0;
    char answer = '\0';

    printf("请输入年龄：");
    if (scanf("%d", &age) != 1) {
        clear_input_line();
        printf("输入无效\n");
        return 1;
    }
    clear_input_line();              /* 吸收数字后面的换行符 */

    printf("是否继续（y/n）：");
    if (scanf("%c", &answer) == 1) {
        printf("年龄 = %d，选择 = %c\n", age, answer);
    }

    printf("按任意字符结束：");
    getchar();                       /* 单个 getchar 吸收残留的换行符 */
    return 0;
}
```

## getchar 与 putchar 及其返回值

getchar 从标准输入读取一个字符，putchar 向标准输出写一个字符，它们是字符级输入输出的基础函数，常与循环配合完成逐字符处理。getchar 的返回值类型是 int 而不是 char，这一点非常重要：它需要能够返回 0 到 255 的字符编码，以及表示输入结束或者错误的宏 EOF（通常定义为 -1）。如果把返回值存入 char 变量，在 char 为有符号类型的平台上 EOF 会被截断，与字符 0xFF 无法区分，导致循环判断失效。putchar 的参数是 int，成功时返回写入的字符，失败时返回 EOF；由于它只处理一个字符，通常不需要关心缓冲刷新，适合与 getchar 配合实现过滤、统计和回显。

```c
#include <stdio.h>

int main(void)
{
    int ch = 0;              /* 必须用 int 保存，才能正确容纳 EOF */
    int letters = 0;
    int digits = 0;
    int others = 0;

    printf("请输入一行字符，按回车结束：\n");
    while ((ch = getchar()) != '\n' && ch != EOF) {
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
            letters++;
        } else if (ch >= '0' && ch <= '9') {
            digits++;
        } else {
            others++;
        }
        putchar(ch);          /* 原样回显 */
    }
    putchar('\n');

    printf("字母 %d 个，数字 %d 个，其他 %d 个\n", letters, digits, others);
    printf("EOF 的值为 %d\n", EOF);
    putchar('O');
    putchar('K');
    putchar('\n');
    return 0;
}
```

## gets、fgets 与 puts 的安全用法

读取字符串时最需要注意的是缓冲区安全。gets 函数完全不检查目标数组的长度，只要输入的行足够长就会覆盖相邻的内存，因此它极其危险，C11 标准已经把它从标准库中移除，任何情况下都不应该使用它。替代方案是 fgets，它的原型是 char *fgets(char *s, int n, FILE *stream)，最多读取 n-1 个字符，并在末尾自动补上字符串结束标志，从源头上避免了溢出。fgets 会把换行符也读进缓冲区，通常需要检查末尾字符并把它替换为结束标志。与之对应的 puts 会输出字符串并自动追加一个换行符，比 printf 更简洁。使用 fgets 之后如果发现缓冲区里没有换行符，说明本行还有剩余内容，应当把剩余字符读掉，以免影响后续输入。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char buffer[16] = {0};
    size_t len = 0;
    int ch = 0;

    printf("请输入一行文字（最多 15 个字符）：");
    if (fgets(buffer, (int)sizeof(buffer), stdin) == NULL) {
        printf("读取失败或者遇到文件结束\n");
        return 1;
    }

    len = strlen(buffer);
    if (len > 0 && buffer[len - 1] == '\n') {
        buffer[len - 1] = '\0';          /* 去掉行尾换行符 */
    } else {
        while ((ch = getchar()) != '\n' && ch != EOF) {
            /* 输入超长，丢掉本行剩余字符 */
        }
        printf("输入过长，已按缓冲区长度截断\n");
    }

    printf("处理结果：[%s]，长度 %zu\n", buffer, strlen(buffer));
    puts("puts 会自动追加一个换行符");
    return 0;
}
```

## 输入输出重定向与 EOF 判断

标准输入输出流都可以重定向，这在批处理测试和数据处理中非常实用。在命令行中，program < input.txt 让程序从文件读取数据，program > output.txt 把输出写入文件，program < in.txt > out.txt 同时完成两件事，而 2> err.txt 可以单独保存标准错误流的内容。重定向之后程序代码完全不用修改，仍然使用 scanf 和 printf 即可。判断输入是否结束依靠 EOF：在 Windows 控制台中按 Ctrl+Z 再按回车表示文件结束，在类 Unix 系统中按 Ctrl+D。读取函数返回 EOF 时才应该结束循环，同时可以用 ferror 检查是否真的发生了读取错误，用 feof 区分已经读完与出现错误这两种情况。

```c
#include <stdio.h>

int main(void)
{
    int ch = 0;
    long chars = 0;
    long lines = 0;
    long words = 0;
    int in_word = 0;

    printf("从键盘输入文本，Windows 下按 Ctrl+Z 再回车结束：\n");
    while ((ch = getchar()) != EOF) {
        chars++;
        if (ch == '\n') {
            lines++;
        }
        if (ch == ' ' || ch == '\t' || ch == '\n') {
            in_word = 0;
        } else if (in_word == 0) {
            in_word = 1;
            words++;
        }
    }

    printf("共 %ld 个字符，%ld 行，%ld 个单词\n", chars, lines, words);

    if (ferror(stdin)) {
        fprintf(stderr, "读取输入时发生错误\n");
        return 1;
    }
    if (feof(stdin)) {
        printf("输入流已经结束\n");
    }
    return 0;
}
```

## 综合示例：读入一行、逐字符处理与简易菜单

本节用一个综合示例把格式化输出、整行读入和菜单循环串联起来。程序先打印一个简易菜单，用 scanf 读取选项；由于 scanf 会把回车符留在缓冲区里，紧接着要调用清行函数把本行剩余字符读掉，这样后续用 fgets 读取整行时就不会读到空行。选择输入功能时使用 fgets 并去掉行尾换行符，得到完整的字符串；选择统计功能时逐个字符扫描字符串，统计其中元音字母的个数。整个循环用 for(;;) 配合 break 实现，输入非法选项时给出提示并重新显示菜单。这种“打印提示、读取、清理缓冲区、处理、再循环”的结构是控制台交互程序的通用骨架。

```c
#include <stdio.h>
#include <string.h>

static int count_vowels(const char *text)
{
    int count = 0;
    size_t i = 0;

    for (i = 0; text[i] != '\0'; i++) {
        char c = text[i];
        if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u' ||
            c == 'A' || c == 'E' || c == 'I' || c == 'O' || c == 'U') {
            count++;
        }
    }
    return count;
}

static void clear_line(void)
{
    int ch = 0;
    while ((ch = getchar()) != '\n' && ch != EOF) {
        /* 丢弃本行剩余字符 */
    }
}

int main(void)
{
    char line[128] = {0};
    int choice = 0;

    for (;;) {
        printf("\n=== 简易菜单 ===\n");
        printf("1. 输入一行英文\n");
        printf("2. 统计元音字母个数\n");
        printf("0. 退出\n");
        printf("请选择：");

        if (scanf("%d", &choice) != 1) {
            clear_line();
            printf("请输入数字选项\n");
            continue;
        }
        clear_line();                     /* 读掉选项后面的回车 */

        if (choice == 0) {
            printf("程序结束\n");
            break;
        } else if (choice == 1) {
            printf("请输入一行英文：");
            if (fgets(line, (int)sizeof(line), stdin) != NULL) {
                size_t len = strlen(line);
                if (len > 0 && line[len - 1] == '\n') {
                    line[len - 1] = '\0';
                }
                printf("已保存：%s\n", line);
            }
        } else if (choice == 2) {
            printf("元音字母个数：%d\n", count_vowels(line));
        } else {
            printf("无效选项，请重新选择\n");
        }
    }
    return 0;
}
```
