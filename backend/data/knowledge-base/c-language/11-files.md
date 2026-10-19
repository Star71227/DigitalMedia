---
sourceKey: c-team-files
title: C 语言讲义：文件操作
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: C语言
chapter: 文件
language: zh-CN
sourceType: team_authored
---
# 文件操作
## 文件指针
文件操作通过 FILE 指针进行，FILE 是标准库定义的结构体类型。文件打开成功返回 FILE*，失败返回 NULL。stdin、stdout、stderr 是预定义流。
## 打开与关闭
fopen(路径, 模式) 打开文件，模式有 r 读、w 写（覆盖）、a 追加、rb/wb 二进制、r+ 读写等。fclose 关闭文件并刷新缓冲，防止数据丢失。
## 字符与字符串读写
fgetc/fputc 读写单字符；fgets/fputs 读写一行；getchar/putchar 对应标准输入输出。fgets 会保留换行，gets 已被弃用。
## 格式化读写
fscanf 按格式从文件读取，fprintf 按格式写入文件。与 scanf/printf 的区别是增加了文件指针参数，操作对象是文件而非终端。
## 二进制读写
fread/fwrite 按块读写二进制数据，参数为缓冲区、块大小、块数与文件指针，返回实际读写的块数，适合结构体与数组整体存取。
## 文件定位与结束判断
fseek 移动文件位置，ftell 获取当前位置，rewind 回到开头。feof 判断是否读到文件尾，需在读取操作之后检查才准确。
## 典型问题
判断 fopen 模式的含义与副作用（w 覆盖、a 追加）；分析 fread/fwrite 的返回值；注意文件操作后应 fclose，fgets 读取的换行处理。
