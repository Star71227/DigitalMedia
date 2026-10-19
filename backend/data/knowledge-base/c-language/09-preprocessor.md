---
sourceKey: c-team-preprocessor
title: C 语言讲义：预处理与头文件
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 预处理
language: zh-CN
sourceType: team_authored
---
# 预处理与头文件
## 预处理指令
以 # 开头的指令在编译前由预处理器处理。#include 包含文件，#define 定义宏，#ifdef/#ifndef/#endif 条件编译。
## 文件包含
#include <stdio.h> 从系统目录搜索，适用于标准库头文件；#include "my.h" 先在当前目录搜索再找系统目录，适用于自定义头文件。
## 宏定义
#define 名字 替换文本 定义对象宏，#define F(x) 表达式 定义函数式宏。宏是纯文本替换，没有类型检查，注意参数求值与运算符优先级问题。
## 宏的注意事项
宏参数应加括号防止优先级错误，如 #define SQR(x) ((x)*(x))。函数式宏中带副作用的参数（如 i++）可能被求值多次。
## 条件编译
#ifdef/#ifndef 判断宏是否定义，#if 判断常量表达式，用于头文件防重复包含、平台差异代码与调试开关。
## 头文件保护
头文件用 #ifndef 宏名 / #define 宏名 / ... / #endif 防止被重复包含，或用 #pragma once。这避免类型重复定义。
## 典型问题
分析宏展开后的结果，注意参数括号与多次求值；理解预处理发生在编译之前，宏替换是文本层面操作；判断头文件保护的作用。
