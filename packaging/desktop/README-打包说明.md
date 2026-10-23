# 寻笺 LearnMate — 桌面版打包说明

给项目做一个「双击就装、装完就是桌面软件」的 Windows 安装包。

产物：`dist\寻笺-LearnMate-Setup-<版本>.exe`（约 175MB）
+ `dist\下载页.html`（可直接发给同学/评委的下载页）
+ `dist\安装包说明.txt`、`dist\寻笺-LearnMate-Setup-<版本>.sha256.txt`

## 一条命令打包

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
& "D:\Users\29973\Desktop\-\packaging\desktop\build-desktop-installer.ps1"
```

第一次跑会做三件事：装 Inno Setup（winget）、下 Electron（npmmirror 镜像）、装中文安装向导语言包。
之后每次打包约 6~8 分钟（大头是 LZMA2 极限压缩）。

还有两样大件由脚本自己获取，**不需要手动准备，也都不进 git**（新克隆的仓库第一次打包会自动补上）：

- **Electron 运行时**：从 npmmirror 下到 `packaging\desktop\build\`（约 324 MB）。
- **便携 C 编译器**：`tools\fetch-compiler.ps1` 从 w64devkit（GitHub release v2.10.0）下载后裁剪，
  只保留编译/链接/运行基本 C 程序所需的部分，产出 `packaging\desktop\compiler\`（约 128 MB，首次约 1~3 分钟）。
  主脚本发现 `compiler\bin\gcc.exe` 不存在时会自动调用它，所以 clone 下来直接跑打包脚本即可。

常用参数：

| 参数 | 作用 |
| --- | --- |
| `-Version 1.0.1` | 指定版本号（影响安装包文件名与「应用和功能」里的版本） |
| `-SkipFrontendBuild` | 跳过 `npm run build`，直接用现有的 `frontend-*/dist` |
| `-SkipElectronInstall` | 跳过 Electron 下载（要求 `packaging\desktop\build\node_modules\electron\dist` 已存在） |
| `-RemovePayload` | 打完包删掉 `dist\_payload` 暂存目录（省 ~540MB 磁盘） |
| `-RuntimeSource <路径>` | 指定内置运行时（Node/MySQL/后端依赖）的来源，默认取已装环境 |

## 安装包装了什么

```
LearnMate.exe               Electron 桌面外壳（改名的 electron.exe，就是"应用本体"）
resources\app\             外壳代码：main.js（拉起服务、开窗口、托盘、退出清理）
runtime\node\node.exe      内置 Node 运行时（后端与两个静态服务用它跑）
runtime\mysql\            内置 MySQL 8.4 运行时（首次启动自动 initialize）
backend\                   后端源码 + 生产依赖 node_modules + 种子数据
web\student、web\teacher   学生端 / 教师端前端产物
scripts\                   启动/停止/配置/本地静态服务/uninstall 脚本
data\                      首次启动时生成：数据库数据（约 240MB）与 storage
```

安装到 `%LOCALAPPDATA%\Programs\LearnMate`（免管理员、免 UAC），
写桌面与开始菜单快捷方式，卸载走 Inno Setup 的 `unins000.exe`（会一并删掉 `data`）。

## 目录结构（本目录）

```
build-desktop-installer.ps1   主打包脚本（组装 payload → 编译安装包 → 出校验信息与下载页）
installer.iss                 Inno Setup 脚本（安装向导、快捷方式、卸载、覆盖安装前停服务）
shell\                        Electron 外壳
  main.js                     主进程：调脚本起服务 → 启动画面 → 应用窗口 / 教师端窗口 / 托盘
  pages\splash.html           启动画面（背景用的是登录入场动画截帧 cover.jpg）
  pages\cover.jpg             从「登录入场动画」定版那一帧裁出来的应用封面
app-template\                 运行脚本与图标（打包时的"事实源"）
  scripts\                    start/stop/configure-ai/_common/static-server/uninstall
  LearnMate.ico               程序图标
assets\                       使用说明、停止脚本、安装向导小图、下载页模板
tools\
  get-innosetup.ps1           安装 Inno Setup（winget → 官网安装器兜底）
  capture-intro-frames.cjs    用无头 Edge + CDP 录入场动画的帧（生成封面用）
  make-cover-assets.ps1       从截帧生成 cover.jpg / wizard-small.bmp / app-cover.png
  verify-installer.ps1        端到端验证：静默安装 → 启动 → 接口自检 →（可选）卸载
  check-app-ports.ps1         单实例自检：四个端口互不重复 + 确实在监听 + 页面内容特征
  fetch-cloud-snapshot.ps1    从云服务器拉取数据快照（数据库 + 存储 + 功能配置）
  check-cloud-parity.ps1      校验桌面版与云端一致（条数 / 真实账号 / AI 配置 / 两端页面）
  capture-app-pages.cjs       真实登录学生端与教师端并截图（核对两端都能登）
```

以下三个目录是**本机生成物，已 gitignore，不入库**（换机器后由脚本重建）：

```
compiler\                     便携 gcc 工具链（tools\fetch-compiler.ps1 生成，约 128 MB）
build\                        Electron 运行时（打包时自动下载，约 324 MB）
cloud-snapshot\               云端数据快照：整库导出 + storage + 云端 .env（含 LLM API Key）
                              由 tools\fetch-cloud-snapshot.ps1 生成；该目录自带 .gitignore 全部忽略。
                              ⚠ 含真实账号数据与密钥，**既不要提交，也不要随源码交付包发出去**。
```

## 应用封面怎么来的

封面 = 品牌 logo 圆角块 + 名称，**用无头 Edge 渲染 HTML 得到**（不是画图），
模板在 `assets\cover.html`（整封面）与 `assets\logo-tile.html`（只要 logo 块）。
同一套模板还会生成安装向导小图和程序图标 `.ico`：

```powershell
& packaging\desktop\tools\make-cover-assets.ps1
```

产物：`shell\pages\cover.jpg`（启动画面背景）、`assets\app-cover.png`（下载页封面）、
`assets\logo-tile.png`、`assets\wizard-small.bmp`（安装向导右上角）、
`app-template\LearnMate.ico`（16/24/32/48/64/128/256 多尺寸，PNG 压缩条目）。
改设计只需要改这两个 HTML 再重跑脚本。

另外还留了一个工具：`tools\capture-intro-frames.cjs` 可以把「登录成功后播放的全屏书页 logo 入场动画」
逐帧录下来（用 `Page.startScreencast` 推帧，因为 `Page.captureScreenshot` 每次要 1~2 秒、
抓不满 2.4 秒的动画），想要"动画截图当封面"时可以用它取帧。
## 数据与云端一致（seed 快照）

安装包内置 `seed\`，第一次启动直接铺进本机数据库与存储目录，因此**桌面版和云服务器
（http://111.230.111.94:9080）的账号、班级、作业、题库、资源、报告完全一致**——包括
张湛（2511310430）、张泮（Zhangruizhan）这类真实账号，用原密码就能登录。

```
seed\learnmate-cloud-db.sql     云端整库导出（77 个账号 + 资源/测验/报告等）
seed\storage\resources|reports  云端存储卷里的文件
seed\cloud.env                  云端功能配置（AI 开关、GLM 模型与 Key、判题执行器…）
seed\snapshot-info.txt          快照来源与导出时间
```

首启流程（`app-template\scripts\start-learnmate.ps1`）：

1. 初始化内置 MySQL → 建库 / 建应用账号；
2. `Import-LmSeedDatabase`：只有**库里一张表都没有**时才导入快照（已有用户数据绝不覆盖），
   导入成功后把 `config.seeded` 置为 true，于是不再走「建表 + 灌演示数据」那条路；
3. `Initialize-LmSeedStorage`：把 `seed\storage` 铺到 `data\storage`（目标已有文件时跳过）；
4. `Resolve-LmCodeExecutionMode`：`auto` → 本机有可用的 Docker 就用 `docker`（与云端一致），否则 `disabled`；
5. `.env` 的 AI 配置来自 `seed\cloud.env`，所以桌面版的大模型功能与云端同款（同一把 GLM Key）。
   不想让安装包带这把 Key，就把 `cloud.env` 里的 `LLM_API_KEY=` 留空（装完可在「配置AI模型.bat」里填自己的）。

云端数据更新后刷新快照再打包：

```powershell
& packaging\desktop\tools\fetch-cloud-snapshot.ps1
```

装完后的「桌面版 = 云端」一致性校验：

```powershell
& packaging\desktop\tools\check-cloud-parity.ps1 -InstallDir "D:\tmp\lm-test"
```
## 验证

```powershell
# 端到端（装到临时目录，不动已安装的正式实例）
& packaging\desktop\tools\verify-installer.ps1 `
    -InstallerPath "dist\寻笺-LearnMate-Setup-1.0.0.exe" `
    -InstallDir "D:\tmp\lm-desktop-test" -Uninstall

# 实例自检（服务已在跑时）
& packaging\desktop\tools\check-app-ports.ps1 -InstallDir "D:\tmp\lm-desktop-test"
```

## 已知限制 / 踩过的坑

1. **端口避让的坑（已修）**：`start-learnmate.ps1` 原来逐个避让端口时不记「本轮已分出去的端口」，
   于是学生端避让到 8082 之后教师端又挑中 8082，教师端静态服务 `EADDRINUSE` 静默退出
   —— 表现是"教师端页面能打开"（其实是学生端在应答 SPA 回退），很容易漏掉。
   现在按 `$reservedPorts` 去重，并在起完两个静态服务后确认端口真的在监听。
2. **两个前端对任何路径都回退 index.html**：所以「教师端 200」不等于教师端起来了，
   自检要带页面内容特征（`check-app-ports.ps1` 已按「教师端」字样校验）。
3. **MySQL 不认非 ASCII 路径**：安装目录含中文时，`_common.ps1` 会把 MySQL 运行时复制到
   `%PUBLIC%\LearnMateRuntime\<哈希>` 再跑；默认安装目录是纯 ASCII，正常不会触发。
4. **卸载前必须先停服务**：Inno 的 `[UninstallRun]` 会先跑 `stop-learnmate.ps1`，
   `InitializeUninstall` 里再 taskkill 一次 `LearnMate.exe`，否则 mysqld 会占着 `data\mysql` 删不掉。
5. **安装包没有代码签名**：会触发 SmartScreen「未知发布者」提示，属正常（学校比赛作品）。
6. **代码判题（C 语言题）需要 Docker/WSL**：安装包不带 Docker，`.env` 里 `CODE_EXECUTION_MODE=disabled`，
   判题相关功能会走降级逻辑；要完整判题能力仍需装 Docker Desktop。
