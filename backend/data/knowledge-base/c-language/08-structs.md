---
sourceKey: c-team-structs
title: C 语言讲义：结构体与共用体
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 结构体
language: zh-CN
sourceType: team_authored
---
# 结构体与共用体
## 结构体定义
struct 把不同类型成员组合成一个整体。定义如 struct Student { int id; char name[20]; }; 结构体成员各自独立存储，总大小受对齐影响。
## 成员访问
用点运算符 . 通过结构体变量访问成员，用箭头运算符 -> 通过结构体指针访问成员。p->x 等价于 (*p).x。
## 结构体初始化与赋值
定义时可整体初始化，同类型结构体变量可整体赋值。结构体可作函数参数（按值传递整个结构）或传指针提高效率。
## typedef
typedef 为类型起别名，如 typedef struct Student Student; 后可省写 struct。typedef 不产生新类型，只是给现有类型一个别名。
## 共用体 union
union 的所有成员共用同一块内存，大小为最大成员大小，任一时刻只能有效保存一个成员的值。修改一个成员会覆盖其他成员。
## 结构体对齐
结构体成员按对齐规则排列，成员地址是其大小的整数倍，结构体总大小是最大对齐值的整数倍，因此成员顺序会影响总大小。
## 典型问题
计算结构体与共用体大小要注意对齐与填充字节；区分 . 与 -> 的适用对象；判断共用体赋新值后其他成员的值变化。
