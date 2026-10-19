---
sourceKey: c-team-strings
title: C 语言讲义：字符串与字符数组
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 数组与字符串
language: zh-CN
sourceType: team_authored
---
# 字符串与字符数组
## 字符串的表示
C 语言没有独立的字符串类型，字符串是末尾带 '\0' 的字符数组。如 char s[] = "abc"; 实际占用 4 字节，多出的 '\0' 是结束标志。
## 字符数组与字符串
字符数组可存放字符序列，只有以 '\0' 结尾才可按字符串处理。逐个字符初始化时若不手动加 '\0'，字符串函数可能越界读取。
## 字符串输入输出
scanf 的 %s 遇空白停止，gets 可读一行但有缓冲区溢出风险（建议用 fgets）；printf 的 %s 输出直到 '\0'，puts 输出字符串并换行。
## 字符串处理函数
strlen 求长度（不含 '\0'）、strcpy 复制、strcat 连接、strcmp 比较（相等返回 0）。这些函数要求字符串以 '\0' 结尾，目标空间足够。
## 字符串与指针
字符串常量是只读的，char *p = "abc"; 指向常量区，修改 p[0] 未定义；char s[] = "abc"; 是可修改的字符数组。二者不可混淆。
## 典型问题
计算字符串长度与数组占用字节数的区别；判断 strcmp 的返回规则；分析 strcpy/strcat 的目标缓冲区是否足够、是否存在越界。
