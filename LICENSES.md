# 许可证清单与人工复核项

## 项目许可证

状态：**提交前需人工确认**。

当前仓库根目录没有 LICENSE/COPYING/NOTICE 正文，三个 package.json 的 license 字段为空。README 曾只写“MIT”，但没有对应许可证文件和团队授权记录，不能据此宣称整个项目已按 MIT 发布。团队应在最终提交前：

1. 确认参赛规则、团队成员与既有贡献的授权；
2. 选择项目许可证或明确仅比赛提交的分发条件；
3. 添加完整许可证正文，并同步 README 与 package.json；
4. 对第三方素材、知识库、图标、字体和生成文件分别确认权利。

## 直接依赖许可证（锁文件解析口径）

| 许可证 | 组件 |
| --- | --- |
| MIT | cors、express、jsonwebtoken、mysql2、pptxgenjs、ws、supertest、React、React DOM、Recharts、Motion、Tailwind CSS、@tailwindcss/vite、Vite、@vitejs/plugin-react、Autoprefixer、@types/d3、@types/node |
| ISC | D3、Lucide React |
| BSD-3-Clause | bcryptjs |
| BSD-2-Clause | dotenv |
| Apache-2.0 | TypeScript |
| MIT OR GPL-3.0-or-later | JSZip；拟按 MIT 选项使用，提交前需人工确认并附文本 |

## 分发义务摘要

- MIT/ISC/BSD：通常需在源代码或二进制分发中保留版权、许可条件和免责声明。
- Apache-2.0：保留许可证、版权和 NOTICE（若上游提供），修改文件按许可证要求说明。
- 双许可证：明确采用的许可路径，并履行该路径的义务。

以上是工程清单，不是法律意见。最终发布包应从 package-lock.json 生成全量传递依赖 SBOM/许可证报告，并与镜像内实际依赖核对。

## 其他资产

- 数据结构知识源：当前文件声明 CC-BY-4.0；逐文件元数据和署名须人工复核。
- Noto CJK 字体与 Chromium：由后端容器系统包安装，许可证和再分发要求需从对应 Debian 包元数据核对。
- MySQL、Node 与 nginx-unprivileged 镜像：镜像分发和使用条款需按最终交付方式确认。
- 讯飞星火：属于外部服务，不是仓库开源依赖；使用受其服务协议和数据政策约束。
