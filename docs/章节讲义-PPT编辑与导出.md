# 章节讲义中的个性化 PPT

入口：学生端 → 学习路径 → 章节讲义 → 个性化课件。

沿用现有资源生成任务，按登录学生的学习画像、路径阶段、测验和知识点生成内容；模型不可用时沿用现有模板回退，并在生成进度中报告状态。新增 React 课件编辑器支持页面增删与排序、文本编辑和拖动、字号和颜色、三种主题、讲解备注、撤销重做、放映、草稿保存及 PPTX 导出。

参考项目：https://github.com/pipipi-pikachu/PPTist

这里是针对 LearnMate 的独立 React 实现，没有复制或嵌入 PPTist 的 Vue 编辑器源码。导出的 JSON 使用 PPTist 的 `title/width/height/slides/theme` 结构和文本元素字段，可在 PPTist 中通过 JSON 导入继续编辑。没有实现完整 PPTist 的图表、视频、动画、图片等全部能力。

API（均沿用登录校验，并按资源所有者检查权限）：

- GET `/api/resources/:resourceId/presentation`：读取编辑草稿。
- PUT 同路径：保存草稿。
- POST `/api/resources/:resourceId/presentation/export`：导出当前编辑版本的 PPTX；原始生成文件不被覆盖。

草稿按资源 ID 和生成版本保存在 `RESOURCE_STORAGE_DIR/presentation-drafts/`。不改数据库结构，备份资源目录时包含此目录。未保存的改动同时留在浏览器本机缓存，重新进入同一资源版本时恢复；点击保存后清除本机缓存。

导出限制：1–60 页，每页最多 20 个文字框，标题最多 200 字，颜色及几何数据须合法。服务端只接受纯文本并导出为可编辑的 PowerPoint 文字框。
