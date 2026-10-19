---
sourceKey: cn-team-tcp-conn
title: 计算机网络讲义：TCP连接管理
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: 计算机网络
chapter: 传输层
language: zh-CN
sourceType: team_authored
---
# TCP连接管理
## 三次握手
建立连接需三次交互：客户端发 SYN，服务端回 SYN+ACK，客户端再发 ACK。前两次让双方同步初始序号，第三次确认服务端的 SYN，防止历史连接请求造成误连。
## 为什么是三次
两次握手无法确认双方收发能力都已就绪，也可能让已失效的连接请求建立错误连接。第三次 ACK 使服务端确认客户端收到了自己的初始序号。
## SYN 与序列号
连接的每一方都随机选择初始序号，SYN 报文占用一个序号。握手完成后，双方按各自序号独立编号发送数据。
## 四次挥手
释放连接需四次：一方发 FIN，另一方回 ACK，再发 FIN，最后回 ACK。由于 TCP 全双工，关闭是双向的，每个方向都要单独关闭，所以是四次。
## TIME_WAIT 状态
主动关闭方在发送最后 ACK 后进入 TIME_WAIT，等待 2MSL 才关闭。它确保最后的 ACK 能到达并让旧连接的迟到报文在网络中消失，避免影响新连接。
## 典型问题
判断握手挥手报文的标志位与序号：SYN 与 FIN 都占用序号，纯 ACK 不占序号。分析状态转换时按“主动关闭进入 FIN_WAIT，被动关闭进入 CLOSE_WAIT”理解。
