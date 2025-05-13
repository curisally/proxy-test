---
title: Proxy Checker App
emoji: 🕵️‍♂️ # 或者其他您喜欢的 emoji
colorFrom: indigo # 卡片渐变起始颜色
colorTo: green   # 卡片渐变结束颜色
sdk: docker      # SDK 类型为 docker
dockerfile_path: Dockerfile-hf # **重要**: 指定使用 Dockerfile-hf 文件
# app_image: vichus/proxy-checker:latest # **重要**: 移除或注释掉此行
app_port: 5001   # **重要**: 容器内应用监听的端口，必须与 Dockerfile 中 EXPOSE 的端口一致
# pinned: false # 如果希望固定在您的 profile 页面，可以设为 true
---

# Proxy Checker Application

这是一个代理批量有效性测试工具。

**功能：**
- 批量测试 HTTP/HTTPS/SOCKS4/SOCKS5 代理的可用性。
- 显示代理的响应时间、检测到的 IP 地址。
- 通过 ip-api.com 获取并显示代理的地理位置信息（国家、城市）。
- 提供查看详细地理位置信息的功能。
- 支持将测试成功的代理信息下载为 CSV 文件。

**技术栈：**
- 前端: React, TypeScript, Vite, Ant Design
- 后端: Python, Flask
- 部署: Docker
