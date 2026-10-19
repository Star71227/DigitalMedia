---
sourceKey: c-pro-control
title: C语言讲义·控制结构与循环
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 控制结构
language: zh-CN
sourceType: team_authored
documentKey: c-pro-control
---

# 控制结构与循环

## 语句与代码块
C 语言中语句是程序执行的最小单位，常见形式包括表达式语句、复合语句、选择语句、循环语句和跳转语句。任何表达式后面加一个分号就构成表达式语句，例如 `total = total + 1;`；而单独一个分号就是空语句，表示什么也不做。用一对花括号把若干条语句括起来便构成复合语句，也叫代码块，它在语法上等价于一条语句，因此可以直接充当 if 或 while 的循环体。代码块同时引入一个新的作用域：在其中声明的变量只在该块内可见，出了块即失效，这既避免了名字冲突，也让变量的生存期一目了然。需要特别注意的是，C 语言靠花括号与分号划分程序结构，缩进只影响可读性而不改变语义，写代码时应保持一致的缩进风格，并习惯用花括号把分支体和循环体明确括起来，从而为后续修改留出安全余量。

```c
#include <stdio.h>

int main(void)
{
    int total = 0;              /* 外层变量：整个 main 内都可见 */

    {   /* 复合语句：一个代码块 */
        int step = 10;          /* 块内变量：只在本块内有效 */
        total += step;
        printf("块内 total = %d\n", total);
    }

    /* 若取消下一行的注释，会因为 step 已超出作用域而编译失败 */
    /* printf("块外访问 step = %d\n", step); */

    if (total > 0) {            /* 单条语句也写成代码块，层次更清楚 */
        total = total * 2;
    }

    ;                           /* 空语句：什么也不做 */
    printf("最终 total = %d\n", total);
    return 0;
}
```

## 真与假：非 0 即为真
C 语言在 C99 之前没有内建的布尔类型，条件判断的规则十分简明：表达式的值为 0 表示假，任何非 0 的值都表示真。关系运算符和逻辑运算符的结果是 int 类型的 1 或 0，可以像普通整数一样参与运算与输出。因此 `if (flag == 1)` 这种写法并不严谨，只要 flag 非 0 条件就成立，规范写法是直接写 `if (flag)`；判断指针或字符是否有效时同样应写成 `if (p)` 或 `if (!p)`。需要提醒的是，浮点数受二进制表示舍入误差的影响，一般不与 0 直接用相等号比较，而应判断其绝对值是否小于某个足够小的量。C99 起标准头文件 stdbool.h 提供了 bool、true、false，它们本质上仍是整数。

```c
#include <stdio.h>
#include <stdbool.h>

int main(void)
{
    int zero = 0, positive = 7, negative = -3;
    double tiny = 1e-12;
    bool ready = true;

    printf("(zero != 0) 的值是 %d\n", zero != 0);
    printf("表达式 positive > 0 的值是 %d\n", positive > 0);
    printf("字符常量 'a' 的值是 %d，作为条件时视为%s\n", 'a', 'a' ? "真" : "假");

    if (positive) {
        printf("positive 非 0，条件成立\n");
    }
    if (negative) {
        printf("negative 非 0，负数同样为真\n");
    }
    if (!zero) {
        printf("zero 为 0，取反之后条件成立\n");
    }
    if (ready) {
        printf("bool 变量 ready 为真\n");
    }

    /* 浮点数不要用相等号与 0 比较，应判断差是否足够小 */
    if (tiny > -1e-9 && tiny < 1e-9) {
        printf("tiny 被判定为近似等于 0\n");
    }
    return 0;
}
```

## 关系表达式与逻辑表达式作为条件
关系运算符共有六个：小于、小于等于、大于、大于等于、等于和不等，其中表示相等的符号由两个等号组成。它们的优先级低于算术运算符，结合性为从左向右，运算结果是 1 或 0。逻辑运算符有逻辑与、逻辑或和逻辑非三个，逻辑非是一元运算符且优先级较高，逻辑与、逻辑或的优先级低于关系运算符。逻辑与和逻辑或支持短路求值：逻辑与的左侧为假时右侧不再计算，逻辑或的左侧为真时右侧不再计算，这一特性既能提高效率，也是编写安全代码的基础，例如先判断下标是否合法再访问数组元素就不会越界。编程中一个高频错误是把判断相等写成赋值，`if (x = 1)` 会让条件恒为真，编译器在开启警告时一般会提示，应养成认真查看警告的习惯。

```c
#include <stdio.h>

int main(void)
{
    int score = 78;
    int age = 20;
    int has_ticket = 0;

    /* 区间判断：两个关系表达式用逻辑与连接 */
    if (score >= 60 && score < 80) {
        printf("成绩位于 [60, 80) 区间\n");
    }

    /* 短路求值：左侧成立时右侧不再计算 */
    if (age < 18 || has_ticket) {
        printf("可以入场\n");
    } else {
        printf("年龄不足且没有票，不能入场\n");
    }

    int pass = (score >= 60) && (age > 0);
    printf("综合判断 pass = %d\n", pass);
    printf("!(score < 60) = %d\n", !(score < 60));

    /* 短路求值避免越界：先判断下标范围，再取数组元素 */
    int data[5] = {10, 20, 30, 40, 50};
    int index = 7;
    if (index >= 0 && index < 5 && data[index] > 0) {
        printf("data[%d] = %d\n", index, data[index]);
    } else {
        printf("下标 %d 非法，已跳过访问\n", index);
    }
    return 0;
}
```

## if 语句与 if-else 语句
if 语句根据条件的真假决定是否执行某段代码，语法形式是关键字 if 后跟圆括号中的条件，再跟一条语句，条件必须写在圆括号里。当需要在真假两种情况下执行不同代码时使用 if-else 结构，两个分支必居其一。if 之后的语句既可以是单条语句，也可以是由花括号构成的复合语句；即便只有一条语句，也建议写上花括号，这样以后增添语句时不必担心归属出错。else 总是与它前面最近的尚未配对的 if 结合，书写时应通过花括号把配对关系表达清楚。判断条件应尽量对应完整的业务含义，避免在一行里堆叠过多运算，必要时先用有意义的变量保存中间结果，让分支逻辑一目了然，也便于日后调试与修改。

```c
#include <stdio.h>

int main(void)
{
    double bmi = 22.6;

    if (bmi < 18.5) {
        printf("体重偏轻，建议增加营养摄入\n");
    } else if (bmi < 24.0) {
        printf("体重正常，请保持规律运动\n");
    } else {
        printf("体重偏高，建议控制饮食并加强锻炼\n");
    }

    int temperature = 3;
    if (temperature <= 0) {
        printf("气温在冰点以下，注意道路结冰\n");
    } else {
        printf("气温在冰点以上，路面情况正常\n");
    }
    return 0;
}
```

## 悬空 else 问题
悬空 else 指的是源码中出现两个 if 却只有一个 else 时，程序员凭缩进以为 else 属于外层 if，而编译器按语法规则把它绑定到最近的未配对 if。这类错误不会产生编译错误，程序照样运行，只是分支走向与预期不同，属于典型的逻辑缺陷，往往在测试边界数据时才暴露。避免的办法很简单：无论分支体是一条语句还是多条语句，统一加上花括号，让配对关系由语法结构而不是缩进来决定。此外，把复杂条件拆成若干布尔变量、或者采用提前返回减少嵌套层数，也能显著降低此类问题的出现概率。阅读他人代码时切忌只看缩进就判断归属，必须逐层核对花括号的配对情况。

```c
#include <stdio.h>

int main(void)
{
    int x = 5;
    int y = 0;

    /* 有歧义的写法：else 实际绑定到内层 if
       gcc 开启 -Wall 时会给出 -Wdangling-else 警告，这正说明缩进不可信 */
    if (x > 0)
        if (y > 0)
            printf("x、y 都是正数\n");
        else
            printf("x 为正，但 y 不为正（else 属于内层 if）\n");

    /* 推荐写法：用花括号把层次写清楚 */
    if (x > 0) {
        if (y > 0) {
            printf("x、y 都是正数\n");
        }
    } else {
        printf("x 不为正\n");
    }
    return 0;
}
```

## else if 多分支链与条件顺序
当需要在多个互斥区间中选择一种处理方式时，可以把 if、else if、else 串成多分支链。这条链自上而下依次判断，一旦某个条件成立就执行对应分支并跳出整条链，因此条件的先后顺序直接影响结果：范围较窄、较特殊的条件必须放在前面，宽泛的兜底条件放在最后。如果把及格线判断写在优秀线判断之前，那么九十分以上的成绩也会被判为及格，这是初学者最常见的错误之一。多分支链适合判断区间、范围或任意表达式；当所有分支都是对同一个表达式取不同常量值做相等比较时，改用 switch 往往更清晰。最后不要忘记用 else 处理所有未列举的情况，让逻辑闭合。

```c
#include <stdio.h>

int main(void)
{
    int score = 92;
    char level;
    char *comment;

    /* 由高到低判断：区间窄的条件写在前面 */
    if (score >= 90) {
        level = 'A';
        comment = "优秀";
    } else if (score >= 80) {
        level = 'B';
        comment = "良好";
    } else if (score >= 70) {
        level = 'C';
        comment = "中等";
    } else if (score >= 60) {
        level = 'D';
        comment = "及格";
    } else {
        level = 'F';
        comment = "不及格";
    }

    printf("分数 %d 的等级是 %c（%s）\n", score, level, comment);
    return 0;
}
```

## switch 语句：case、break 与 default
switch 语句的语法是关键字 switch 后跟圆括号中的表达式，再跟一个由花括号包围的语句体，体内由若干 case 标号和一条可选的 default 标号组成。执行时先求出表达式的值，然后与各个 case 后的整型常量表达式逐一比较，相等就跳转到该标号处开始执行。case 标号只是入口标签，本身不会让流程停下，所以要依靠 break 语句结束整个 switch；缺少 break 时控制流会继续向下执行后续标号中的语句。default 分支在没有任何 case 匹配时执行，它出现的位置不影响匹配顺序，但习惯上放在最后，并且同样需要 break。switch 适合处理离散的枚举式取值，能让代码比等价的 if-else 链更整齐易读。

```c
#include <stdio.h>

int main(void)
{
    int day = 3;

    switch (day) {
    case 1:
        printf("星期一，开始新的一周\n");
        break;
    case 3:
        printf("星期三，一周已经过半\n");
        break;
    case 7:
        printf("星期日，注意休息\n");
        break;
    default:
        printf("无法识别的星期编号 %d\n", day);
        break;
    }
    return 0;
}
```

## switch 的穿透机制与故意使用
穿透是指某个 case 分支执行完后没有 break，控制流继续执行下一个 case 中的语句，直到遇到 break、return 或 switch 结束。多数情况下穿透是漏写 break 引起的缺陷，编译器不会把它当成错误，需要程序员自行检查。不过在若干取值需要执行同一段代码时，穿透可以被刻意用来共享代码：让多个 case 标号连续排列，只在最后一段代码之后写一个 break，即可把若干情况归并处理，例如按月份统计天数时把三十一天的月份并列在一起。为了让读者明白穿透是有意为之，应在穿透处加上注释说明。如果每种情况需要完全不同的处理，就不要勉强使用 switch，此时用 if-else 链反而更直接。

```c
#include <stdio.h>

int main(void)
{
    int month = 4;
    int year = 2024;
    int days;

    switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
        days = 31;              /* 若干取值共享同一段处理代码 */
        break;
    case 4:
    case 6:
    case 9:
    case 11:
        days = 30;
        break;
    case 2:
        /* 闰年规则：能被 4 整除且不能被 100 整除，或者能被 400 整除 */
        if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
            days = 29;
        } else {
            days = 28;
        }
        break;
    default:
        days = 0;
        printf("月份 %d 不合法\n", month);
        break;
    }

    if (days > 0) {
        printf("%d 年 %d 月有 %d 天\n", year, month, days);
    }
    return 0;
}
```

## switch 的可用类型与 if-else 链的取舍
switch 的控制表达式必须是整型类型，包括 char、short、int、long、long long 以及它们的无符号版本，还包括枚举类型；浮点类型、字符串和数组都不能作为 switch 的控制表达式。每个 case 后面必须是编译期可求值的整型常量表达式，不能写成变量。字符常量在 C 语言中本质上是整数，所以用 switch 处理单个字符的输入非常自然，例如实现简单的字符菜单。取舍的一般标准是：当判断依据是同一个表达式与若干离散常量做相等比较时优先使用 switch，可读性与跳转效率都更好；当判断依据是取值范围、多个不同表达式的组合或浮点比较时，必须使用 if-else 链。两种结构也可以嵌套，外层用 if 判断范围，内层用 switch 区分具体取值。

```c
#include <stdio.h>

enum color { COLOR_RED, COLOR_GREEN, COLOR_BLUE };

int main(void)
{
    char op = '*';
    enum color c = COLOR_GREEN;

    /* 用字符常量作 case 标号：等价于使用其整数值 */
    switch (op) {
    case '+':
        printf("执行加法运算\n");
        break;
    case '*':
        printf("执行乘法运算\n");
        break;
    default:
        printf("不支持的运算符 %c\n", op);
        break;
    }

    /* 枚举类型可以直接作为 switch 的控制表达式 */
    switch (c) {
    case COLOR_RED:
        printf("当前颜色是红色\n");
        break;
    case COLOR_GREEN:
        printf("当前颜色是绿色\n");
        break;
    case COLOR_BLUE:
        printf("当前颜色是蓝色\n");
        break;
    default:
        printf("未知颜色取值\n");
        break;
    }
    return 0;
}
```

## while 循环：入口判断、三要素与死循环
while 循环的语法是关键字 while 后跟圆括号中的条件，再跟循环体，属于入口判断型循环：每轮开始前先计算条件，条件为真才执行循环体，因此循环体可能一次都不执行。写循环时要抓住三个要素：循环变量的初值、控制循环继续与否的条件，以及每轮对循环变量的更新，三者缺一不可，漏掉更新语句就会造成死循环。为避免死循环，应保证循环体的执行能够改变条件中涉及的量，使其最终变为假。如果确实需要永真循环，习惯写法是 `while (1)`，并在循环体内用 break 在合适时机退出。循环体若是多条语句必须用花括号括起，否则只有紧跟其后的第一条语句属于循环，这类错误很难排查。

```c
#include <stdio.h>

int main(void)
{
    int i = 1;          /* 要素一：初值 */
    int sum = 0;

    while (i <= 100) {  /* 要素二：条件 */
        sum += i;
        i++;            /* 要素三：更新，缺少它就会死循环 */
    }
    printf("1 到 100 的和是 %d\n", sum);

    int n = 10;
    while (1) {         /* 永真循环，靠 break 退出 */
        if (n % 7 == 0) {
            printf("10 之后第一个 7 的倍数是 %d\n", n);
            break;
        }
        n++;
    }
    return 0;
}
```

## do-while 循环
do-while 循环把条件判断放在循环体之后，属于出口判断型循环：先无条件执行一次循环体，再判断条件，条件为真则重复，为假则结束。它的显著特点是循环体至少执行一次，非常适合先做一次动作再决定是否继续的场景，例如菜单程序先显示一次菜单、输入校验先读入一个值再检查是否合法、整数拆位至少处理最低位。书写上有两个语法要点必须牢记：do 之后结尾关键字 while 所在的行末尾必须写分号，而普通 while 循环的圆括号后面不写分号，否则会产生空循环体或语法错误。把读字符的表达式与空语句配合使用，常用于清空输入缓冲区，此时也要特别注意分号的位置与数量。

```c
#include <stdio.h>

int main(void)
{
    int n = 1204;
    int reversed = 0;
    int digits = 0;

    do {
        int digit = n % 10;                 /* 取最低位 */
        reversed = reversed * 10 + digit;   /* 逐位拼成逆序数 */
        digits++;
        n /= 10;                            /* 去掉最低位 */
    } while (n > 0);                        /* 注意这里必须写分号 */

    printf("逆序结果是 %d，共处理 %d 位\n", reversed, digits);

    /* 至少执行一次的另一种体现：即使用户输入不合法也要先读一次 */
    int password = 1234;
    int attempt = 9999;
    int times = 0;
    do {
        times++;
        printf("第 %d 次尝试，输入值为 %d\n", times, attempt);
        if (attempt == password) {
            break;
        }
        attempt = 1234;                     /* 模拟下一次输入正确 */
    } while (times < 3);

    printf("共尝试 %d 次，最终%s\n", times, attempt == password ? "通过" : "失败");
    return 0;
}
```

## for 循环：三个表达式、空缺写法与逗号表达式
for 循环把循环变量的初始化、条件判断和更新集中在一行内，语法是关键字 for 后跟圆括号中的三个表达式，再跟循环体。执行顺序固定为：先求表达式 1 且只求一次，然后判断表达式 2，为真则执行循环体，接着求表达式 3，再回到表达式 2 继续判断，直到条件为假。三个表达式都可以空缺，但两个分号必须保留，`for (;;)` 就是永真循环；表达式 1 空缺时应在循环之前完成初始化，表达式 3 空缺时必须在循环体内更新变量，否则会死循环。表达式 1 和表达式 3 还可以使用逗号表达式同时处理多个变量，逗号表达式的值等于最后一个子表达式的值，常用于双指针相向移动的场景。

```c
#include <stdio.h>

int main(void)
{
    int i;
    long long factorial = 1;

    for (i = 1; i <= 10; i++) {         /* 最常用的形态：初值、条件、更新齐全 */
        factorial *= i;
    }
    printf("10 的阶乘是 %lld\n", factorial);

    int count = 0;
    for (;;) {                          /* 三个表达式全部空缺：永真循环 */
        count++;
        if (count == 5) {
            break;
        }
    }
    printf("永真循环执行了 %d 轮后退出\n", count);

    int left, right, moves = 0;
    int data[6] = {1, 2, 3, 4, 5, 6};
    for (left = 0, right = 5; left < right; left++, right--) {  /* 逗号表达式 */
        int t = data[left];
        data[left] = data[right];
        data[right] = t;
        moves++;
    }
    printf("数组逆置后为：");
    for (i = 0; i < 6; i++) {
        printf("%d ", data[i]);
    }
    printf("（共交换 %d 次）\n", moves);
    return 0;
}
```

## break 与 continue 的区别及作用范围
break 和 continue 都能改变循环的正常流程，但语义完全不同：break 立即终止最内层的循环或 switch 语句，控制流跳到该结构之后的语句；continue 只结束本轮循环，跳过循环体内其后的语句，随即进入下一轮的条件判断。在 for 循环中执行 continue 会先执行表达式 3 再判断条件，这一点常被误解为直接回到条件判断。两者的作用范围都是最内层的循环或 switch：在嵌套循环中 break 只能跳出它所在的那一层，若想一次跳出多层，必须借助 goto 或设置标志变量逐层退出。此外，switch 内部的 break 只结束 switch，若 switch 又嵌套在循环之中，它并不结束循环，这是阅读代码时必须分清的关键点。

```c
#include <stdio.h>

int main(void)
{
    int i, j, sum = 0;

    /* continue：跳过本轮剩余语句，本轮不结束循环 */
    for (i = 1; i <= 10; i++) {
        if (i % 2 == 0) {
            continue;               /* 跳过偶数 */
        }
        sum += i;
    }
    printf("1 到 10 中奇数之和是 %d\n", sum);

    /* break：立即结束所在的那一层循环 */
    for (i = 1; i <= 3; i++) {
        for (j = 1; j <= 5; j++) {
            if (j == 4) {
                break;              /* 只跳出内层 j 循环，外层继续 */
            }
            printf("(%d,%d) ", i, j);
        }
        printf("第 %d 行结束\n", i);
    }

    /* switch 中的 break 只结束 switch，不结束外层循环 */
    for (i = 1; i <= 3; i++) {
        switch (i) {
        case 2:
            printf("遇到数值 2，结束 switch 分支\n");
            break;
        default:
            printf("处理数值 %d\n", i);
            break;
        }
        printf("循环体继续执行，i = %d\n", i);
    }
    return 0;
}
```

## goto 语句与标号
goto 语句把控制流无条件转移到同一函数内的某个标号处，标号由标识符后加冒号构成，只能出现在函数内部，不能跨函数跳转。结构化程序设计主张用顺序、选择和循环三种结构表达逻辑，goto 会破坏这种结构，使控制流图上出现交叉连线，因此不推荐在普通分支中随意使用。它最正当的用途是从多层嵌套循环中一次性跳出，从而免去标志变量和多余的判断；另一个常见用途是错误处理，在资源申请失败时统一跳转到函数末尾的清理代码处，把释放工作集中到一处，这在系统编程中相当普遍。使用 goto 时要保证它不跨过变量初始化而使用该变量，也应避免向后跳转形成难以分析的循环。

```c
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int i, j;
    int found = 0;
    int target_i = 0, target_j = 0;

    for (i = 1; i <= 9; i++) {
        for (j = 1; j <= 9; j++) {
            if (i * j == 12) {
                found = 1;
                target_i = i;
                target_j = j;
                goto search_done;   /* 一次跳出两层循环 */
            }
        }
    }

search_done:
    if (found) {
        printf("找到组合：%d 乘 %d 等于 12\n", target_i, target_j);
    } else {
        printf("没有找到满足条件的组合\n");
    }

    /* 错误处理场景：申请资源失败时统一跳转到清理代码 */
    int *buffer = (int *)malloc(8 * sizeof(int));
    if (buffer == NULL) {
        printf("内存申请失败，直接结束\n");
        goto cleanup;
    }
    for (i = 0; i < 8; i++) {
        buffer[i] = i * i;
    }
    printf("缓冲区内容：%d %d %d\n", buffer[0], buffer[1], buffer[7]);

cleanup:
    free(buffer);
    printf("清理工作已完成\n");
    return 0;
}
```

## 嵌套循环与执行次数分析
在一个循环的循环体内再写一个完整的循环，就构成嵌套循环。外层循环执行一轮，内层循环就要完整地执行一遍，因此若外层执行 m 次、内层每次执行 n 次，内层循环体的总执行次数为 m 乘以 n。分析嵌套循环时，先确定每一层的初值、终值和更新方式，再逐层计算次数，不要凭感觉估计。内外层的循环变量必须使用不同的名字，否则会相互干扰导致逻辑错误；同时要检查内层循环变量的初始化是否写在内层循环的表达式 1 中，如果把它放在外层循环之前而没有在每轮重新赋值，内层实际上只会执行一轮。嵌套层数越多效率越低，能够化为单层时应尽量化简。

```c
#include <stdio.h>

int main(void)
{
    int i, j;
    int inner_rounds = 0;

    /* 外层 4 轮，每轮内层次数等于当前 i，总次数为 1+2+3+4 = 10 */
    for (i = 1; i <= 4; i++) {
        for (j = 1; j <= i; j++) {
            inner_rounds++;
        }
        printf("外层第 %d 轮结束后，内层累计执行 %d 次\n", i, inner_rounds);
    }

    /* 外层 3 轮，每轮内层固定 5 次，总次数为 3*5 = 15 */
    int total = 0;
    for (i = 1; i <= 3; i++) {
        for (j = 1; j <= 5; j++) {
            total++;
        }
    }
    printf("固定上界的双层循环内层共执行 %d 次\n", total);

    /* 内层变量若忘记每轮重新初始化，就只会执行一轮 */
    int stuck = 0;
    int k = 1;
    for (i = 1; i <= 3; i++) {
        while (k <= 3) {        /* k 没有在内层重新赋值，第二轮起条件即为假 */
            stuck++;
            k++;
        }
    }
    printf("内层变量未重置时只执行了 %d 次\n", stuck);
    return 0;
}
```

## 素数判定与水仙花数
素数判定是循环与分支结合的经典题目。朴素做法是用 2 到 n 减 1 之间的每个整数去试除 n，只要有一个能整除就说明 n 不是素数；更快的做法是利用因子的对称性，只需试除到根号 n，因为若 n 存在大于根号 n 的因子，必定存在一个与它配对的小于根号 n 的因子。试除过程中一旦找到因子就可以立刻 break，这体现了提前结束循环对效率的贡献。若要找出某个区间内的全部素数，则需要嵌套循环：外层枚举区间中的每个数，内层对该数做试除，并注意内层循环变量的初值必须在每轮重新设置。水仙花数是另一个常见题型，指的是各位数字的立方和等于它本身的三位数，解题关键是用整除与取余运算把百位、十位和个位拆分出来。

```c
#include <stdio.h>
#include <math.h>

int main(void)
{
    int n = 97;
    int i;
    int is_prime = 1;

    if (n < 2) {
        is_prime = 0;
    } else {
        int limit = (int)sqrt((double)n);   /* 只需试除到根号 n */
        for (i = 2; i <= limit; i++) {
            if (n % i == 0) {
                is_prime = 0;               /* 找到因子，立即结束试除 */
                break;
            }
        }
    }
    printf("%d %s\n", n, is_prime ? "是素数" : "不是素数");

    /* 找出 2 到 50 之间的所有素数 */
    int count = 0;
    for (n = 2; n <= 50; n++) {
        int flag = 1;
        for (i = 2; i * i <= n; i++) {
            if (n % i == 0) {
                flag = 0;
                break;
            }
        }
        if (flag) {
            printf("%d ", n);
            count++;
        }
    }
    printf("\n2 到 50 之间共有 %d 个素数\n", count);
    return 0;
}
```

```c
#include <stdio.h>

int main(void)
{
    int n;

    printf("三位数中的水仙花数有：");
    for (n = 100; n <= 999; n++) {
        int hundreds = n / 100;             /* 百位 */
        int tens = n / 10 % 10;             /* 十位 */
        int units = n % 10;                 /* 个位 */
        int cube_sum = hundreds * hundreds * hundreds
                     + tens * tens * tens
                     + units * units * units;
        if (cube_sum == n) {
            printf("%d ", n);
        }
    }
    printf("\n");

    /* 用另一种方式验证：先分离各位再重组比较 */
    int value = 371;
    int h = value / 100;
    int t = value / 10 % 10;
    int u = value % 10;
    int rebuilt = h * 100 + t * 10 + u;
    printf("%d 分离后重组得到 %d，各位立方和为 %d\n",
           value, rebuilt, h * h * h + t * t * t + u * u * u);
    return 0;
}
```

## 九九乘法表与图形打印
九九乘法表是嵌套循环与输出格式控制的典型练习。通常用外层循环控制行数，内层循环控制每行的列数，并让内层的上界依赖外层的循环变量，从而形成三角形而不是矩形；打印时用带宽度修饰的格式说明符让各列对齐，例如用左对齐的两位宽度输出乘积，行末再输出换行符。图形打印的思路与乘法表完全一致：把图形看作按行排列的字符，先找出第 i 行中空格个数和星号个数与行号 i 的数学关系，再用两个并列的内层循环分别输出空格与星号。上三角打印完毕之后，把行号从大到小再打印一遍，上下拼接就构成菱形。这类题目的难点不在语法，而在于把几何形状归纳为关于行号的表达式。

```c
#include <stdio.h>

int main(void)
{
    int i, j;

    printf("九九乘法表：\n");
    for (i = 1; i <= 9; i++) {
        for (j = 1; j <= i; j++) {
            printf("%d*%d=%-2d ", j, i, i * j);   /* 左对齐两位，保证列整齐 */
        }
        printf("\n");
    }
    return 0;
}
```

```c
#include <stdio.h>

int main(void)
{
    int rows = 4;
    int i, j, k;

    /* 直角三角形 */
    printf("直角三角形：\n");
    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= i; j++) {
            printf("*");
        }
        printf("\n");
    }

    /* 金字塔：第 i 行有 rows-i 个空格和 2i-1 个星号 */
    printf("金字塔：\n");
    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= rows - i; j++) {
            printf(" ");
        }
        for (k = 1; k <= 2 * i - 1; k++) {
            printf("*");
        }
        printf("\n");
    }

    /* 菱形：上半部分正序，下半部分倒序 */
    printf("菱形：\n");
    for (i = 1; i <= rows; i++) {
        for (j = 1; j <= rows - i; j++) {
            printf(" ");
        }
        for (k = 1; k <= 2 * i - 1; k++) {
            printf("*");
        }
        printf("\n");
    }
    for (i = rows - 1; i >= 1; i--) {
        for (j = 1; j <= rows - i; j++) {
            printf(" ");
        }
        for (k = 1; k <= 2 * i - 1; k++) {
            printf("*");
        }
        printf("\n");
    }
    return 0;
}
```

## 数列求和与循环控制综合练习
数列求和考察的是循环变量的组织与数据类型的选择。计算 1 加 1/2 加 1/3 一直加到 1/n 时，累加器必须是 double 类型，且除法中至少有一个操作数是浮点数，如果写成两个整数相除就会执行整数除法，除第一项以外结果全为 0。交错级数需要额外维护一个符号变量，每项之后把符号取反，例如用莱布尼茨级数计算圆周率的近似值。循环还广泛用于统计与数论计算：设置计数器统计满足条件的元素个数；用辗转相除法在循环中反复求余数得到最大公约数，再据此求出最小公倍数。求最小公倍数时应先做除法再相乘，以免中间结果溢出。累加器模式有两个要点：变量必须在循环开始之前完成初始化，并且在每一轮循环中持续更新。

```c
#include <stdio.h>

int main(void)
{
    int i;
    int n = 10;
    double harmonic = 0.0;
    double pi_approx = 0.0;
    int sign = 1;

    for (i = 1; i <= n; i++) {
        harmonic += 1.0 / i;            /* 必须写成 1.0 才是浮点除法 */
    }
    printf("1 + 1/2 + 1/3 加到 1/%d 的结果是 %.6f\n", n, harmonic);

    for (i = 1; i <= 1000; i++) {       /* 莱布尼茨级数：1 - 1/3 + 1/5 - 1/7 交替 */
        pi_approx += (double)sign / (2 * i - 1);
        sign = -sign;                   /* 每项之后符号取反 */
    }
    printf("圆周率近似值（前 1000 项）为 %.6f\n", pi_approx * 4.0);

    int even_count = 0;
    int total = 0;
    for (i = 1; i <= 100; i++) {
        if (i % 2 == 0) {
            even_count++;
            total += i;
        }
    }
    printf("1 到 100 中共有 %d 个偶数，它们的和是 %d\n", even_count, total);
    return 0;
}
```

```c
#include <stdio.h>

int main(void)
{
    int a = 24, b = 36;
    int x = a, y = b;
    int t, gcd, lcm;
    int step = 0;

    while (y != 0) {                    /* 辗转相除法求最大公约数 */
        t = x % y;
        x = y;
        y = t;
        step++;
    }
    gcd = x;
    lcm = a / gcd * b;                  /* 先除后乘，避免中间结果溢出 */

    printf("计算共进行 %d 轮循环\n", step);
    printf("%d 与 %d 的最大公约数是 %d\n", a, b, gcd);
    printf("%d 与 %d 的最小公倍数是 %d\n", a, b, lcm);
    return 0;
}
```
