---
sourceKey: cn-team-arp
title: 计算机网络讲义：地址解析协议
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: 计算机网络
chapter: 网络层
language: zh-CN
sourceType: team_authored
---
# 地址解析协议
## ARP 的作用
ARP 把同一网段内目标主机的 IP 地址解析为对应的 MAC 地址。主机发送帧时需要目的 MAC 地址，而应用层只知道 IP 地址，因此需要 ARP 解析。
## ARP 的工作过程
主机广播 ARP 请求“谁的 IP 是这个地址”，目标主机单播回应自己的 MAC 地址，请求方把结果缓存到 ARP 表中以加速后续解析。
## ARP 缓存
ARP 表缓存 IP 到 MAC 的映射，避免每次发送都广播。缓存条目有生存时间，过期后需重新解析，防止因网卡更换或地址变化而失效。
## 跨网段的 ARP
目的主机不在同一网段时，主机把帧发给默认网关，因此解析的是网关的 MAC 地址而非目的主机的 MAC 地址。路由器逐跳转发并重新封装。
## 免费 ARP
主机发送目的地址为本机 IP 的 ARP 请求，用于检测 IP 冲突或通告自己新的 MAC 地址。收到免费 ARP 的主机更新缓存。
## 典型问题
判断 ARP 请求是广播还是单播：请求用广播、应答用单播。跨网段转发时，帧的源/目的 MAC 在每一跳都会改变，而源/目的 IP 保持不变。
