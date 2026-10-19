---
sourceKey: cn-team-app
title: 计算机网络讲义：应用层协议
author: LearnMate 项目组
publisher: LearnMate
license: CC-BY-4.0
version: 1.0.0
subject: 计算机网络
chapter: 应用层
language: zh-CN
sourceType: team_authored
---
# 应用层协议
## 域名系统 DNS
DNS 把域名解析为 IP 地址。解析按根域名服务器、顶级域、权威服务器逐级进行，本地域名服务器与主机缓存加速解析。默认使用 UDP 端口 53，区域传送用 TCP。
## DNS 查询过程
主机先查本地缓存，未命中向本地域名服务器递归查询；本地服务器必要时向根、顶级、权威服务器迭代查询。递归是替别人查到底，迭代是返回下一步线索。
## HTTP
HTTP 是无状态应用层协议，基于请求-响应。请求报文含方法、URL、版本、首部与正文；响应含状态码、首部与正文。默认端口 80。
## HTTP 方法与状态码
GET 获取、POST 提交、PUT 更新、DELETE 删除。状态码 2xx 成功、3xx 重定向、4xx 客户端错误、5xx 服务端错误，如 200、301、404、500。
## HTTPS 与安全
HTTPS 在 HTTP 与 TCP 之间加入 TLS，通过证书认证与密钥协商实现加密与完整性，默认端口 443。它防止窃听、篡改与伪装。
## 典型问题
判断 DNS 查询是递归还是迭代、用 TCP 还是 UDP；HTTP 题关注持久连接与非持久连接的往返次数，以及常见状态码的含义。
