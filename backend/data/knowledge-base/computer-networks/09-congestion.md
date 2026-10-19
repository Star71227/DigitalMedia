---
sourceKey: cn-team-congestion
title: 计算机网络讲义：拥塞控制
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: 计算机网络
chapter: 传输层
language: zh-CN
sourceType: team_authored
---
# 拥塞控制
## 拥塞的概念
拥塞是网络负载超过其承载能力导致性能下降的现象。拥塞控制是发送方根据网络状况调节发送速率，避免使网络过载；流量控制则是匹配接收方能力，两者不同。
## 拥塞窗口
发送方用拥塞窗口 cwnd 限制未确认数据量，实际发送窗口取接收窗口与拥塞窗口的较小值。cwnd 随拥塞程度动态变化。
## 慢开始
连接建立或超时后，cwnd 从较小值开始，每收到一个确认按指数增长（每经过一个 RTT 翻倍），直到达到慢开始门限 ssthresh。
## 拥塞避免
cwnd 超过 ssthresh 后进入拥塞避免，每个 RTT 线性增加一个报文段。若发生超时，认为网络拥塞，把 ssthresh 减半、cwnd 重置并重新慢开始。
## 快重传与快恢复
收到三个重复 ACK 时立即重传丢失报文而不等超时，把 ssthresh 减半、cwnd 设为新的 ssthresh，直接进入拥塞避免，避免从慢开始重新爬升。
## 典型问题
按轮次计算 cwnd 变化：慢开始阶段指数增长，达到门限后线性增长；判断是超时（cwnd 归 1）还是三个重复 ACK（快恢复）决定了后续行为。
