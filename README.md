# AriaUI

面向 [aria2](https://aria2.github.io/) 的现代下载管理器前端，目标是替代 [AriaNg](https://github.com/mayswind/AriaNg)：现代界面、现代技术栈、纯静态部署。

界面风格参考 [Motrix](https://github.com/agalwood/Motrix)。界面为简体中文。

## 技术栈

- React 19 + TypeScript
- Vite 8
- zustand（状态）/ react-router（hash 模式，可直接放静态服务器）
- Tailwind CSS v4 + lucide-react + recharts

## 特性

### 连接与核心

- 直连 aria2 JSON-RPC：传输协议可选「自动（优先 WebSocket）/ 仅 WebSocket / 仅 HTTP」，WebSocket 断线按可配置间隔自动重连
- aria2 WebSocket 事件通知（开始 / 暂停 / 停止 / 完成 / 出错 / BT 完成）：实时写入连接日志并触发任务刷新
- 多 RPC 服务器配置档案，随时一键切换；保存会话、关闭 aria2
- 页面标题实时显示下载 / 上传速度；下载完成 / 出错浏览器通知（可配频率与提示音）

### 任务操作

- 任务列表（全部 / 下载中 / 等待中 / 已停止）、实时搜索、排序（名称 / 大小 / 进度 / 剩余时间 / 上下行速度）
- 多选批量操作：暂停 / 继续 / 重试 / 移除 / 复制链接（`system.multicall` 批量执行）
- 右键 / 「⋯」任务菜单：详情、暂停、继续、重试、复制下载链接、复制磁力链接、调整队列顺序（移至最前 / 上移 / 下移 / 移至最后）、移除
- 快捷键：`Ctrl+N` 新建任务、`/` 搜索、`Ctrl+A` 全选、`Ctrl+C` 复制所选链接、`Del` 移除所选
- 单任务限速、重试（失败任务按原链接与选项重新添加）、清除已完成记录

### 任务详情

- 概览：进度、速度、剩余时间、分享率、完成时间、分片统计、错误码中文说明
- 文件：目录树展示，等待中 / 已暂停任务可勾选文件（`select-file`）并保存
- 选项：按任务状态门控的逐任务参数编辑（分段、连接数、限速、代理、HTTP 认证、BT 参数等 18 项）
- 分片图（bitfield）、BT 节点列表（客户端识别、单节点进度）、Tracker 列表（一键复制全部）

### 新建任务

- 链接 / 种子 / Metalink 三种方式；多行链接逐行解析，实时提示有效与无法识别的行
- 高级选项：保存目录（带历史记录）、文件名、上下行限速、分段与连接数、User-Agent / Referer / 自定义请求头、HTTP 认证、代理、校验和、BT 分享率 / 做种时长 / 追加 Tracker
- 「立即下载」/「稍后下载」（入列不启动）；支持拖拽 `.torrent` / `.metalink` 到页面任意位置导入

### 设置

- aria2 全部 158 项运行时设置，按 AriaNg 分组（基本 / HTTP·FTP·SFTP / HTTP / FTP·SFTP / BitTorrent / Metalink / RPC / 高级），带中文说明、单位、只读标记与修改校验，分组独立保存
- 连接设置（协议 / 重连间隔 / HTTPS）、界面设置（主题 / 刷新频率 / 标题模板 / 通知）、连接日志
- 底部全局状态栏：实时上下行速度、全局限速快捷设置、aria2 版本与连接状态

- 深色 / 浅色 / 跟随系统主题

## 开发

```bash
pnpm install
pnpm dev
```

构建静态文件：

```bash
pnpm build
```

产物在 `dist/`，扔到任意静态托管即可，不需要后端。

### 无后端开发 / 演示

仓库自带一个 aria2 RPC 模拟器（HTTP + WebSocket 双通道，模拟任务进度、事件通知、节点与服务器数据），无需真实 aria2 即可开发或演示 UI：

```bash
pnpm mock        # 监听 127.0.0.1:6800，启动后自动预置演示任务
pnpm dev         # 另开一个终端，打开 http://127.0.0.1:5173
```

## 连接 aria2

在 aria2 启动参数里开启 RPC：

```bash
aria2c --enable-rpc --rpc-listen-all=false --rpc-secret=你的秘钥
```

然后在「设置」页填写主机、端口（默认 6800）、接口路径（默认 `/jsonrpc`）和秘钥。

- 浏览器直连时，aria2 必须允许 WebSocket（JSON-RPC 与 WebSocket 共用 `--rpc-listen-port`），否则 AriaUI 会按所选协议回退或报错。
- HTTP 模式需要 aria2 侧允许跨域（`--rpc-allow-origin-all`），或以同源代理方式部署。
- 如果 AriaUI 部署在 https 页面、aria2 只有 http，浏览器会拦截混合内容，建议用反向代理给 aria2 套一层 https。

## 目录结构

```
scripts/      mock-aria2.mjs 开发用 aria2 RPC 模拟器
src/
  api/         aria2 JSON-RPC 客户端（WebSocket / HTTP、multicall、事件通知）与任务添加
  components/  布局（侧栏、顶栏、全局状态栏）与通用 UI 组件（ui/ 为基础组件）
  config/      aria2 设置项 schema（分组、类型、中文文案）
  features/    下载列表、任务菜单、任务详情、新建任务
  hooks/       通用 hooks（确认框、页面标题、下载通知）
  lib/         格式化与任务辅助函数
  pages/       下载、总览、设置、状态、关于页面
  stores/      zustand：设置、连接、任务、全局选项、新建任务表单、Toast
  types/       aria2 数据类型
```
