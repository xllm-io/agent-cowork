# Open Claude Cowork — 代码开发设计文档

## 1. 项目概述

**Open Claude Cowork**（又名 Agent Cowork）是一个开源的桌面端 AI 协作助手，作为 [Claude Code (Claude Cowork)](https://docs.anthropic.com/en/docs/claude-code) 的可视化替代方案。它通过 Electron + React 构建原生桌面应用，调用 Anthropic 官方的 `@anthropic-ai/claude-agent-sdk` SDK，使用户可以在图形界面中创建、管理和监控 AI Agent 会话。

### 1.1 核心目标

- 为 Claude Code 提供**可视化 GUI**，解决终端操作的不便
- 支持**多会话管理**，可同时跟踪多个 AI 任务
- **实时流式展示** Agent 的执行过程（思考、工具调用、输出）
- 支持**交互式权限审批**（AskUserQuestion、工具调用确认）
- 复用用户已有的 `~/.claude/settings.json` 配置，也可通过 UI 自定义 API 设置
- 支持会话**历史记录持久化**（SQLite）和**向上滚动回溯**

### 1.2 技术栈

| 层级 | 技术选型 |
|------|---------|
| 桌面框架 | Electron 39.x |
| 前端框架 | React 19.x + TypeScript 5.9 |
| 状态管理 | Zustand 5.x |
| UI 样式 | Tailwind CSS v4 + 自定义主题色 |
| Markdown 渲染 | react-markdown + rehype-highlight + remark-gfm |
| 数据库 | better-sqlite3 12.x |
| AI SDK | @anthropic-ai/claude-agent-sdk 0.2.6（已打 patch） |
| 构建工具 | Vite 7.x + Bun / Node.js |
| 打包工具 | electron-builder 26.x |
| 组件库 | Radix UI (Dialog, Dropdown Menu) |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Cowork (Desktop App)               │
├──────────────────────────┬──────────────────────────────────┤
│       UI Layer           │         Electron Main Layer      │
│   (React / Vite)         │                                  │
│  ┌──────────────────────┐ │  ┌────────────────────────────┐ │
│  │   App.tsx            │ │  │   main.ts                  │ │
│  │   - Layout & routing │ │  │   - Window lifecycle       │ │
│  └──────────┬───────────┘ │  └────────────┬───────────────┘ │
│             │              │              │                  │
│  ┌──────────▼───────────┐ │  ┌────────────▼───────────────┐ │
│  │   Components         │ │  │   ipc-handlers.ts          │ │
│  │   - Sidebar          │ │  │   - Session CRUD dispatch  │ │
│  │   - PromptInput      │ │  │   - Event broadcast        │ │
│  │   - EventCard        │ │  └────────────┬───────────────┘ │
│  │   - SettingsModal    │ │               │                  │
│  │   - StartSessionModal│ │  ┌────────────▼───────────────┐ │
│  │   - DecisionPanel    │ │  │   libs/runner.ts           │ │
│  └──────────┬───────────┘ │  │   - runClaude()            │ │
│             │              │  │   - SDK query orchestration│ │
│  ┌──────────▼───────────┐ │  └────────────┬───────────────┘ │
│  │   Hooks              │ │               │                  │
│  │   - useIPC           │ │  ┌────────────▼───────────────┐ │
│  │   - useMessageWindow │ │  │   libs/session-store.ts    │ │
│  └──────────┬───────────┘ │  │   - SQLite persistence     │ │
│             │              │  └────────────────────────────┘ │
│  ┌──────────▼───────────┐ │  ┌────────────────────────────┐ │
│  │   Store (Zustand)    │ │  │   libs/config-store.ts     │ │
│  │   - sessions state   │ │  │   - API config (JSON file) │ │
│  │   - event handler    │ │  └────────────────────────────┘ │
│  └──────────────────────┘ │  ┌────────────────────────────┐ │
│                           │  │   libs/claude-settings.ts  │ │
│                           │  │   - settings.json fallback │ │
│                           │  │   - env builder            │ │
│                           │  └────────────────────────────┘ │
├──────────────────────────┴──────────────────────────────────┤
│                    IPC Bridge (preload.cts)                  │
│              contextBridge + ipcRenderer / ipcMain           │
├─────────────────────────────────────────────────────────────┤
│              @anthropic-ai/claude-agent-sdk (Node.js)        │
│              (fork-based process transport, patched)         │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 进程模型

```
┌─────────────────────┐         IPC          ┌─────────────────────┐
│   React Renderer    │ ◄══════════════════► │   Electron Main     │
│   (Vite Dev Server  │                      │   (Node.js)         │
│    or packaged HTML) │                      │                     │
└─────────────────────┘                      └──────────┬──────────┘
                                                        │
                                           query() SDK call
                                                        │
                                                        ▼
                                              ┌───────────────────┐
                                              │  Claude Code CLI  │
                                              │  (fork process)   │
                                              └───────────────────┘
```

- **UI 进程**：由 Vite 驱动的 React SPA，运行在 BrowserWindow 中
- **Main 进程**：Electron 主进程，负责窗口管理、文件系统访问、SQLite 存储、Claude Agent SDK 调用
- **Claude Code 子进程**：通过 `child_process.fork()` 启动（经过 patch），与 Main 进程通过 stdio + IPC 通信

---

## 3. 模块详细设计

### 3.1 Electron Main 层

#### 3.1.1 `main.ts` — 入口与窗口管理

**职责**：
- 应用生命周期管理（ready、before-quit、window-all-closed）
- 主窗口创建与配置（尺寸、图标、trafficLightPosition）
- 全局快捷键注册（Cmd/Ctrl+Q）
- IPC 路由注册（ipcMainHandle / ipcMain.on）
- 资源轮询（CPU/RAM/Storage）
- 清理逻辑（注销快捷键、停止轮询、终止所有 session）

**关键流程**：
```
app.ready
  → Menu.setApplicationMenu(null)          // 隐藏原生菜单
  → 注册信号处理器 (SIGTERM/SIGINT/SIGHUP)
  → 创建 BrowserWindow (1200×800)
  → 加载 Vite dev server 或 dist-react
  → 注册全局快捷键 CmdOrCtrl+Q
  → 启动 pollResources (系统资源监控)
  → 注册 IPC handlers
```

#### 3.1.2 `ipc-handlers.ts` — 事件分发中心

**职责**：
- 接收来自 UI 的 ClientEvent，分发给对应处理逻辑
- 初始化 SessionStore（懒加载）
- 将 Runner 产生的 ServerEvent 广播到所有 UI 窗口
- 管理 RunnerHandle 生命周期（abort）

**事件路由表**：

| ClientEvent Type | 处理逻辑 |
|-----------------|---------|
| `session.list` | 从 SessionStore 列出所有会话，返回 session.list 事件 |
| `session.history` | 从 SQLite 加载会话历史消息，返回 session.history 事件 |
| `session.start` | 创建新 Session → 启动 Runner → 流式执行 prompt |
| `session.continue` | 查找已有 Session → 继续执行新 prompt |
| `session.stop` | 获取 RunnerHandle → 调用 abort() → 标记 idle |
| `session.delete` | 终止 Runner → 删除 SessionStore 记录 → 广播 deleted |
| `permission.response` | 查找 pendingPermission → resolve Promise |

**广播机制**：
```typescript
function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send("server-event", payload);
  });
}
```

#### 3.1.3 `libs/runner.ts` — Claude Agent 执行引擎

**职责**：
- 封装 `@anthropic-ai/claude-agent-sdk` 的 `query()` 调用
- 管理 AbortController 实现会话中止
- 处理工具权限审批（特别是 AskUserQuestion）
- 捕获并转发 SDK 消息到前端

**核心流程**：
```
runClaude(options)
  → 创建 AbortController
  → 获取 API 配置 (getCurrentApiConfig)
  → 合并环境变量 (buildEnvForConfig + getEnhancedEnv)
  → 调用 query({ prompt, options })
  │
  ├→ 遍历 for-await-of q:
  │   ├─ system/init 消息 → 提取 session_id → 持久化
  │   ├─ 其他消息 → sendMessage() → 广播 stream.message
  │   └─ result 消息 → 更新 session.status (completed/error)
  │
  ├→ canUseTool 回调:
  │   ├─ AskUserQuestion → 创建 pendingPermission Promise → 等待 UI 响应
  │   └─ 其他工具 → 自动批准 (allow)
  │
  └→ 返回 { abort: () => abortController.abort() }
```

**权限审批机制**：
- 当 Claude 调用 `AskUserQuestion` 工具时，SDK 触发 `canUseTool` 回调
- 应用生成随机 `toolUseId`，向 UI 发送 `permission.request` 事件
- 创建一个 Promise 挂起，等待用户在 UI 上选择 Allow/Deny
- 用户响应通过 `permission.response` 事件回传，resolve Promise

#### 3.1.4 `libs/session-store.ts` — 会话持久化

**职责**：
- 内存 Map + SQLite 双层存储
- 会话 CRUD 操作
- 消息历史持久化
- 最近工作目录查询

**数据库 Schema**：
```sql
-- 会话表
CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    title           TEXT,
    claude_session_id TEXT,
    status          TEXT NOT NULL,    -- idle | running | completed | error
    cwd             TEXT,
    allowed_tools   TEXT,
    last_prompt     TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- 消息表
CREATE TABLE messages (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    data            TEXT NOT NULL,    -- JSON serialized StreamMessage
    created_at      INTEGER NOT NULL
);

CREATE INDEX messages_session_id ON messages(session_id);
PRAGMA journal_mode = WAL;  -- 提高并发写入性能
```

**内存缓存**：
- `sessions: Map<string, Session>` — 运行时活跃会话
- `pendingPermissions: Map<string, PendingPermission>` — 每个会话的待审批请求
- 启动时从 DB 加载所有会话到内存

#### 3.1.5 `libs/config-store.ts` — API 配置存储

**职责**：
- 在用户数据目录 (`~/.config/agent-cowork/`) 存储 `api-config.json`
- 提供配置的加载、保存、删除操作

**配置格式**：
```json
{
  "apiKey": "sk-ant-...",
  "baseURL": "https://api.anthropic.com",
  "model": "claude-sonnet",
  "apiType": "anthropic"
}
```

#### 3.1.6 `libs/claude-settings.ts` — 配置管理

**职责**：
- 查找 Claude Code 可执行文件路径（区分开发/生产环境）
- 配置优先级：UI 配置 > `~/.claude/settings.json` 文件
- 自动将从 settings.json 读取的配置持久化到 api-config.json
- 构建传递给 SDK 的环境变量

**配置回退链**：
```
getCurrentApiConfig()
  → loadApiConfig()          // ~/.config/agent-cowork/api-config.json (UI 保存)
  → read ~/.claude/settings.json  // Claude CLI 配置文件
  → return null
```

#### 3.1.7 `libs/util.ts` — 工具函数

**职责**：
- `getEnhancedEnv()` — 构建增强环境变量（包含 API 凭证和 PATH）
- `generateSessionTitle()` — 调用 Claude SDK 的 `unstable_v2_prompt()` 自动生成会话标题

#### 3.1.8 `test.ts` — 系统资源监控

**职责**：
- 定时轮询 CPU 使用率、RAM 使用率、磁盘使用情况
- 每 500ms 通过 IPC 向 UI 发送 statistics 事件

### 3.2 IPC 桥接层

#### 3.2.1 `preload.cts` — Context Bridge

**职责**：安全地暴露 Electron API 给渲染进程

**暴露的 API**：

| 前端调用 | IPC 方向 | 后端处理 |
|---------|---------|---------|
| `electron.subscribeStatistics(cb)` | Main → Renderer | 监听 "statistics" 事件 |
| `electron.getStaticData()` | Renderer → Main | 调用 getStaticData() |
| `electron.sendClientEvent(event)` | Renderer → Main | ipcRenderer.send("client-event") |
| `electron.onServerEvent(cb)` | Main → Renderer | 监听 "server-event" (JSON 字符串) |
| `electron.generateSessionTitle(input)` | Renderer → Main | 调用 SDK 生成标题 |
| `electron.getRecentCwds(limit)` | Renderer → Main | 查询 SessionStore |
| `electron.selectDirectory()` | Renderer → Main | dialog.showOpenDialog |
| `electron.getApiConfig()` | Renderer → Main | 读取配置 |
| `electron.saveApiConfig(config)` | Renderer → Main | 保存配置 |
| `electron.checkApiConfig()` | Renderer → Main | 检查是否有配置 |

#### 3.2.2 类型定义

**根目录 `types.d.ts`** — 声明 `window.electron` 接口
**`src/electron/types.ts`** — ClientEvent / ServerEvent 完整类型定义
**`src/ui/types.ts`** — 前端侧的类型副本（与 electron/types.ts 保持一致）

### 3.3 UI 层 (React)

#### 3.3.1 `App.tsx` — 主布局与事件协调

**布局结构**：
```
┌──────────┬──────────────────────────────────────┐
│          │  [Title Bar: Session Title]           │
│  Sidebar │  ┌────────────────────────────────┐  │
│  (280px) │  │                                │  │
│          │  │  Message Window (scrollable)   │  │
│          │  │                                │  │
│          │  │                                │  │
│          │  └────────────────────────────────┘  │
│          │  [Prompt Input Area]                 │
│          │  [New Messages Button] (optional)    │
└──────────┴──────────────────────────────────────┘
```

**核心状态**：
- `shouldAutoScroll` — 是否自动滚动到底部（仅在用户滚到底部时启用）
- `hasNewMessages` — 是否有未读新消息（用户上滚浏览历史时）
- `partialMessage` — 正在流式输出的部分消息内容
- `showPartialMessage` — 是否显示骨架屏动画

**交互流程**：
```
1. 启动时检查 API 配置 → 无配置则弹出 SettingsModal
2. 连接成功后发送 session.list → 加载会话列表
3. 切换会话 → 按需加载 session.history（懒加载）
4. 用户输入 prompt → 发送 session.start / session.continue
5. 接收 stream.message → 渲染 MessageCard
6. 接收 permission.request → 渲染 DecisionPanel
```

#### 3.3.2 `store/useAppStore.ts` — 全局状态管理

**State 结构**：
```typescript
{
  sessions: Record<string, SessionView>;     // 所有会话
  activeSessionId: string | null;             // 当前激活会话
  prompt: string;                             // 输入框文本
  cwd: string;                                // 工作目录
  pendingStart: boolean;                      // 正在等待启动
  globalError: string | null;                 // 全局错误提示
  showStartModal: boolean;                    // 新建会话弹窗
  showSettingsModal: boolean;                 // 设置弹窗
  historyRequested: Set<string>;              // 已请求过历史的会话
  apiConfigChecked: boolean;                  // 是否已检查过 API 配置

  handleServerEvent: (event: ServerEvent) => void;  // 事件分发
  // ... 其他 setter
}
```

**事件处理逻辑**（handleServerEvent switch）：

| ServerEvent Type | 状态更新行为 |
|-----------------|-------------|
| `session.list` | 重建 sessions 映射，排序后自动选中最新会话 |
| `session.history` | 填充指定会话的 messages，标记 hydrated=true |
| `session.status` | 更新会话状态/标题/CWD；若 pendingStart 则激活该会话 |
| `stream.message` | 追加到指定会话的消息列表末尾 |
| `stream.user_prompt` | 以 user_prompt 类型追加消息 |
| `session.deleted` | 从 sessions 中移除；若被删除的是活跃会话，切换到最近的 |
| `permission.request` | 追加到当前会话的 permissionRequests |
| `runner.error` | 设置 globalError 显示错误提示 Toast |

#### 3.3.3 `hooks/useIPC.ts` — IPC 通信 Hook

**职责**：
- 建立与服务器的长期连接（onServerEvent 订阅）
- 管理 connected 状态
- 提供 sendEvent 方法发送 ClientEvent
- 组件卸载时自动取消订阅

#### 3.3.4 `hooks/useMessageWindow.ts` — 消息窗口虚拟滚动

**职责**：实现**基于用户输入的窗口化渲染**，优化大量消息的性能。

**核心算法**：
```
可见窗口大小: VISIBLE_WINDOW_SIZE = 3 (个用户输入)
每次加载批次: LOAD_BATCH_SIZE = 3

calculateVisibleStartIndex(messages, visibleUserInputCount):
  1. 找到所有 user_prompt 的索引
  2. 若总用户输入数 ≤ visibleUserInputCount → 从索引 0 开始
  3. 否则 → 从第 (total - visibleUserInputCount) 个用户输入处开始

loadMoreMessages():
  visibleUserInputCount += LOAD_BATCH_SIZE  → 向前加载更多

resetToLatest():
  visibleUserInputCount = VISIBLE_WINDOW_SIZE  → 回到最新消息
```

**返回值**：
```typescript
{
  visibleMessages: IndexedMessage[];       // 当前可见的消息（带原始索引）
  hasMoreHistory: boolean;                  // 是否还有更多历史
  isLoadingHistory: boolean;                // 是否正在加载
  loadMoreMessages: () => void;             // 加载更多
  resetToLatest: () => void;                // 回到最新
  totalMessages: number;                    // 总消息数
  totalUserInputs: number;                  // 总用户输入数
  visibleUserInputs: number;                // 当前可见用户输入数
}
```

#### 3.3.5 组件清单

| 组件 | 文件 | 职责 |
|------|------|------|
| **Sidebar** | `components/Sidebar.tsx` | 会话列表、新建/删除/选择会话、复制 resume 命令 |
| **PromptInput** | `components/PromptInput.tsx` | 输入框（自动增高）、发送/停止按钮 |
| **EventCard (MessageCard)** | `components/EventCard.tsx` | 消息卡片渲染器（根据类型分发子组件） |
| **DecisionPanel** | `components/DecisionPanel.tsx` | 权限审批面板 / AskUserQuestion 问答面板 |
| **SettingsModal** | `components/SettingsModal.tsx` | API 配置编辑弹窗 |
| **StartSessionModal** | `components/StartSessionModal.tsx` | 新建会话弹窗（选择目录、输入 prompt） |
| **MDContent** | `render/markdown.tsx` | Markdown 渲染组件（GFM + 代码高亮） |

#### 3.3.6 EventCard 消息渲染策略

`MessageCard` 根据 `StreamMessage` 类型分发到不同子组件：

```
StreamMessage
├── user_prompt → UserMessageCard (Markdown 渲染用户输入)
├── SDKMessage
    ├── system (subtype=init) → SystemInfoCard (Session ID, Model, CWD)
    ├── result (subtype=success/error) → SessionResult / ErrorCard
    ├── assistant
    │   ├── content_block: thinking → AssistantBlockCard ("Thinking" 折叠区)
    │   ├── content_block: text   → AssistantBlockCard ("Assistant" Markdown)
    │   └── content_block: tool_use
    │       ├── AskUserQuestion → AskUserQuestionCard (只读展示)
    │       └── 其他工具      → ToolUseCard (工具名 + 签名信息)
    └── user
        └── content_block: tool_result → ToolResultCard (输出内容, 可展开)
```

**工具状态追踪**：
- 全局 `Map<toolUseId, ToolStatus>` 追踪每个工具调用的完成状态
- `StatusDot` 组件在运行中的会话里对最后一个工具显示脉冲动画

#### 3.3.7 滚动与性能优化

- **IntersectionObserver** 监听顶部 sentinel，当用户上滚接近历史边界时触发 `loadMoreMessages()`
- **滚动位置恢复**：加载历史后计算 scrollHeight 差值，自动调整 scrollTop 保持视觉连续性
- **部分消息骨架屏**：流式输出时使用 shimmer 动画的占位条
- **"New Messages" 浮动按钮**：用户上滚浏览时，有新消息出现则显示 bounce 动画的跳转按钮

---

## 4. 数据流图

### 4.1 新建会话

```
用户点击 "Start Session"
  → 填写 Prompt + 选择 Working Directory
  → 点击 "Start Session" 按钮
  → (Main) generateSessionTitle(userInput)  // 调用 SDK 生成标题
  → (UI) sendClientEvent({ type: "session.start", payload: {...} })
  → (Main) SessionStore.createSession()
  → (Main) emit({ type: "session.status", status: "running" })
  → (Main) runClaude({ prompt, session, onEvent: emit })
  → (Main) query({ prompt })  // SDK 调用
  → (Main) emit({ type: "stream.message", message })  // 每条 SDK 消息
  → (UI) handleServerEvent → Zustand store 更新
  → (UI) 渲染 MessageCard
  → (SDK) 完成 → emit({ type: "session.status", status: "completed" })
```

### 4.2 继续对话

```
用户在 PromptInput 中输入新消息
  → sendClientEvent({ type: "session.continue", sessionId, prompt })
  → (Main) 查找 Session → 验证 claudeSessionId 存在
  → (Main) runClaude({ prompt, resumeSessionId: session.claudeSessionId })
  → SDK 恢复之前的会话上下文，继续执行
```

### 4.3 权限审批

```
SDK 调用工具 → canUseTool 回调触发
  → 工具名为 AskUserQuestion:
    → 生成 toolUseId
    → emit({ type: "permission.request", ... })
    → 创建 Promise 挂起，等待用户响应
  → 其他工具:
    → 直接返回 { behavior: "allow" }

(UI) DecisionPanel 渲染问题
  → 用户选择选项 / 输入文本 / 点击 Allow / Deny
  → sendClientEvent({ type: "permission.response", toolUseId, result })
  → (Main) pendingPermissions.get(toolUseId).resolve(result)
  → (SDK) Promise resolved → 继续执行
```

### 4.4 会话中止

```
用户点击停止按钮
  → sendClientEvent({ type: "session.stop", sessionId })
  → (Main) runnerHandles.get(sessionId).abort()
  → AbortController.abort() → SDK 查询中断
  → emit({ type: "session.status", status: "idle" })
```

---

## 5. SDK Patch 说明

### 5.1 补丁文件

**位置**：`patches/@anthropic-ai/claude-agent-sdk@0.2.6.patch`

### 5.2 变更内容

**问题**：Claude Agent SDK 默认使用 `spawn()` 启动 Claude Code CLI 进程，这在某些环境下（尤其是打包后的 Electron 应用）会出现路径解析和环境变量传递问题。

**解决方案**：将 `spawn` 替换为 `fork`：

```diff
-import { spawn } from "child_process";
+import { fork } from "child_process";
```

**具体变更**：
1. 导入改为 `fork`
2. `spawnLocalProcess` 中移除 `command` 参数（fork 只需要模块路径）
3. 使用 `fork(args[0], args.slice(1), { stdio: [..., "ipc"], env })` 启动
4. 增加 SDK 调试日志输出

**效果**：`fork()` 使子进程与父进程共享相同的 Node.js 实例，通过 IPC 通道通信，避免了 `spawn()` 需要额外查找可执行文件的问题，更适合 Electron 打包环境。

---

## 6. 颜色主题系统

基于 Tailwind CSS v4 的 `@theme` 配置，定义了完整的语义化色彩体系：

| 类别 | 变量 | 用途 |
|------|------|------|
| 背景色 | surface / surface-secondary / surface-tertiary / surface-cream | 多层级卡片、面板背景 |
| 文字色 | ink-900 ~ ink-400 | 正文、次要文字、占位符 |
| 强调色 | accent (#D97757) | 品牌色、按钮、链接 |
| 状态色 | success / info / error | 会话状态、结果标识 |
| 辅助色 | muted / muted-light | 次要描述性文字 |

---

## 7. 构建与部署

### 7.1 开发模式

```bash
bun run dev              # 同时启动 Vite + Electron
bun run dev:react        # 仅 Vite (http://localhost:5173)
bun run dev:electron     # 仅 Electron (连接 Vite dev server)
```

### 7.2 生产构建

```bash
bun run build            # tsc + vite build (产出 dist-react/)
bun run transpile:electron  # TypeScript → dist-electron/
bun run dist:mac-arm64   # macOS Apple Silicon DMG
bun run dist:mac-x64     # macOS Intel DMG
bun run dist:win         # Windows 便携版
bun run dist:linux       # Linux AppImage
```

### 7.3 打包配置 (electron-builder.json)

- **App ID**: `com.devagentforge.agentcowork`
- **打包文件**: `dist-electron/`, `dist-react/`
- **额外资源**: `dist-electron/preload.cjs`
- **asarUnpack**: `node_modules/@anthropic-ai/claude-agent-sdk/**/*` （SDK 不解包，需直接访问）
- **图标**: `claude-color.png`

---

## 8. 关键设计决策

| 决策 | 理由 |
|------|------|
| 使用 Zustand 而非 Redux | 轻量、无需 boilerplate、与 React 19 兼容性好 |
| SQLite (better-sqlite3) 持久化 | 单文件数据库，适合桌面端轻量存储；WAL 模式提升并发写入 |
| 基于用户输入的窗口化渲染 | Claude 会话可能产生数百条消息，按用户输入分批渲染平衡性能和可读性 |
| fork 而非 spawn 启动 SDK | 避免 Electron 打包后找不到 Claude Code CLI 路径的问题 |
| 配置双源（UI + settings.json） | 兼容已有 Claude CLI 用户，也支持首次使用的图形化配置 |
| IPC 事件采用 JSON 字符串传输 | 跨进程通信序列化的简单可靠方式；服务端统一序列化减少重复 |
| 工具权限分级审批 | AskUserQuestion 需要用户交互，其他工具自动批准，平衡安全性与自动化 |

---

## 9. 文件结构总览

```
Open-Claude-Cowork/
├── package.json                          # 项目依赖与脚本
├── electron-builder.json                 # 打包配置
├── vite.config.ts                        # Vite 构建配置
├── tsconfig.app.json                     # UI TypeScript 配置
├── tsconfig.node.json                    # Node/Electron TypeScript 配置
├── types.d.ts                            # 全局 window.electron 类型声明
├── patches/                              # npm patch 文件
│   └── @anthropic-ai/claude-agent-sdk@0.2.6.patch
├── src/
│   ├── electron/                         # Electron Main 进程代码
│   │   ├── main.ts                       # 入口、窗口管理、IPC 注册
│   │   ├── ipc-handlers.ts               # 事件分发、会话调度
│   │   ├── preload.cts                   # Context Bridge 暴露 API
│   │   ├── types.ts                      # ClientEvent / ServerEvent 类型
│   │   ├── util.ts                       # DEV_PORT, isDev, IPC 工具函数
│   │   ├── pathResolver.ts               # 路径解析 (开发/生产)
│   │   ├── test.ts                       # 系统资源监控
│   │   └── libs/
│   │       ├── runner.ts                 # Claude Agent 执行引擎
│   │       ├── session-store.ts          # SQLite 会话持久化
│   │       ├── config-store.ts           # API 配置 JSON 存储
│   │       └── claude-settings.ts        # 配置管理与环境变量构建
│   │
│   └── ui/                               # React 前端代码
│       ├── main.tsx                      # React 入口
│       ├── App.tsx                       # 主布局与事件协调
│       ├── index.css                     # Tailwind + 自定义主题
│       ├── types.ts                      # 前端类型定义 (与 electron/types.ts 一致)
│       ├── store/
│       │   └── useAppStore.ts            # Zustand 全局状态管理
│       ├── hooks/
│       │   ├── useIPC.ts                 # IPC 通信 Hook
│       │   └── useMessageWindow.ts       # 消息窗口虚拟滚动 Hook
│       ├── components/
│       │   ├── Sidebar.tsx               # 侧边栏会话列表
│       │   ├── PromptInput.tsx           # 底部输入框
│       │   ├── EventCard.tsx             # 消息卡片渲染器
│       │   ├── DecisionPanel.tsx         # 权限审批面板
│       │   ├── SettingsModal.tsx         # API 设置弹窗
│       │   └── StartSessionModal.tsx     # 新建会话弹窗
│       └── render/
│           └── markdown.tsx              # Markdown 渲染组件
│
├── dist-electron/                        # 编译后的 Electron 代码 (gitignore)
├── dist-react/                           # 编译后的 React 代码 (gitignore)
└── assets/                               # 合作伙伴资源
```

---

## 10. 待办事项（Roadmap）

根据 README 中的规划，以下为计划中的功能方向：

- [ ] 更多平台支持（Windows/Linux 正式构建）
- [ ] 会话导出与分享
- [ ] 自定义工具白名单配置
- [ ] 多模型切换支持
- [ ] 暗色主题
- [ ] 键盘快捷键完善
- [ ] 错误日志与诊断面板
