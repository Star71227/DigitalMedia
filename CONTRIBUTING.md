# 团队协作说明（数字媒体仓库）

本仓库是 **智课研伴 LearnMate** 的团队协作仓库，包含学生端、教师端、后端与桌面打包源码。
请先阅读 `README.md` 了解项目，再按下面的流程参与开发。

## 一、克隆与初始化

```bash
git clone https://github.com/Star71227/DigitalMedia.git
cd DigitalMedia
```

环境要求：

- Node.js 24（前端与后端）
- MySQL 8.4（或使用 docker-compose.yml 启动数据库）
- 可选：Docker（CodeLab 在线判题）

初始化配置（**不要提交 `.env`**）：

- 根目录：复制 `.env.docker.example` 为 `.env`，按本机情况填写
- 各子项目：参考 `backend/.env.example`、`frontend-new/.env.example`、`frontend-teacher/.env.example`

依赖安装与启动参考 `README.md` 与根目录启动脚本。

## 二、分支与提交

1. 从最新 `main` 拉分支：`git switch main && git pull`，再 `git switch -c feat/你的功能`。
2. 一个分支只做一件事，提交信息写清楚“改了什么、为什么改”。
3. 提交前自检：`git status` 确认没有把日志、构建产物、密钥和运行时数据带进来。
4. 推送到远端：`git push -u origin feat/你的功能`。
5. 在 GitHub 上发起 Pull Request → 至少 1 人 Review → 合并到 `main`。

常用分支前缀：`feat/` 新功能、`fix/` 缺陷修复、`docs/` 文档、`refactor/` 重构。

## 三、不要提交的内容

仓库已通过 `.gitignore` 排除以下内容，请勿强制添加：

- `.env` 及任何真实密钥、账号密码
- `node_modules/`、`dist/`、`build/`、日志文件
- `storage/`、`backend/storage/` 等运行时生成的数据与报告
- `.ai-cache/`、模型权重、`.local-runtime/`
- `packaging/desktop/compiler/` 便携编译器（由 `packaging/desktop/tools/fetch-compiler.ps1` 重新生成）
- 安装包、压缩包等大体积产物

## 四、代码与文档约定

- 前端：TypeScript + React 19 + Vite，保持现有目录结构与组件风格。
- 后端：Node.js + Express + MySQL，接口变更需同步更新 `docs/` 下的接口说明。
- 提交 AI 生成或辅助的代码时，如实更新 `AI_CODING_DISCLOSURE.md`。
- 重要改动请在 PR 描述中附上验证方式（命令、截图或接口示例）。

## 五、问题与协作

- 需求、缺陷用 GitHub Issues 记录，注明端（学生端 / 教师端 / 后端 / 桌面版）。
- 涉及数据库结构变更时，先说明迁移方案，再合并。
- 大文件（演示视频、安装包）不要进仓库，用网盘或 Release 附件方式共享。
