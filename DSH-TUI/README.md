# DSH TUI · Claude Dark

这是一份写给 agent 的操作手册：在任何一台 Mac 上把 [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)（DeepSeek Harness 的终端界面）复现成和原机**完全一致**，并在配置变化后把改动写回本仓库。

目标是干净：没有开屏大字和吉祥物，不显示 emoji；Bash、读文件、搜索从第一次调用起就是一行摘要，连续的共用这一行；Think 只显示状态，不显示思考内容；配色和 [`Orca/`](../Orca/README.md) 的终端主题是同一套 Claude Dark（`#1e1e1e`）。

效果：

```text
 ❯ 跑一下测试
 * Thinking
   Read 2 files, ran 6 shell commands
 • Bash(ls /nonexistent) · 0s
  ⎿ Exit code 1
   Ran 2 shell commands
 ⏺ 全部通过。
 ╭──────────────────────────────────────────────╮
 ⌸ ❯
 ╰──────────────────────────────────────────────╯
  deepseek-flash · high · cache 97% · ≈¥0.01 · repo     ctx 0.9%
```

- Bash、读文件、读图片、搜索调用从第一次起就显示成一行灰色的句子，和正文左对齐：`Ran 1 shell command`。后面连续的调用（连同中间和之后的 Think）共用这一行：`Read 2 files, ran 6 shell commands`。没有符号、没有计时、不显示命令和输出。
- 这一行原地变化：还在运行的那类调用写成进行时，末尾加 `…`（`Read 2 files, running 3 shell commands…`），跑完只改这一处；新调用只改数字，不会先冒出一张卡再收起来。
- 改文件、报错、非零退出码、子 agent 和 agent 说的话会打断折叠，照常单独显示；命令失败时多一行退出码，工具报错时显示错误内容。
- Think 进行时是 `⠼ Thinking…`，结束后是 `* Thinking`，不显示思考文字。
- 想看完整的命令、输出或思考内容：`Ctrl+O` 展开全部，或者点那一行（点摘要行展开这一组）。

配置分三层，外加一个接入 Orca 的插件：

| 层 | 管什么 | 来源 | 装到哪里 |
|---|---|---|---|
| dsh-TUI 本体 | 用 fork 版：多了 `compactTools` 设置和 `thinkingFold: status` 选项 | [parkgogogo/dsh-TUI](https://github.com/parkgogogo/dsh-TUI) 的 `unixporn` 分支，`install-fork.sh` 编译安装 | `~/.dsh/profiles/dsh-tui` |
| `/settings` 选项 | 极简界面、关掉开屏、紧凑工具卡、Think 只显示状态等 | `settings.json` | 合并进 `~/.dsh-tui/settings.json` |
| 配色主题 | Claude Dark (1e1e1e) | `claude-dark-1e1e1e.json` | `~/.dsh-tui/themes/`，并在 `~/.dsh-tui/theme.json` 里选中 |
| Orca 集成 | Orca 里的 DSH 状态和会话历史（见第 4 节） | `orca-bridge/`，`node orca-bridge/install.mjs` 安装 | `~/.dsh/profiles/dsh-tui/cordis.patch.yml` 里的一段 |

为什么用 fork：上游 dsh-TUI 0.16.1 的设置项做不到想要的效果。Think 只能选「预览三行」或「完整显示」；Bash 卡片折叠时固定显示三行输出，运行时显示八行实时输出；连续折叠只对后台任务（`jobGroupFold`）有效，普通工具调用不折；读图片的卡片会打出给模型看的原始文本，还会占一块 12 行高的缩略图。fork 把这些做成了正式设置项（默认值和上游一样，关着），本目录的 `settings.json` 把它们打开。

原机环境：macOS，Node 25.8.1，pnpm 10.32.1（编译 fork 需要 pnpm 11，`corepack` 或 `npm i -g pnpm@11`），dsh 0.2.0-rc.2，dsh-tui 0.16.1（fork 基于上游 `main` 的 `a40c305a`），终端是 Orca 1.4.227 + Claude Dark 主题。

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

最后让 agent 跑一条有多行输出的命令，比如发一句「用 bash 运行 `sleep 3; seq 1 50`，然后只回复 ok」：运行中只看到一行 `Running 1 shell command…`，结束后变成 `Ran 1 shell command`，没有输出内容；点一下这一行展开成带输出的卡片，再点收回。再发一个需要思考的问题，思考时只出现 `⠼ Thinking…`。最后发「用 bash 依次单独运行 pwd、ls、echo hi，每条一次工具调用，然后回复 ok」：三条命令折成一行 `Ran 3 shell commands`，`Ctrl+O` 能展开成三张卡片。

## 3. 撤销

换回上游原版：

```sh
dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui
```

原版不认识 `compactTools` 和 `thinkingFold: status`，会按默认值显示。设置和主题在 dsh-TUI 里用 `/settings` 和 `/theme` 改回去就行；`/settings` 里「极简界面」关掉之后，`settings.json` 里的 `statusBar` 那一组选项才会生效。

## 4. 接入 Orca：状态和会话历史

不装这一步，Orca 里的 DSH 有两个问题（截至 Orca 1.4.227）：

- **看不到历史。** Orca 的 Session History 扫描器是写死的白名单，每种 agent 一个目录和解析器，没有 DSH，也没有接口可以加。DSH 的会话存成 `~/.dsh/sessions/<目录>/<会话 id>/session.v4.jsonl.zstd`（每次写入追加一个 zstd 帧的事件日志），Orca 不认识。
- **状态不同步。** Orca 自带一套 DSH 状态 hook，但它只在 Orca 启动时、并且 PATH 上已经有 `dsh` 才装（原机 Orca 比 dsh 早 5 分钟启动，所以一直没装上）。就算装上，它走的是 DSH 通用的 Claude Code hooks 桥，有三处缺口：DSH 弹审批等你时，Orca 显示「工作中」；Stop 不带回复正文，侧栏预览和通知显示的是最后一条工具输出；出错或中断的轮次不发 Stop，Orca 一直停在「工作中」。

方案是一个 DSH 插件 [`orca-bridge/`](orca-bridge/)，由 dsh-tui profile 的 patch 层加载，跑在 dsh-tui 进程里，直接用 DSH 自己的事件。Orca 和 DSH 的源码都不改：

```text
dsh-tui 进程
 └─ orca-bridge 插件
     ├─ 状态：session/event、tools/pre-execute、tools/post-execute、agent/turn-stopping、agent/status
     │    → POST 127.0.0.1:<端口>/hook/dsh（Orca 自己的 hook 脚本用的同一个接口）
     │    → Orca 侧栏：工作中 / 等你 / 完成、提示词、工具、回复预览、通知
     └─ 历史：会话变化 1.5 秒后，起一个脱离的子进程 orca-dsh-sync
          → ~/.prime/agent/sessions/…（pi 格式；Orca 内置的 Prime Agent 扫这个目录）
          → Orca 的 Session History 和 orca search；点恢复 → orca-dsh → dsh-tui --resume <会话 id>
```

### 状态

插件只在 Orca 的终端里工作（看环境变量 `ORCA_PANE_KEY`），每次发送前重读 Orca 的端点文件，所以 Orca 重启过、终端没重开也能连上新端口。连不上就丢掉这条状态，不会影响 DSH。

两种模式，插件启动时自动选：

| 情况 | 插件发什么 |
|---|---|
| Orca 还没装自己的 DSH hook（`~/.dsh/cordis.patch.yml` 里没有 `orca-agent-hooks`） | 全部：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop |
| Orca 已经装了 | 只补缺口：审批时的「等你」、带回复正文的 Stop、出错或中断轮次的 Stop。其余由 Orca 的 hook 发，不重复。插件的 Stop 比 Orca 那条早到（实测早 30 毫秒），通知里就是回复正文 |

- 审批：DSH 弹审批时，插件发一个工具名为 `AskUserQuestion` 的 PreToolUse。Orca 把这个工具名当成「在等用户回答」，问题内容是「Allow bash? <DSH 给的理由>」。审批结束发对应的 PostToolUse，回到「工作中」。注意原机的权限是 `danger-full-access`，平时不会弹审批；`ask_user_question` 提问一直都显示「等你」。
- 只有主 agent 改 pane 的状态，子 agent 的工具调用和轮次不算（Orca 自己也忽略子 agent）。子 agent 的审批照样显示「等你」，因为它也在等你。
- 会话 id 跟着发过去，Orca 重启后恢复这个 pane 时用的是 `dsh-tui --resume <id>`，回到同一个会话。

### 历史

- 只读 DSH 的数据，不写。
- 只镜像主会话：子 agent 的日志跳过；fork 出来的会话只放它自己的轮次（继承来的部分在最后一个标了 `inherited` 的 `session/end-seed` 处切掉），没有自己的标题时用父会话的。
- 内容对应：只保留你自己打的字，审批通知、运行时上下文、技能目录这些注入的 user 消息丢掉；助手的 `text`、`reasoning`、`tool-call` 转成 pi 的 `text`、`thinking`、`toolCall`；`tool/result` 转成 `toolResult`；图片只留 `[image: 文件名]`；带上模型名和 token 用量。
- 时机：会话有变化 1.5 秒后同步一次，在子进程里跑，不卡 TUI，DSH 退出时还没跑的那次也会跑完。dsh-tui 启动 3 秒后再做一次全量，这时补上别的 profile 写的会话、删掉已经没有源文件的镜像。
- 镜像目录里只改动、删除自己写的文件：记在 `~/.dsh-orca-bridge/manifest.json`，文件头也带 `"generator": "dsh-orca-bridge"` 标记。几个 DSH 同时运行时用锁排队。

### 安装

```sh
node orca-bridge/install.mjs
```

它做三件事，都可以撤销：在 `~/.dsh/profiles/dsh-tui/cordis.patch.yml` 末尾加一段带标记的配置加载插件（原来的内容不动；新 profile 的 `[]` 会被去掉，卸载时放回）；建两个软链接 `~/.local/bin/orca-dsh` 和 `orca-dsh-sync`；先把已有会话镜像一遍。期望输出：

```text
✓ ~/.dsh/profiles/dsh-tui/cordis.patch.yml: loads …/orca-bridge/index.js
✓ ~/.local/bin/orca-dsh, orca-dsh-sync
✓ mirrored: 135 written, 0 unchanged, 0 skipped, 0 removed, 0 failed
✗ Orca: Prime Agent command is not set
✓ Orca: its own DSH status hook is not installed; the plugin sends every status event itself
```

然后：

1. 重启正在运行的 dsh-tui，插件在启动时加载。
2. 在 Orca 里打开 **Settings → Agents → Prime Agent**，把 **Command** 设成 `orca-dsh`。整个方案只有这一步要动 Orca 的设置：Orca 恢复 Prime Agent 会话时执行 `cd <目录> && <Command> --resume <镜像文件>`，`orca-dsh` 把它换成 `dsh-tui --backend=dsh --resume <DSH 会话 id>`（固定 `--backend=dsh`，因为 dsh-tui 会记住上次选的后端）。不设也能列出和搜索，只是点恢复会去找不存在的 `prime-agent`。Orca 的设置存在 SQLite 里，运行时直接改文件会被覆盖，所以只能在界面里改。
3. 可选：重启一次 Orca，让它装上自己的 DSH hook，插件会自动切到补充模式。不重启也完全能用。

只要一半：`node orca-bridge/install.mjs --no-mirror`（只同步状态）或 `--no-status`（只同步历史）。重跑 install 时要带上同样的参数，否则这一段会被写回默认值。

DSH-TUI 升级不影响插件：`install-fork.sh` 和 TUI 里的 `/update` 只重装 profile 的依赖，不碰 `cordis.patch.yml`。插件代码就是本目录的文件，`git pull` 之后重启 dsh-tui 就生效。

**验证：**

```sh
node orca-bridge/install.mjs status
```

前三行和最后一行是 `✓`，Prime Agent 那行在第 2 步之后变成 `✓`。然后在 Orca 里新开一个 DSH，发「用 bash 运行 `echo hi`，然后只回复：好了」：

- 运行中侧栏是「工作中」，工具显示 `bash echo hi`；结束后是「完成」，预览是「好了」，不是 `hi`。
- 几秒后 Orca 的 Session History 里多一条 Prime Agent 记录，标题是这句话；`orca search --agent prime-agent "echo hi"` 能搜到。点恢复，打开的是 DSH，回到这个会话。
- 想看 Orca 实际收到了什么：`~/Library/Application Support/orca/agent-hooks/last-status.json` 里这个 pane 的 `source` 是 `dsh`，`payload.lastAssistantMessage` 是回复正文。

### 命令

| 命令 | 作用 |
|---|---|
| `node orca-bridge/install.mjs status` | 逐项检查：patch 段、软链接、镜像数、Orca 的 Prime Agent 设置、Orca 自己的 DSH hook |
| `orca-dsh-sync` | 手动同步一次，打印结果 |
| `orca-dsh-sync status` | 目录、镜像数、最近几行日志（`~/.dsh-orca-bridge/sync.log`，只记有变化或失败的） |
| `orca-dsh-sync purge` | 删掉所有镜像（插件还在的话，下次同步会重建） |
| `orca-dsh --resume <镜像文件或会话 id>` | 恢复一个 DSH 会话，给 Orca 调用 |

环境变量：`DSH_HOME`（默认 `~/.dsh`）、`ORCA_DSH_MIRROR_DIR`（镜像目录，默认 `~/.prime/agent/sessions`）、`ORCA_DSH_STATE_DIR`（清单、锁和日志，默认 `~/.dsh-orca-bridge`）、`ORCA_DSH_TUI`（`orca-dsh` 启动 DSH 用的命令，默认 `dsh-tui`）。

### 局限

- **在 Orca 里显示为 Prime Agent，标题是第一条提示词。** Session History 没有 DSH 的位置，只能借 Prime Agent 的目录和格式（原机没装 Prime Agent）。Orca 只对 oh-my-pi 读标题记录，而原机在用 omp，不能借它的位置。DSH 生成的标题已经写进镜像的 `session_info`，Orca 以后支持了就会显示。如果你本来就用 Prime Agent，用 `--no-mirror` 只装状态这一半。
- **没有 Orca 的 Chat 视图。** Orca 只给 Claude、Codex、OpenCode、Grok 做了。
- **flash-check 之类的测试会话也会出现。** 它们是真的 DSH 会话（工作目录在临时目录下），Orca 按工作目录分组，不会混进项目里；不想要就在 DSH 里删掉，下次同步镜像跟着消失。
- **状态只对 dsh-tui 生效。** 插件只装在 dsh-tui profile；`dsh tui`、`dsh headless` 写的会话在下次 dsh-tui 启动时补镜像。
- **依赖 Orca 当前的接口。** 状态依赖 `/hook/dsh` 和 Orca 对 DSH 事件的解析（`normalizeDshEvent`），历史依赖 Prime Agent 的扫描目录和 pi 格式。Orca 升级后改了这些，插件要跟着改，`install.mjs status` 和上面的「验证」能看出来。

为什么不用别的办法：改 Orca 源码（`~/labs/orca` 的 fork）能原生显示 DSH、有 Chat 视图，但要自己编译、跟上游合并、关掉自动更新。Orca 的插件系统（1.4.227 里是实验功能，默认关）只能加侧栏面板、命令和快捷键，面板和后台进程之间只能靠 256 KB 的存储传数据，进不了 Session History，恢复会话也只能往已有终端里打字。之前的 [orca-dsh-history](https://github.com/parkgogogo/orca-dsh-history) 用 launchd 常驻进程同步历史；会话只在 DSH 运行时才会变，放进 DSH 进程里就不需要常驻进程，状态也一起解决了。本插件取代它。

### 卸载

```sh
node orca-bridge/install.mjs uninstall --purge   # 去掉 patch 段和软链接；--purge 同时删除镜像和 ~/.dsh-orca-bridge
```

然后重启 dsh-tui，并在 Orca 里清空 Prime Agent 的 Command。

### 开发

```sh
cd orca-bridge && npm test
```

测试只用合成数据：会话转换（多帧 zstd、截断的最后一帧、子 agent、fork、模型和用量）、同步（增量、删除、孤儿镜像、过期的锁）、状态（两种模式的事件顺序、审批、出错的轮次、子 agent），状态测试用一个假的 Orca hook 服务。改了状态逻辑之后，再按上面的「验证」在真 Orca 里跑一遍。注意：插件里不要序列化整个 session 事件（`JSON.stringify(event)`），那会展开嵌入的流式数据，实测会让 DSH 下一次模型请求失败；只读需要的字段。

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

改动都在 [parkgogogo/dsh-TUI](https://github.com/parkgogogo/dsh-TUI) 的 `unixporn` 分支，是上游 `main` 之上的四个提交（`feat(transcript): compactTools setting and thinkingFold "status"`、`fix(transcript): grow compact tool runs in place`、`fix(transcript): one summary-line shape from a run's first call`、`feat(transcript): compact tool runs read as one plain sentence`），改动在 `src/`，加一个构建检查 `verify:tool-group`，按上游规矩过了 `pnpm build` 的全部检查。两个新东西都是 `/settings` 里的正式选项，默认关，`settings.json` 打开。

`compactTools`（新文件 `src/components/Chat/ToolGroup.tsx`，加上 `MessageList.tsx`、`AssistantToolUseMessage.tsx` 和设置的接线）：

1. 终端卡（Bash/PowerShell）收起时只剩标题一行：运行中不滚动输出，结束后不显示输出，耗时在标题右边计时；命令很长时截断成一行，耗时不会被挤到第二行。
2. `read_image` 收起时也只剩一行，不显示给模型看的 `<path>…<type>image</type>…` 文本，也不显示缩略图（没有图形协议的终端里那是一块 12 行的空白）。
3. 读文件、搜索、终端调用（`toolGroupable`：卡片类型是 terminal、read、search，或工具名在 `GROUPABLE_TOOL_NAMES` 里）从第一次调用起就画成摘要行，单独一次也是一组，所以第二次调用来的时候这一行只是计数加一，样子不变。之前单独一次时画的是卡片 `• Bash(ls)`，第二次一来就换成摘要，并行调用时几十毫秒内换掉，看起来就是闪一下。
4. 连续的调用合成一组，调用之后的 Think 也收进组里（结尾的也收；它单独画会先挂在摘要下面，下一次调用一来又被收走，也是闪）。组头是一句话，按种类计数（`Read 2 files, ran 1 shell command`，文案在 `i18n.ts` 的 `tool-run-*`，中文界面是「读取了 2 个文件，运行了 1 条命令」）；还有调用在跑的种类用进行时、句末加 `…`。
5. 报错、非零退出码、被信号杀掉的命令照常显示错误内容，也不进组；改文件（diff）、todo、提问、子 agent 和 agent 的文字会把组断开。
6. 点组头或 `Ctrl+O` 展开；展开后卡片、输出和图片都照常显示。单独一次的调用展开后直接是那张卡片，再点卡片收回。
7. 模型在两次调用之间先发出一段空回复时，不再画一个孤零零的 `●`（底部的转圈状态已经说明它在干活）；真有文字到了才显示。
8. 顺带修了上游一个小毛病：标题里的文件路径可点击时（写文件、改文件的卡片），工具名会被挤成 `Writ…`，现在只截路径。

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

## 改了折叠显示之后：跑闪烁检查

`pnpm build` 里的 `verify:tool-group` 只检查折叠的逻辑，看不到界面上一闪而过的东西。改了 `ToolGroup.tsx`、`MessageList.tsx` 里工具行相关的代码，或者 rebase 了上游之后，装好再跑：

```sh
sh ~/labs/unixporn/DSH-TUI/flash-check/check.sh          # 8 个场景，1～3 分钟，花几分钱
sh ~/labs/unixporn/DSH-TUI/flash-check/check.sh par seq  # 只跑其中几个
```

它在 tmux 里真实跑 8 个场景（顺序调用、并行调用、读文件/搜索/报错/写文件混合、读图、带实时输出的长命令、窄屏长命令、调用之间思考、只用搜索工具），录下终端的原始输出，再用终端模拟器逐帧回放：只要有一张工具卡画出来又消失（先卡片再变成摘要的那种闪），或者工具行、Think 行画出来又被收回，这个场景就是 `VERDICT FAIL`，脚本退出码为 1。回答文字流式输出时的重新排版只记作 `reflow`，不算失败。需要 tmux、python3，第一次会在临时目录里建一个装 `pyte` 的 venv。

截屏轮询（每 0.2 秒 `tmux capture-pane`）抓不到几十毫秒的闪烁，之前就是这样漏掉的，所以必须逐帧回放。

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
