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

- 连续两次以上的 Bash、读文件、搜索调用（连同中间的 Think）折成一行摘要 `▸ Bash ×6 · Read ×2 · 14s`。摘要原地增长：正在跑的命令和计时就显示在这一行上，新的调用只让计数加一，不会先冒出一张卡再收起来。改文件、报错、非零退出码、子 agent 和 agent 说的话会打断折叠，照常单独显示。
- 单条 Bash 运行时只有一行命令加计时，不滚动输出；结束后也只有这一行。命令失败时多一行退出码，工具报错时显示错误内容。
- Think 进行时是 `⠼ Thinking…`，结束后是 `* Thinking`，不显示思考文字。
- 想看完整的命令、输出或思考内容：`Ctrl+O` 展开全部，或者点那一行（点摘要行展开这一组）。

配置分三层：

| 层 | 管什么 | 来源 | 装到哪里 |
|---|---|---|---|
| dsh-TUI 本体 | 用 fork 版：多了 `compactTools` 设置和 `thinkingFold: status` 选项 | [parkgogogo/dsh-TUI](https://github.com/parkgogogo/dsh-TUI) 的 `unixporn` 分支，`install-fork.sh` 编译安装 | `~/.dsh/profiles/dsh-tui` |
| `/settings` 选项 | 极简界面、关掉开屏、紧凑工具卡、Think 只显示状态等 | `settings.json` | 合并进 `~/.dsh-tui/settings.json` |
| 配色主题 | Claude Dark (1e1e1e) | `claude-dark-1e1e1e.json` | `~/.dsh-tui/themes/`，并在 `~/.dsh-tui/theme.json` 里选中 |

为什么用 fork：上游 dsh-TUI 0.16.1 的设置项做不到想要的效果。Think 只能选「预览三行」或「完整显示」；Bash 卡片折叠时固定显示三行输出，运行时显示八行实时输出；连续折叠只对后台任务（`jobGroupFold`）有效，普通工具调用不折；读图片的卡片会打出给模型看的原始文本，还会占一块 12 行高的缩略图。fork 把这些做成了正式设置项（默认值和上游一样，关着），本目录的 `settings.json` 把它们打开。

原机环境：macOS，Node 25.8.1，pnpm 10.32.1（编译 fork 需要 pnpm 11，`corepack` 或 `npm i -g pnpm@11`），dsh 0.2.0-rc.2，dsh-tui 0.16.1（fork 基于上游 `main` 的 `a40c305a`），终端是 Orca + Claude Dark 主题。

规则：`apply.mjs` 覆盖 `~/.dsh-tui/settings.json` 前会自动备份成 `settings.json.bak-<时间戳>`；每一步都按「验证」核对，通过了才算完成。

---

## 1. 安装 dsh 和 dsh-TUI fork

需要 Node 22.19 以上、pnpm 11、git。

```sh
npm install -g @deepseek-ai/dsh
npm install -g --legacy-peer-deps @deepseek-harness-tui/dsh-tui   # 只为了拿到 dsh-tui 启动命令
dsh-tui   # 第一次运行会初始化 ~/.dsh/profiles/dsh-tui，并走首次设置向导（API key 等），完成后退出
sh install-fork.sh
```

`install-fork.sh` 做的事：把 fork 克隆到 `~/labs/dsh-TUI`（已有就拉最新；换位置用 `DSH_TUI_SRC=/path sh install-fork.sh`），拉子模块 `vendor/dsh-std`，`pnpm install` + `pnpm build`（编译加上游自带的全部构建检查，几分钟），`npm pack` 打成 `~/.dsh-tui/fork/dsh-tui-<提交>-<时间>.tgz`，最后 `dsh plugin --profile dsh-tui add` 这个 tarball，装好后删掉旧的 tarball。文件名里带提交和时间，是因为 pnpm 看到 `file:` 依赖路径没变就不重装，哪怕内容变了。profile 的 `package.json` 会记下 tarball 路径，所以别删 `~/.dsh-tui/fork/`。

全局装的那个 `@deepseek-harness-tui/dsh-tui` 只是启动器，真正运行的是 profile 里的这份。

**验证：** `ls ~/.dsh/profiles/dsh-tui/node_modules/@deepseek-harness-tui/dsh-tui/lib/types/components/Chat/ToolGroup.js` 存在（只有 fork 有这个文件）。

## 2. 应用配置

先退出所有正在运行的 dsh-TUI（运行中的 TUI 会用内存里的设置覆盖文件）。然后在本目录运行：

```sh
node apply.mjs
```

期望输出三行都是 `✓`：settings 合并、主题安装并选中、profile 里装的是 fork。

如果最后一行是 `✗ … is the npm release`，说明装的是上游原版（比如在 TUI 里跑了 `/update`），回第 1 步重跑 `sh install-fork.sh`。

如果设置了环境变量 `DSH_TUI_THEME`，它会盖过 `theme.json`，脚本会提示。需要的话把它去掉。

**验证：**

```sh
node apply.mjs check
```

三行都是 `✓`。然后启动 `dsh-tui`，运行 `/theme status`，显示 `Current theme claude-dark-1e1e1e`。

最后让 agent 跑一条有多行输出的命令，比如发一句「用 bash 运行 `sleep 3; seq 1 50`，然后只回复 ok」：运行中只看到一行 `• Bash(sleep 3; seq 1 50) · 1s` 在计时，结束后还是这一行，没有输出内容。再发一个需要思考的问题，思考时只出现 `⠼ Thinking…`。最后发「用 bash 依次单独运行 pwd、ls、echo hi，每条一次工具调用，然后回复 ok」：三条命令折成一行 `▸ Bash ×3 · 0s`，`Ctrl+O` 能展开成三张卡片。

## 3. 撤销

换回上游原版：

```sh
dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui
```

原版不认识 `compactTools` 和 `thinkingFold: status`，会按默认值显示。设置和主题在 dsh-TUI 里用 `/settings` 和 `/theme` 改回去就行；`/settings` 里「极简界面」关掉之后，`settings.json` 里的 `statusBar` 那一组选项才会生效。

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
| `compactTools` | `true` | fork 才有。紧凑工具卡：Bash 和读图片只剩一行；连续的 Bash/读文件/搜索折成一行摘要，详见下一节 |
| `thinkingFold` | `status` | fork 才有 `status` 这个值：Think 只显示转圈和耗时，不显示思考文字，也不显示 `(ctrl+o to expand)` |
| `jobGroupFold` | `always` | 两个以上连续的后台任务就合成一组 |
| `toolBackground` | `none` | 工具卡片不加底色 |
| `codeFrameStyle` | `light` | 代码块只有左侧竖线，没有封闭边框 |
| `scrollGutter` | `scrollbar` | 右侧是滚动条，不是时间线刻度 |
| `pageMargin` | `slim` | 界面四周留窄边 |
| `statusBar.*` | 见文件 | 只在关掉极简界面时生效：保留模型、推理强度、目录、git 分支、上下文占用、目标、模式，关掉缓存、费用、token、TPS 等 |

## fork 改了什么

改动都在 [parkgogogo/dsh-TUI](https://github.com/parkgogogo/dsh-TUI) 的 `unixporn` 分支，是上游 `main` 之上的两个提交（`feat(transcript): compactTools setting and thinkingFold "status"` 和 `fix(transcript): grow compact tool runs in place`），只改 `src/`，按上游规矩过了 `pnpm build` 的全部检查。两个新东西都是 `/settings` 里的正式选项，默认关，`settings.json` 打开。

`compactTools`（新文件 `src/components/Chat/ToolGroup.tsx`，加上 `MessageList.tsx`、`AssistantToolUseMessage.tsx` 和设置的接线）：

1. 终端卡（Bash/PowerShell）收起时只剩标题一行：运行中不滚动输出，结束后不显示输出，耗时在标题右边计时；命令很长时截断成一行，耗时不会被挤到第二行。
2. `read_image` 收起时也只剩一行，不显示给模型看的 `<path>…<type>image</type>…` 文本，也不显示缩略图（没有图形协议的终端里那是一块 12 行的空白）。
3. 连续两次以上的读文件、搜索、终端调用合成一组（`toolGroupable`：卡片类型是 terminal、read、search，或工具名在 `GROUPABLE_TOOL_NAMES` 里），中间的 Think 一起收进去，结尾的 Think 不收。组头一行写各工具的次数和总耗时；正在运行的那条也收进组里，组头这一行显示它的命令，耗时每秒走动，所以整组始终只有一行、原地增长。
4. 报错、非零退出码、被信号杀掉的命令照常显示错误内容，也不进组；改文件（diff）、todo、提问、子 agent 和 agent 的文字会把组断开。
5. 点组头或 `Ctrl+O` 展开；展开后卡片、输出和图片都照常显示。
6. 模型在两次调用之间先发出一段空回复时，不再画一个孤零零的 `●`（底部的转圈状态已经说明它在干活）；真有文字到了才显示。

`thinkingFold: status`（`AssistantThinkingMessage.tsx`、`MessageList.tsx`）：Think 行只有转圈加 `Thinking…`，结束后是 `* Thinking`，不显示思考文字和 `(ctrl+o to expand)`；`Ctrl+O` 照样能看全文。

顺带：极简界面下 Think 的转圈用主题强调色（Claude 橙），上游是去掉颜色。

## 升级 dsh-TUI

不要在 TUI 里用 `/update`，那会装回上游原版（`node apply.mjs check` 会报出来，重跑 `sh install-fork.sh` 就回来了）。要跟上游，先把 fork 的分支 rebase 到上游最新：

```sh
cd ~/labs/dsh-TUI
git fetch upstream
git rebase upstream/main          # 冲突一般在设置接线的列表里，两边都留
pnpm install --frozen-lockfile && pnpm build
git push --force-with-lease origin unixporn
sh ~/labs/unixporn/DSH-TUI/install-fork.sh
```

`pnpm build` 通过之后，再按第 2 步的「验证」实际跑一遍，最后更新上面「原机环境」里的版本号。

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
