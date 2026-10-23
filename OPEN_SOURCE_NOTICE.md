# Open Source Notice

寻笺 LearnMate 使用开源软件构建。下表基于三个 package.json、锁文件安装结果及直接依赖 package 元数据整理；版本以当前锁文件实际解析为准。项目对外分发前仍应使用许可证扫描工具生成包含全部传递依赖、许可证文本和版权声明的最终清单。

## 主要直接依赖

| 组件 | 当前解析版本 | 许可证 | 用途 | 修改上游源码 | 分发与声明 |
| --- | --- | --- | --- | --- | --- |
| Express | 4.22.2 | MIT | HTTP API | 否 | 随后端依赖分发；保留许可/版权 |
| mysql2 | 3.22.6 | MIT | MySQL 客户端 | 否 | 保留许可/版权 |
| jsonwebtoken | 9.0.3 | MIT | JWT | 否 | 保留许可/版权 |
| bcryptjs | 3.0.3 | BSD-3-Clause | 密码哈希 | 否 | 保留 BSD 版权、条件和免责 |
| cors | 2.8.6 | MIT | CORS 中间件 | 否 | 保留许可/版权 |
| dotenv | 17.4.2 | BSD-2-Clause | 环境变量加载 | 否 | 保留 BSD 声明 |
| PptxGenJS | 4.0.1 | MIT | PPTX 生成 | 否 | 保留许可/版权 |
| JSZip | 3.10.1 | MIT OR GPL-3.0-or-later | OOXML ZIP | 否 | 拟选择 MIT 路径；提交前人工确认 |
| ws | 8.21.0 | MIT | WebSocket | 否 | 保留许可/版权 |
| React / React DOM | 19.2.7 | MIT | 两套前端 | 否 | 保留许可/版权 |
| D3 | 7.9.0 | ISC | 学生端可视化 | 否 | 保留 ISC 版权与许可 |
| Recharts | 3.9.2 | MIT | 图表 | 否 | 保留许可/版权 |
| Motion | 12.42.2 | MIT | 学生端动效 | 否 | 保留许可/版权 |
| Lucide React | 0.546.0 | ISC | 图标 | 否 | 保留 ISC 版权与许可 |
| Tailwind CSS | 4.3.2 | MIT | 样式构建 | 否 | 保留许可/版权 |
| Vite | 6.4.3 | MIT | 前端构建 | 否 | 保留许可/版权 |
| TypeScript | 5.8.3 | Apache-2.0 | 类型检查/编译 | 否 | 保留许可证与 NOTICE（如适用） |
| Supertest | 7.2.2 | MIT | 后端测试 | 否 | 开发依赖；保留声明 |

版本号来自本轮按锁文件执行 npm ci 后的包元数据，不应手工同步为未来版本。其他直接开发依赖的许可证分类见 LICENSES.md。

## 项目内容与知识库

仓库数据结构知识源的 front matter 当前声明 CC-BY-4.0，作者、发布者和版本以各条目元数据为准；导入器仅允许 CC-BY-4.0、CC0-1.0、PUBLIC-DOMAIN 和 USER-AUTHORIZED。对外分发前须逐文件人工复核作者、权利来源、署名方式和版本，不得导入商业教材全文或不明来源网页内容。

## 未决事项

- 仓库没有根 LICENSE 正文，三个 package.json 未声明项目 license；项目自身授权方式为“提交前需人工确认”。
- 本表不替代全部传递依赖清单，也不构成法律意见。
- 生成的 PPTX/PDF 可能包含用户输入或引用摘要，其对外分发权需按实际内容判断。
