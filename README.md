# LightClip

LightClip 是一个轻量、漂亮、偏隐私友好的 Windows 剪贴板历史工具。它常驻托盘，按 `Alt + V` 即可呼出搜索面板，用来快速找回复制过的文本、图片和文件。

> v0.1.1 修复了 Windows 安装版和便携版在 `file://` 环境加载前端资源时可能出现空白窗口的问题。

## 特性

- 文本剪贴板历史：自动去重、搜索、固定、删除、清空未固定记录。
- 图片历史：可选开启，保存截图或图片剪贴板，并可复制回剪贴板。
- 文件历史：可选开启，记录从资源管理器复制的文件路径；复制回 LightClip 记录时会尽量写回 Windows 文件剪贴板格式，方便继续在资源管理器中粘贴文件。
- 托盘常驻：关闭窗口默认隐藏到托盘。
- 开机自启：当前用户登录 Windows 后自动启动，不需要管理员权限。
- 快捷键唤起：默认 `Alt + V`。
- 本地存储：历史数据保存在 Electron `userData` 目录，不上传网络。
- 自定义标题栏：包含「文件 / 编辑 / 视图 / 窗口」菜单和原生窗口控制按钮。

## 安装

从 GitHub Release 下载：

- `LightClip Setup x.y.z.exe`：安装版，适合日常使用。
- `LightClip x.y.z.exe`：便携版，下载后直接运行。

安装后打开 LightClip，点右上角设置按钮，可以开启：

- 开机自启
- 图片历史
- 文件历史

## 使用

- `Alt + V`：显示/隐藏 LightClip。
- `↑` / `↓`：选择历史项。
- `Enter`：复制选中的历史项。
- `Esc`：隐藏窗口。
- 双击历史项：复制该项。

## 隐私说明

LightClip 默认只记录文本剪贴板。图片历史和文件历史默认关闭，因为它们可能涉及截图、设计稿、证件照、文件路径等敏感内容。

建议：

- 不要在处理密码、Token、身份证号等敏感内容时开启剪贴板记录。
- 图片历史会增加本地数据体积。
- 文件历史记录的是路径，不会复制文件内容到 LightClip 数据库。

## 数据位置

数据保存在当前用户的 Electron `userData` 目录中。可以从托盘菜单选择「打开数据目录」。

主要数据文件：

```text
lightclip-store.json
```

## 开发

要求：

- Node.js 22+ 或 24+
- pnpm 11+
- Windows 10/11

安装依赖：

```powershell
pnpm install
```

开发运行：

```powershell
pnpm dev
```

或：

```powershell
.\Start-LightClip.ps1
```

类型检查：

```powershell
pnpm typecheck
```

构建：

```powershell
pnpm build
```

打包 Windows 安装包和便携版：

```powershell
pnpm dist
```

`electron-builder` 已配置为使用本地 `node_modules/electron/dist`，并固定到旧版 NSIS 工具链缓存，减少打包时访问 GitHub 下载 Electron runtime 或构建工具的不可控等待。

## 技术栈

- Electron
- Vue 3
- TypeScript
- Vite
- pnpm
- electron-builder

## 已知边界

- 文件历史的原生粘贴能力依赖 Windows PowerShell 的 STA Clipboard API。如果系统策略禁用 PowerShell，LightClip 会回退到复制文件路径文本。
- 图片历史以 PNG data URL 存储，建议控制图片历史开关和历史上限。
- 当前版本没有云同步，所有数据仅保存在本机。
