# DSH TUI · Claude Dark

这是一份写给 agent 的操作手册：在任何一台 Mac 上把 [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)（DeepSeek Harness 的终端界面）复现成和原机**完全一致**，并在配置变化后把改动写回本仓库。

目标是干净：没有开屏大字和吉祥物，不显示 emoji；Bash 只占一行，连续的 Bash/读文件/搜索折成一行摘要；Think 只显示状态，不显示思考内容；配色和 [`Orca/`](../Orca/README.md) 的终端主题是同一套 Claude Dark（`#1e1e1e`）。

效果：

```text
 ❯ 跑一下测试
 * Thinking
 ▸ Bash ×6 · Read ×2 · 14s
 • Bash(ls /nonexistent) · 0s
  ⎿ Exit code 1
 ▸ Bash ×2
 • Bash(pnpm test) · 12s
 ⏺ 全部通过。
 ╭──────────────────────────────────────────────╮
 ⌸ ❯
 ╰──────────────────────────────────────────────╯
  deepseek-flash · high · cache 97% · ≈¥0.01 · repo     ctx 0.9%
```

- 连续两次以上的 Bash、读文件、搜索调用（连同中间的 Think）折成一行摘要 `▸ Bash ×6 · Read ×2 · 14s`。正在跑的那条单独显示在摘要下面，跑完就收进摘要。改文件、报错、非零退出码、子 agent 和 agent 说的话会打断折叠，照常单独显示。
- 单条 Bash 运行时只有一行命令加计时，不滚动输出；结束后也只有这一行。命令失败时多一行退出码，工具报错时显示错误内容。
- Think 进行时是 `⠼ Thinking…`，结束后是 `* Thinking`，不显示思考文字。
- 想看完整的命令、输出或思考内容：`Ctrl+O` 展开全部，或者点那一行（点摘要行展开这一组）。

配置分三层：

| 层 | 管什么 | 本目录里的文件 | 装到哪里 |
|---|---|---|---|
| `/settings` 选项 | 极简界面、关掉开屏、命令折成一行等 | `settings.json` | 合并进 `~/.dsh-tui/settings.json` |
| 配色主题 | Claude Dark (1e1e1e) | `claude-dark-1e1e1e.json` | `~/.dsh-tui/themes/`，并在 `~/.dsh-tui/theme.json` 里选中 |
| 渲染补丁 | Bash 一行、连续工具调用折叠、Think 只显示状态 | `apply.mjs` 里的 `PATCHES` | 改 profile 里 dsh-tui 包的三个 JS 文件 |

前两层用的是 dsh-TUI 自带的配置功能。第三层是补丁，因为 dsh-TUI 0.16.1 的设置项做不到：Think 只能选「预览三行」或「完整显示」，Bash 卡片在折叠时固定显示三行输出、运行时显示八行实时输出，连续折叠只对后台任务（`jobGroupFold`）有效，普通工具调用不折。

三层都由 `apply.mjs` 一次装好，脚本可以重复运行。

原机环境：macOS，Node 25.8.1，pnpm 10.32.1，dsh 0.2.0-rc.2，dsh-tui 0.16.1，终端是 Orca + Claude Dark 主题。

规则：脚本覆盖 `~/.dsh-tui/settings.json` 前会自动备份成 `settings.json.bak-<时间戳>`，打补丁前会把原文件存成 `*.unixporn-orig`；每一步都按「验证」核对，通过了才算完成。

---

## 1. 安装 dsh 和 dsh-TUI（已安装就跳过）

需要 Node 22.19 以上和 pnpm。

```sh
npm install -g @deepseek-ai/dsh
npm install -g --legacy-peer-deps @deepseek-harness-tui/dsh-tui
dsh-tui   # 第一次运行会初始化 ~/.dsh/profiles/dsh-tui，并走首次设置向导（API key 等），完成后退出
```

**验证：** `ls ~/.dsh/profiles/dsh-tui/node_modules/@deepseek-harness-tui/dsh-tui/package.json` 存在。

## 2. 应用配置

先退出所有正在运行的 dsh-TUI（运行中的 TUI 会用内存里的设置覆盖文件）。然后在本目录运行：

```sh
node apply.mjs
```

期望输出五行都是 `✓`：settings 合并、主题安装并选中、三个 JS 文件打上补丁。

如果某个文件报 `anchors drifted, file left untouched`，说明 dsh-TUI 升级后代码变了，补丁对不上。这时那个文件保持原样，其余两层照常生效；按「dsh-TUI 升级之后」一节更新补丁。

如果设置了环境变量 `DSH_TUI_THEME`，它会盖过 `theme.json`，脚本会提示。需要的话把它去掉。

**验证：**

```sh
node apply.mjs check
```

五行都是 `✓`。然后启动 `dsh-tui`，运行 `/theme status`，显示 `Current theme claude-dark-1e1e1e`。

最后让 agent 跑一条有多行输出的命令，比如发一句「用 bash 运行 `sleep 3; seq 1 50`，然后只回复 ok」：运行中只看到一行 `• Bash(sleep 3; seq 1 50) · 1s` 在计时，结束后还是这一行，没有输出内容。再发一个需要思考的问题，思考时只出现 `⠼ Thinking…`。最后发「用 bash 依次单独运行 pwd、ls、echo hi，每条一次工具调用，然后回复 ok」：三条命令折成一行 `▸ Bash ×3 · 0s`，`Ctrl+O` 能展开成三张卡片。

## 3. 撤销

```sh
node apply.mjs revert
```

只撤销渲染补丁，从 `*.unixporn-orig` 还原原文件；备份丢了会报错，这时重装 dsh-TUI。设置和主题在 dsh-TUI 里用 `/settings` 和 `/theme` 改回去就行；`/settings` 里「极简界面」关掉之后，`settings.json` 里的 `statusBar` 那一组选项才会生效。

---

## 设置项说明

`settings.json` 里的键和 dsh-TUI `/settings` 里的选项一一对应：

| 键 | 值 | 作用 |
|---|---|---|
| `minimal` | `true` | 极简界面：去掉开屏大字、emoji 和装饰色，状态栏固定成模型、推理强度、缓存、费用、目录、上下文占用。只影响界面，和 `/preset` 里的 minimal 不是一回事 |
| `launchpad` | `false` | 启动直接进对话，不进落地页 |
| `whale` / `whaleIdle` | `false` | 关掉吉祥物和它的待机动画 |
| `recapOnOpen` | `false` | 打开会话时不自动生成摘要 |
| `turnUsageRow` | `false` | 每轮结束时不显示 token 用量行 |
| `foldTerminalCommand` | `true` | 多行命令只显示第一行加 `+N lines` |
| `thinkingFold` | `preview` | 补丁依赖这个值：进行中的 Think 走「预览」分支，补丁把这个分支改成只显示状态 |
| `jobGroupFold` | `always` | 两个以上连续的后台任务就合成一组 |
| `toolBackground` | `none` | 工具卡片不加底色 |
| `codeFrameStyle` | `light` | 代码块只有左侧竖线，没有封闭边框 |
| `scrollGutter` | `scrollbar` | 右侧是滚动条，不是时间线刻度 |
| `pageMargin` | `slim` | 界面四周留窄边 |
| `statusBar.*` | 见文件 | 只在关掉极简界面时生效：保留模型、推理强度、目录、git 分支、上下文占用、目标、模式，关掉缓存、费用、token、TPS 等 |

## 渲染补丁说明

补丁改三个文件，都在 `~/.dsh/profiles/<profile>/node_modules/@deepseek-harness-tui/dsh-tui/lib/types/components/` 下。`$DSH_HOME/profiles` 下的每个 profile（`dsh-tui`、救援 profile 等）都会打。打过的文件第一行是 `/* unixporn-patch v2 */`。

`MessageList.js`（对话列表）：

1. 连续的读文件/搜索/终端调用（`toolGroupable`：卡片类型是 terminal、read、search，或工具名在 `GROUP_TOOL_NAMES` 里），两次以上就合成一组；中间的 Think 行一起收进去，结尾的 Think 不收。
2. 组头一行写各工具的次数和总耗时，组员不显示；正在运行的组员留在组头下面。
3. 报错、非零退出码、被信号杀掉的命令不进组，照常显示。改文件（diff）、todo、提问、子 agent 和 agent 的文字会把组断开。
4. 点组头或 `Ctrl+O` 展开。

`messages/AssistantToolUseMessage.js`（终端卡片，即 Bash/PowerShell；只在折叠时生效，`Ctrl+O` 展开后一切照旧）：

1. 运行中不显示实时输出行。
2. 不显示输出内容。工具报错和非零退出码照常显示。
3. 运行中在标题行右侧显示计时（原来只在结束后显示）。
4. 命令很长时截断成一行，不换行；鼠标悬停显示完整命令。
5. 导出 `displayName`，给上面的组头用。

`messages/AssistantThinkingMessage.js`：

1. 进行中只显示转圈加 `Thinking…`，不显示三行思考预览。
2. 结束后去掉 `(ctrl+o to expand)` 提示。
3. 转圈的颜色跟随主题的强调色（Claude 橙），不再固定用 DeepSeek 蓝。

每处修改都用精确的字符串匹配，并检查匹配次数。有一处对不上，整个文件就不改，脚本以非零状态退出。

改了 `PATCHES` 就把 `MARK` 里的版本号加一（`v2` → `v3`）。脚本看到旧版本号的文件，会从 `*.unixporn-orig` 重新打补丁；不加版本号的话，已经打过的机器会一直报 `already patched`，新补丁打不上去。

## dsh-TUI 升级之后

`/update`、`dsh plugin --profile dsh-tui ...` 或重装都会换掉包文件，补丁随之消失（设置和主题不受影响）。升级之后重新运行：

```sh
node apply.mjs
```

如果报 `anchors drifted`：在新版本的对应文件里找到同样逻辑的新写法，更新 `apply.mjs` 里 `PATCHES` 的查找串和替换串，直到 `node apply.mjs` 全部 `✓`，再按第 2 步的「验证」实际跑一遍，最后把新的 `apply.mjs` 提交回仓库，并更新上面「原机环境」里的版本号。

---

## 配色（Claude Dark 1e1e1e）

以 `dark` 为基础覆盖。原则和终端主题一致：Claude 橙是唯一的高饱和色，其余颜色都取自终端的 16 色。

| 角色 | 颜色 |
|---|---|
| 强调（焦点、活动、你的消息、链接） | `#d97757`，浅一档 `#e8a58a` |
| 正文 / 次要 / 更次要 | `#e8e6dc` / `#9a988f` / `#6b6a65` |
| 输入框边框 | `#3a3a3a`（中性灰） |
| 工具名：修改类 / 执行类 | `#e2b56a` / `#6fb0a5` |
| 成功 / 警告 / 错误 | `#93a86f` / `#e2b56a` / `#e5636f` |
| 卡片底色 / 选中底色 | `#2a2a2a` / `#4a3a33` |
| 上下文进度条 | 从 `#3d2b24` 到 `#d97757` 的橙色渐变 |

注意：主题名不能叫 `claude-dark`。dsh-TUI 有一个同名的内置主题（Claude 后端用的），会把自定义的同名主题挡掉。

---

## 把改动写回仓库

用户在 dsh-TUI 里用 `/settings` 调整之后，把 `~/.dsh-tui/settings.json` 里 `values` 下的改动同步到本目录的 `settings.json`（只同步外观相关的键），并更新上面的设置项表格。改了配色就同步 `claude-dark-1e1e1e.json` 和色表。最后提交并推送。
