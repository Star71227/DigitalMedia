# 个性化多模态学习资源

本阶段提供两种持久化资源：结构化思维导图和真实 OOXML PPTX。所有接口使用 JWT，学生身份只取自令牌；请求只提交资源类型、学科、知识点、路径版本和阶段 Key，画像、掌握度及错误模式由后端读取。

## 示例

1. 执行 `npm run seed:learning-loop`，登录 `zhangsan`。
2. 在学习路径页重新评估路径，使低掌握度阶段采用资源验收。
3. 进入资源页，生成思维导图；缩放、折叠节点并导出 SVG/PNG。
4. 生成 PPTX，查看结构化预览并下载；下载接口会验证学生归属。
5. 打开资源并阅读至少 30 秒，将进度更新为 100%，再点击完成；路径页会读取资源完成证据。

## 复位

运行 `npm run reset:learning-resources -- zhangsan`。脚本只删除指定学生的资源、版本、进度、阶段关联和对应本地文件，不修改画像、测验或路径版本。

## 存储

文件保存在 `backend/storage/resources/{studentId}/{resourceId}/v{version}/`。该目录已加入 `.gitignore`，不通过 Express 静态目录公开，只能经认证下载接口访问。
