---
sourceKey: c-pro-string
title: C语言讲义·字符串与字符串函数
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 数组与字符串
language: zh-CN
sourceType: team_authored
documentKey: c-pro-string
---
# 字符串与字符串函数

## 字符数组与字符串的关系
在 C 语言中没有独立的字符串类型，字符串本质上是以空字符 '\0' 结尾的一维字符数组。'\0' 的 ASCII 值为 0，它占用一个字节的存储空间，却不计入字符串的有效长度。所有标准字符串函数都依赖 '\0' 判断结尾位置，一旦缺少它，函数就会一路向后读取，造成越界访问和不可预期的输出。用字符串字面量初始化数组时，编译器会自动在末尾补上 '\0'；用字符列表逐个初始化时，结束符是否写入完全取决于程序员。下面的程序对比了两种初始化方式在内存中的实际差别，并说明了缺少结束符的数组为什么不能交给 %s 输出。

```c
#include <stdio.h>

int main(void)
{
    char s1[4] = {'a', 'b', 'c', '\0'};   /* 手工写出结束符 */
    char s2[4] = "abc";                   /* 编译器自动补结束符 */
    char not_string[3] = {'a', 'b', 'c'}; /* 只是普通字符数组 */

    printf("s1 占用 %zu 字节，内容：%s\n", sizeof(s1), s1);
    printf("s2 占用 %zu 字节，内容：%s\n", sizeof(s2), s2);
    printf("s1 与 s2 是同一字符串吗：%s\n",
           (s1[3] == '\0' && s2[3] == '\0') ? "是" : "否");
    /* not_string 缺少结束符，不能作为字符串整体输出，只能逐字符访问 */
    printf("not_string 的前三个字符是 %c %c %c\n",
           not_string[0], not_string[1], not_string[2]);
    return 0;
}
```

## 字符串的初始化方式与陷阱
字符串初始化有三类常见写法：`char a[] = "abc";` 让编译器按需要分配四个字节；`char b[10] = "abc";` 分配十个字节，前四个字节存字符和结束符，剩余六个字节全部填 0；`char c[] = {'a','b','c'};` 只得到普通字符数组，没有结束符，不能当作字符串使用。数组下标必须留出结束符的位置：写成 `char d[3] = "abc";` 虽然在 C11 中合法，但数组里没有 '\0'，任何字符串函数作用在它上面都属于越界访问。此外，把字符串字面量赋给字符数组是复制，而赋给字符指针只是让指针指向字面量，两者语义完全不同，后者在下一节展开说明。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char a[] = "abc";          /* 长度 4 */
    char b[10] = "abc";        /* 长度 10，尾部补零 */
    char c[] = {'a', 'b', 'c', '\0'};
    char d[4] = "abc";         /* 正确：留出结束符的位置 */

    printf("sizeof(a)=%zu strlen(a)=%zu\n", sizeof(a), strlen(a));
    printf("sizeof(b)=%zu strlen(b)=%zu\n", sizeof(b), strlen(b));
    printf("sizeof(c)=%zu strlen(c)=%zu\n", sizeof(c), strlen(c));
    printf("sizeof(d)=%zu strlen(d)=%zu\n", sizeof(d), strlen(d));
    printf("b 中第 4 到第 9 个字节全为 0：%s\n",
           (b[3] == 0 && b[9] == 0) ? "成立" : "不成立");
    return 0;
}
```

## 字符数组与字符指针的区别
字符数组 `char arr[] = "hello";` 在栈上开辟一块可写内存，并把字面量的内容复制进去，因此可以通过下标修改其中的字符。字符指针 `const char *p = "hello";` 只是保存了字面量常量的首地址，而字面量通常被放在只读数据段，试图通过指针改写它的内容会在运行时触发访问违规并导致程序崩溃。另一个区别是 sizeof 的结果：数组名得到整个数组的字节数，指针得到指针本身的大小，在 64 位平台上通常为 8。还有一个容易混淆的点是数组名虽然能退化为指向首元素的指针，但它本身不是指针，不能被赋值，也不能自增。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char arr[] = "hello";        /* 可修改的副本，位于栈上 */
    const char *ptr = "hello";   /* 指向只读的字面量 */
    char *walker = arr;

    arr[0] = 'H';                /* 合法：修改数组内容 */
    walker[4] = 'O';             /* 合法：walker 指向同一个数组 */
    printf("arr = %s\n", arr);
    printf("ptr = %s，长度 %zu\n", ptr, strlen(ptr));
    /* ptr[0] = 'H';  非法：字面量位于只读区，运行时会崩溃 */
    printf("sizeof(arr)=%zu（数组字节数） sizeof(ptr)=%zu（指针大小）\n",
           sizeof(arr), sizeof(ptr));
    return 0;
}
```

## 字符串输入：scanf 的局限
用 `scanf("%s", buf)` 读取字符串有两个明显缺陷。第一，%s 遇到空格、制表符或换行就停止读取，因此无法读入含空白的整行文本，剩余字符会留在输入缓冲区里影响后续输入。第二，%s 不检查目标数组的大小，输入过长就会把数据写到数组之外，造成缓冲区溢出，这是最典型的安全漏洞来源之一。数组名本身就代表地址，所以 scanf 的字符串参数不能加取地址符 &。在必须使用 scanf 的场合，应当在格式串中写出字段宽度，例如 `%8s` 表示最多读入八个字符，从而为结束符留出空间。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char name[9];   /* 最多存 8 个字符加一个结束符 */
    int age = 0;

    printf("请输入姓名和年龄（以空格分隔）：");
    /* %8s 限制宽度，避免写入越界 */
    if (scanf("%8s %d", name, &age) == 2) {
        printf("姓名：%s，年龄：%d\n", name, age);
        printf("数组容量 %zu 字节，其中有效字符 %zu 个\n",
               sizeof(name), strlen(name));
    } else {
        printf("输入格式不符合要求\n");
    }
    return 0;
}
```

## 字符串输入：fgets 的安全用法
fgets 的函数原型为 `char *fgets(char *s, int size, FILE *stream);`，它最多读入 size-1 个字符，并在末尾自动写入 '\0'，因此不会越界；遇到换行或文件结束就提前停止，换行符会被保存到数组中。它比 gets 安全得多，后者已经被 C11 标准移除，正文中必须强调禁止使用 gets。使用 fgets 要处理三种情况：正常读入并含换行、缓冲区不足导致本行未读完、以及直接返回 NULL 表示读取失败或到达文件尾。若缓冲区不足，应当把本行剩余字符读到换行符为止，否则残留字符会被下一次读取当作新的一行。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char line[16];

    printf("请输入一行文本：");
    if (fgets(line, sizeof(line), stdin) == NULL) {
        printf("读取失败或已到达输入结尾\n");
        return 0;
    }

    size_t len = strlen(line);
    if (len > 0 && line[len - 1] == '\n') {
        line[len - 1] = '\0';   /* 去掉行尾换行符 */
        len--;
        printf("已去掉换行符，长度为 %zu，内容：%s\n", len, line);
    } else {
        int ch;
        while ((ch = getchar()) != '\n' && ch != EOF) {
            /* 丢弃过长行的剩余字符 */
        }
        printf("输入超过缓冲区容量，已截断为：%s\n", line);
    }
    return 0;
}
```

## 字符串输出：printf、puts 与 fputs
三种输出方式各有用途。`printf("%s", s)` 支持与其他内容混合格式化，输出后不换行，需要自己写 '\n'；`puts(s)` 专门输出字符串，并在末尾自动追加一个换行符，代价是无法控制换行；`fputs(s, stdout)` 输出字符串但不追加换行，并且可以指定任意输出流，例如把错误信息写到 stderr。三者的共同点是都从指针处一直输出到 '\0' 为止。当字符串中可能存在结束符缺失的情况时，用 `printf("%.*s", n, s)` 限定输出长度可以避免读出越界内容。选择的经验是：需要与其他内容混合格式化时用 printf，整行输出时用 puts，需要指定输出流或精确控制换行时用 fputs。puts 在出错时返回 EOF，成功时返回非负值；printf 的 %s 参数必须是合法的以 '\0' 结尾的字符串，若传入空指针则行为未定义，主流实现会打印 (null)，但不能依赖这一现象。

```c
#include <stdio.h>

int main(void)
{
    const char text[] = "C 语言字符串输出";

    printf("[printf] %s", text);       /* 不自动换行 */
    printf("，句号在同一行\n");
    puts(text);                        /* 自动追加换行 */
    fputs(text, stdout);               /* 不追加换行 */
    fputs("\n", stdout);
    fputs("这行文字输出到标准错误流\n", stderr);
    /* 限定最多输出 4 个字符，用于防止越界读取 */
    printf("截断输出：[%.4s]\n", text);
    return 0;
}
```

## 字符串遍历：下标法与指针法
遍历字符串有两种等价写法。下标法用 `s[i]` 取字符，可读性好，适合需要位置信息的场景；指针法用 `*p` 取字符并让 p 自增，代码更紧凑，也更贴近底层实现。无论哪种写法，循环条件都必须是当前字符不等于 '\0'，而不能用数组长度作为边界，因为数组的实际容量与字符串的有效长度通常并不相等。指针遍历结束后可以得到首尾指针之差，用它直接计算长度。只读遍历时建议把形参声明为 `const char *`，让编译器帮忙阻止误写入。

```c
#include <stdio.h>

int main(void)
{
    const char s[] = "pointer";
    size_t i;

    printf("下标法：");
    for (i = 0; s[i] != '\0'; i++) {
        putchar(s[i]);
        putchar(' ');
    }
    putchar('\n');

    printf("指针法：");
    const char *p = s;
    while (*p != '\0') {
        putchar(*p);
        putchar(' ');
        p++;
    }
    putchar('\n');

    printf("指针差求长度：%d\n", (int)(p - s));
    return 0;
}
```

## 字符个数统计与大小写转换
统计字符串中的大写字母、小写字母、数字和其他字符是字符分类的经典练习。使用 ctype.h 提供的 isupper、islower、isdigit、isspace 等函数比手写区间判断更清晰，也更便于处理字符集差异。需要特别注意：这些函数的参数必须是可表示为 unsigned char 的值或者 EOF，若直接传入负值的 char 会形成未定义行为，因此要写成 `isspace((unsigned char)c)`。大小写转换用 tolower 与 toupper 完成，它们只改变字母，其他字符原样返回。转换结果通常写回另一个缓冲区，也可以原地修改可写的字符数组。

```c
#include <stdio.h>
#include <ctype.h>

int main(void)
{
    const char s[] = "Hello C World 2024";
    int upper = 0, lower = 0, digit = 0, space = 0, other = 0;
    int i;
    char out[sizeof s];

    for (i = 0; s[i] != '\0'; i++) {
        unsigned char c = (unsigned char)s[i];
        if (isupper(c)) {
            upper++;
        } else if (islower(c)) {
            lower++;
        } else if (isdigit(c)) {
            digit++;
        } else if (isspace(c)) {
            space++;
        } else {
            other++;
        }
        out[i] = (char)tolower(c);
    }
    out[i] = '\0';

    printf("大写 %d，小写 %d，数字 %d，空白 %d，其他 %d\n",
           upper, lower, digit, space, other);
    printf("原串：%s\n转小写：%s\n", s, out);
    return 0;
}
```

## strlen 的原理与 sizeof 的区别
strlen 从给定地址开始逐字节计数，直到遇到 '\0' 为止，因此它返回的是字符个数，不包括结束符，时间复杂度与字符串长度成正比。sizeof 是编译期运算符，得到类型或对象占用的字节数，对字符数组而言就是数组声明时确定的容量，与其中实际存放了多少字符无关。两者最容易出错的地方是：对指针使用 sizeof 只能得到指针本身的大小，无法得知它所指字符串的长度；对未以 '\0' 结尾的字符数组调用 strlen 会越界读取。下面的程序给出了三种典型对象的对比结果。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char a[20] = "hello";      /* 数组容量 20，有效长度 5 */
    const char *p = "hello";   /* 指针本身大小与字符串无关 */
    char b[] = {'h', 'i', '\0', 'X'};

    printf("strlen(a)=%zu  sizeof(a)=%zu\n", strlen(a), sizeof(a));
    printf("strlen(p)=%zu  sizeof(p)=%zu（指针大小）\n", strlen(p), sizeof(p));
    printf("strlen(b)=%zu  sizeof(b)=%zu\n", strlen(b), sizeof(b));
    printf("a 中下标 5 的字节是 %d，即结束符\n", a[5]);
    printf("b 中下标 3 的字符 %c 不计入长度\n", b[3]);
    return 0;
}
```

## 手写实现 strlen
手写 strlen 是理解字符串结束标志最好的练习。下标版用一个计数变量从 0 开始，只要当前位置不是 '\0' 就让计数器加一，最后返回计数值。指针版让游标指针不断后移直到遇到结束符，再返回游标与起始地址的差，这个差值类型为 ptrdiff_t，通常需要转换为 size_t。两个版本都不能修改原字符串，因此形参应写成 `const char *`。注意返回类型应当与标准库保持一致使用 size_t，返回 int 会在超长字符串时溢出。若传入空指针，两种实现都会崩溃，实际工程中应先判空。

```c
#include <stdio.h>
#include <stddef.h>

size_t my_strlen_index(const char *s)   /* 下标版 */
{
    size_t n = 0;
    while (s[n] != '\0') {
        n++;
    }
    return n;
}

size_t my_strlen_pointer(const char *s) /* 指针版 */
{
    const char *p = s;
    while (*p != '\0') {
        p++;
    }
    return (size_t)(p - s);
}

int main(void)
{
    const char *text = "handmade strlen";
    const char *empty = "";

    printf("下标版：%zu，指针版：%zu\n",
           my_strlen_index(text), my_strlen_pointer(text));
    printf("空串长度：%zu 与 %zu\n",
           my_strlen_index(empty), my_strlen_pointer(empty));
    return 0;
}
```

## strcpy 与 strncpy
`strcpy(dst, src)` 把 src 连同结束符一起复制到 dst，并返回 dst 的地址以便链式调用。它完全不检查 dst 的容量，只要源串更长就会溢出，因此在不清楚长度时必须改用 strncpy。`strncpy(dst, src, n)` 最多复制 n 个字节，但它有一个著名的陷阱：当源串长度大于等于 n 时，结果不会自动补 '\0'，所以调用后必须手工写 `dst[n-1] = '\0'`。手写 strcpy 只需一个循环：逐字节赋值，当赋进去的值是 '\0' 时停止，这样结束符也会被复制。还有两点要补充：strncpy 在源串较短时会把目标数组的剩余字节全部填成 '\0'，写入量可能远大于实际字符数，对很长的缓冲区要留意性能；strcpy 的两个参数不允许指向重叠的内存区域，重叠复制应当改用 memmove。判断一次复制是否安全的基本做法是比较 sizeof(dst) 与 strlen(src) + 1 的大小关系。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char src[] = "copy me";
    char dst[16];
    char limited[5];                         /* 容量不足，用于演示截断 */
    char manual[16];

    char *ret = strcpy(dst, src);            /* 返回目标地址 */
    printf("strcpy 结果：%s（返回值等于 dst：%s）\n",
           dst, ret == dst ? "是" : "否");

    strncpy(limited, src, sizeof(limited) - 1);
    limited[sizeof(limited) - 1] = '\0';     /* 手工补结束符 */
    printf("strncpy 遇到容量不足时截断为：%s\n", limited);

    size_t i = 0;                            /* 手写 strcpy */
    while ((manual[i] = src[i]) != '\0') {
        i++;
    }
    printf("手写实现结果：%s\n", manual);
    return 0;
}
```

## strcat 与 strncat
`strcat(dst, src)` 先找到 dst 的结尾，再把 src 的内容连同结束符追加到其后，返回 dst 的地址。使用它的前提是目标数组必须留有足够空间容纳拼接后的全部字符，否则同样会溢出；而且两个参数都必须是合法的以 '\0' 结尾的字符串，不能把未初始化的数组当作目标。`strncat(dst, src, n)` 最多追加 n 个字符，并且总会在末尾补上结束符，比 strcat 安全，但如果 n 超过剩余空间仍会溢出。手写 strcat 分两步：先用循环定位到目标串的结束符处，再从该位置开始逐字节复制源串。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char buf[32] = "Hello";
    char manual[32] = "Hello";
    const char *tail = " C";
    size_t i, j;

    strcat(buf, ", world");
    printf("strcat 后：%s（长度 %zu）\n", buf, strlen(buf));

    strncat(buf, "!!!!!!!!!!!!!", 3);   /* 只追加 3 个字符 */
    printf("strncat 后：%s\n", buf);

    i = strlen(manual);                 /* 手写 strcat：先定位结尾 */
    j = 0;
    while ((manual[i + j] = tail[j]) != '\0') {
        j++;
    }
    printf("手写实现后：%s\n", manual);
    return 0;
}
```

## strcmp 与 strncmp
strcmp 按字典序逐字符比较两个字符串，返回值的符号才有意义：等于 0 表示内容完全相同，小于 0 表示前者在字典序中靠前，大于 0 表示靠后。具体数值是实现相关的，因此判断相等必须写成 `strcmp(a, b) == 0`，不要写成 `strcmp(a, b)`。字符串不能用 == 直接比较，因为数组名会退化为指针，== 比较的是两个地址是否相同，而不是内容是否相同。strncmp 只比较前 n 个字符，适合比较前缀或避免读取过长的字符串。还有一个细节值得注意：比较依据是字符的编码值，对中文这类多字节字符而言并不等同于拼音顺序，实际参与比较的是字节序列，因此含中文的排序结果需要按具体编码来理解。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char a[] = "apple";
    char b[] = "apple";
    char c[] = "banana";
    const char *pa = a;
    const char *pb = b;

    printf("strcmp(a, b) = %d，表示相等\n", strcmp(a, b));
    printf("strcmp(a, c) 的符号：%s\n",
           strcmp(a, c) < 0 ? "负数，a 在前" : "正数，a 在后");
    printf("strncmp(\"apple\", \"apricot\", 2) = %d，前两个字符相同\n",
           strncmp("apple", "apricot", 2));
    printf("pa == pb 比较的是地址：%s\n",
           pa == pb ? "同一个地址" : "两个不同数组的地址");
    printf("内容是否相等要用 strcmp：%s\n",
           strcmp(pa, pb) == 0 ? "相等" : "不等");
    return 0;
}
```

## strchr、strrchr 与 strstr
strchr 在字符串中查找某个字符第一次出现的位置，strrchr 查找最后一次出现的位置，strstr 查找子串第一次出现的位置，三者的返回值都是指针。找到时返回指向匹配位置的指针，找不到时返回空指针 NULL，所以使用返回值前必须先与 NULL 比较，直接解引用可能崩溃。用返回指针减去起始指针即可得到下标。需要注意 strstr 的匹配是区分大小写的，若需要不区分大小写要先自行转换；若要查找的字符是 '\0'，strchr 会返回指向字符串结束符的指针，这也是一种合法的返回值。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    const char *text = "programming in C";
    const char *first = strchr(text, 'g');
    const char *last = strrchr(text, 'g');
    const char *sub = strstr(text, "ing");

    if (first != NULL) {
        printf("第一个 g 在下标 %d 处\n", (int)(first - text));
    }
    if (last != NULL) {
        printf("最后一个 g 在下标 %d 处\n", (int)(last - text));
    }
    if (sub != NULL) {
        printf("子串 ing 从下标 %d 开始，其后内容为：%s\n",
               (int)(sub - text), sub);
    }
    if (strchr(text, 'z') == NULL) {
        printf("字符 z 没有出现，返回值为空指针\n");
    }
    return 0;
}
```

## strtok 字符串切分
strtok 按分隔符集合把字符串切成若干片段。第一次调用把待切分的字符串作为第一个参数传入，函数会把找到的分隔符改写为 '\0' 并返回当前片段的地址，同时把内部状态记在静态变量里；后续调用第一个参数传 NULL，函数就从上次结束的位置继续切分，直到返回 NULL 表示没有更多片段。因此有两处必须注意：strtok 会修改原字符串，只能作用于可写的字符数组，不能作用于字面量；内部状态使用静态存储，不是线程安全的，多线程环境应改用 strtok_r，它把状态保存在用户提供的指针里。

```c
#include <stdio.h>
#include <string.h>

int main(void)
{
    char text[] = "C,is;a powerful,language";   /* 必须是可写数组 */
    const char *delim = ",; ";
    int count = 0;

    char *token = strtok(text, delim);          /* 首次传入原串 */
    while (token != NULL) {
        count++;
        printf("第 %d 个片段：%s\n", count, token);
        token = strtok(NULL, delim);            /* 之后传空指针 */
    }
    printf("共切分出 %d 个片段\n", count);

    char other[] = "a:b:c";
    char *save = NULL;                          /* strtok_r 的状态变量 */
    char *piece = strtok_r(other, ":", &save);
    while (piece != NULL) {
        printf("安全版本片段：%s\n", piece);
        piece = strtok_r(NULL, ":", &save);
    }
    return 0;
}
```

## 字符串与数值的相互转换
标准库提供了多组转换函数。atoi 与 atof 使用简单，但无法报错：遇到非法字符返回 0，溢出时行为未定义，所以适合输入可信的场景。更稳妥的做法是 strtol 与 strtod，它们通过第二个参数回传第一个未能解析的字符位置，配合 errno 可以区分“真的是 0”和“解析失败”。向字符串方向的转换常用 sprintf，把多个值格式化写入缓冲区，注意缓冲区要足够大，或者改用有长度限制的 snprintf。sscanf 则从一个字符串中按格式提取多个字段，常见于解析日期、坐标这类结构化文本。

```c
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>

int main(void)
{
    char buf[64];
    char month[16] = {0};
    int year = 0, day = 0;
    char *end = NULL;
    long value;

    printf("atoi(\"123abc\") = %d\n", atoi("123abc"));
    printf("atof(\"3.14xyz\") = %.2f\n", atof("3.14xyz"));

    int fields = sscanf("2024-05-01", "%d-%15[^-]-%d", &year, month, &day);
    printf("sscanf 解析出 %d 个字段：%d 年 %s 月 %d 日\n",
           fields, year, month, day);

    snprintf(buf, sizeof(buf), "year=%d, day=%d", year, day);
    printf("格式化结果：%s\n", buf);

    errno = 0;
    value = strtol("  -42rest", &end, 10);
    if (errno == 0 && end != NULL && *end != '\0') {
        printf("strtol 得到 %ld，剩余未解析部分为 \"%s\"\n", value, end);
    }
    return 0;
}
```

## 常见错误与综合示例
字符串相关的错误集中在四类：一是数组容量不足导致写入越界，例如把长度为 10 的字符串复制进 5 字节的数组；二是通过指针修改字符串字面量，它位于只读区，写入会立即崩溃；三是忘记写结束符，导致后续所有字符串函数越界读取，输出乱码；四是使用未初始化或已经失效的指针，例如声明了 `char *p;` 就直接传入 fgets。规避的手段是明确容量、使用带长度限制的函数、始终让字符串以 '\0' 结尾，并对所有指针先判空再使用。下面的综合示例实现了统计单词个数与判断回文，全部采用只读形参和边界检查。

```c
#include <stdio.h>
#include <string.h>
#include <ctype.h>

/* 以空白字符为分隔统计单词个数 */
int count_words(const char *s)
{
    int count = 0;
    int in_word = 0;

    for (; *s != '\0'; s++) {
        if (isspace((unsigned char)*s)) {
            in_word = 0;
        } else if (!in_word) {
            in_word = 1;
            count++;
        }
    }
    return count;
}

/* 不计大小写与非字母数字字符，判断是否回文 */
int is_palindrome(const char *s)
{
    const char *left = s;
    const char *right = s + strlen(s);

    if (left == right) {
        return 1;                      /* 空串视为回文 */
    }
    right--;                           /* 指向最后一个有效字符 */
    while (left < right) {
        while (left < right && !isalnum((unsigned char)*left)) {
            left++;
        }
        while (left < right && !isalnum((unsigned char)*right)) {
            right--;
        }
        if (tolower((unsigned char)*left) != tolower((unsigned char)*right)) {
            return 0;
        }
        left++;
        right--;
    }
    return 1;
}

int main(void)
{
    const char *sentence = "  C   language is   powerful  ";
    const char *samples[] = {"level", "Hello", "A man, a plan, a canal: Panama"};
    size_t i;

    printf("单词个数：%d\n", count_words(sentence));
    for (i = 0; i < sizeof(samples) / sizeof(samples[0]); i++) {
        printf("\"%s\" 是否回文：%s\n",
               samples[i], is_palindrome(samples[i]) ? "是" : "否");
    }
    return 0;
}
```
