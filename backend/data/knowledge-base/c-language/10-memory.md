---
sourceKey: c-team-memory
title: C 语言讲义：动态内存管理
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 指针
language: zh-CN
sourceType: team_authored
---
# 动态内存管理
## 栈与堆
自动变量分配在栈上，随作用域自动释放；动态内存从堆上申请，生命周期由程序员控制，需要显式释放。堆内存管理不当会泄漏或崩溃。
## malloc
malloc(n) 申请 n 字节连续内存，返回首地址的 void* 指针，需强制转换为目标类型。失败返回 NULL，使用前应检查。
## free
free(p) 释放 malloc 等申请的内存，之后指针成为悬空指针，应置 NULL。对同一指针重复 free、free 非动态内存都是未定义行为。
## calloc 与 realloc
calloc(n, size) 申请 n 个大小为 size 的块并清零；realloc(p, n) 调整已分配内存大小，可能原地扩展或移动到新地址。
## 内存泄漏
申请后未释放导致内存持续占用，程序长时间运行耗尽内存。每条 malloc 都应有对应的 free，可借助工具（如 Valgrind）检测。
## 悬空指针与野指针
指向已释放内存的指针是悬空指针；未初始化或指向非法地址的是野指针。二者解引用都会导致未定义行为，free 后及时置 NULL。
## 典型问题
判断 malloc 返回值类型、是否需要 sizeof；分析释放后指针的状态；识别内存泄漏场景（函数返回前未 free、循环内反复申请）。
