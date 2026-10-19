---
sourceKey: c-team-control
title: C 语言讲义：流程控制
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 控制结构
language: zh-CN
sourceType: team_authored
---
# 流程控制
## 顺序结构
程序默认自上而下逐条执行，是最基本的控制结构。复合语句用花括号把多条语句组合成一个块。
## if 语句
if 根据条件真假选择执行，else 表示条件为假时的分支。else 与最近未配对的 if 匹配（就近配对），多层嵌套时建议用花括号明确归属。
## switch 语句
switch 根据整型表达式的值跳转到匹配的 case，break 跳出 switch，否则会贯穿执行后续 case。default 处理未匹配情况，适合多分支等值判断。
## while 循环
while 先判断条件再执行，条件为真则循环，可能一次都不执行。循环体内必须改变条件相关变量，否则死循环。
## do-while 循环
do-while 先执行一次再判断条件，至少执行一次。适合“先做再判断”的场景，如至少处理一次的输入校验。
## for 循环
for(初始化; 条件; 更新) 把初始化、条件判断与步进集中表达，最常用于确定次数的循环。三个表达式均可省略，但分号不可省略。
## break 与 continue
break 立即退出所在循环或 switch；continue 跳过本次循环剩余语句进入下一次判断。二者只作用于最内层的循环或 switch。
## 典型问题
分析嵌套循环的执行次数、break/continue 后的流程；判断循环是否会执行、条件变量的变化；注意 switch 无 break 的贯穿与 for 的边界。
