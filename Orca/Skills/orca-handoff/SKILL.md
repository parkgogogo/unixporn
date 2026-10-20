---
name: orca-handoff
description: 通过 Orca 把任务交接（handoff）给其他 workspace 里的 agent（Codex、Grok、DSH），可以交到已有的工作目录，也可以为每个任务新建 worktree，多个交接并行进行，一条命令完成。确认每个 agent 已经开始干活就返回，之后由接手方负责，不等结果。会处理 dsh 收不到回车、grok 弹出目录信任提示这两个会卡住交接的问题。当用户要把任务 hand off / handoff / 交接 / 转交给其他 workspace、其他 worktree 或其他仓库里的 codex / grok / dsh，或者要“开个新 worktree 让某个 agent 去做”时使用。用户要等结果、汇总多方意见时，改用 orca-delegate。
---

# Orca 跨 workspace 交接

一条命令把一个或多个任务交给其他 workspace 里的 agent，并行进行。目标可以是已有的工作目录，也可以是为这个任务新建的 worktree。每个 agent 确实开始执行任务后，脚本就返回，并告诉你它在哪个目录、哪个终端。

交接按 Orca 的定义处理：所有权转给接手的 agent，原来的 agent 不再跟进。所以脚本不建 orchestration Run 或 Task，不等 `worker_done`，也不回收终端。终端留给用户去看或继续对话。需要等结果、自动收尾的场景，用同级目录的 [`orca-delegate`](../orca-delegate/SKILL.md)。

## 用法

```sh
scripts/orca_handoff.sh 'agent@目标=任务说明文件' ['agent@目标=任务说明文件' ...]
```

- **agent**：`codex`、`grok` 或 `dsh`。
- **目标**有两种写法：
  - **已有的 workspace**：任意 Orca worktree 选择器，例如 `path:/abs/path`、`name:<显示名>`、`id:<repoId>::<path>`、`branch:<分支>`。用 `orca worktree list --json` 查。普通文件夹也可以。
  - **新建 worktree**：`+<仓库>/<名字>`。仓库名是 `orca repo list` 里的显示名，必须是 git 仓库。新 worktree 从仓库默认基线拉出，不挂在当前 worktree 下面（`--no-parent`）。仓库的 setup（比如 `pnpm install`）照常执行，但和 agent 同时开始，不会拖慢交接；设 `ORCA_HANDOFF_SETUP=skip` 可以跳过 setup。
- **任务说明**：交接后由对方负责，所以必须写得自给自足。可以参考 orca-delegate 的 `templates/task_spec.md`，写清目标、要产出什么、限制，以及怎样算完成。需要回报时，就在任务说明里写清楚：把结果写到哪个文件。

示例，一次交接三个任务：

```sh
scripts/orca_handoff.sh \
  codex@+blog-next/fix-nav=task_codex.md \
  'grok@name:My Blog Site=task_grok.md' \
  dsh@path:/Users/gongyuan/labs/blog-next=task_dsh.md
```

```text
+10s dsh: task was left unsubmitted, sent Enter (#1)
codex +blog-next/fix-nav STARTED +8s workspace=/Users/gongyuan/orca/workspaces/blog-next/fix-nav terminal=term_…
grok name:My Blog Site STARTED +7s workspace=/Users/gongyuan/orca/workspaces/blog-next/My-Blog-Site terminal=term_…
dsh path:/Users/gongyuan/labs/blog-next STARTED +6s workspace=/Users/gongyuan/labs/blog-next terminal=term_…
handoff finished in 12s
```

退出码为 0 表示每个 agent 都已开始执行，这时把每行的 workspace 和 terminal 报给用户，交接就算完成。出现 `FAILED` 或 `UNCONFIRMED(…)` 时退出码为 1：
- `FAILED`：没能创建 worktree 或终端，后面附有 Orca 的报错。
- `UNCONFIRMED`：终端已经起来了，但 60 秒内没能确认任务开始执行。先用 `orca terminal read --terminal <handle> --screen --json` 看屏幕，再决定下一步。不要直接重新交接，否则同一个任务可能被做两遍。

## 各条路径怎么启动 agent

| 目标 | 做法 | 为什么 |
|---|---|---|
| 新建 worktree | `orca worktree create --repo name:<仓库> --name <名字> --no-parent --agent <agent> --prompt <任务>` | 这是 Orca 内置的启动方式：codex 的目录信任由 Orca 预先写好；codex 和 grok 的任务作为启动参数传入，一开始就会提交 |
| 已有 workspace | `orca terminal create --worktree <目标> --command '<agent> <任务>'`，任务通过 `"$(cat 文件)"` 作为启动参数传入：`codex "…"`、`grok -- "…"`、`dsh-tui . -- "…"` | Orca 没有“在已有 workspace 里用内置方式启动 agent、又不建 Run”的命令。用启动参数传任务，dsh 也不经过粘贴，不存在回车丢失的问题。临时任务文件放在 `~/.orca-handoff/`，不进任何仓库，确认 agent 开始后删除 |

`dsh-tui .` 用的是 `dsh-tui` profile（fork 版），和 Orca 内置的 `--agent dsh` 一致。

## 怎样确认已经开始（`scripts/screen_state.py`）

Orca 的回执最多只能证明输入已被接收，证明不了 agent 已经在执行任务，所以脚本直接读屏幕判断。判定依据是：任务说明里任意一行的开头出现在对话区，并且没有留在输入框里。比对时去掉空白和换行，长任务即使第一行被滚出屏幕也能识别。

确认过程中会自动处理两种会卡住交接的情况：

- **dsh 收不到回车**（新建 worktree 时）：Orca 在 dsh 界面还没起来时就把任务敲进了终端。dsh 启动后把这段文字收进输入框，显示「DSH is still starting — press Enter to send once it is ready」，而 Orca 那一下回车已经丢了。脚本等输入框里的内容连续两次读取都不变（说明长文本已经完整粘贴进去）再补发回车；如果文字还在框里就重试，最多 4 次。文字还在框里说明任务没有提交，所以重试不会让任务执行两次。
- **grok 的目录信任提示**：仓库里有项目 hooks（例如 `.claude/`）时，grok 先弹「Do you trust the contents of this directory?」。目标目录是用户自己指定的，脚本回答 `y`。grok 会把这个决定记进 `~/.grok/trusted_folders.toml`，同一个仓库的其他 worktree 以后不会再问。

另外，Orca 在新 worktree 里启动 dsh 时，shell 会先回显一遍任务文字。所以对 dsh 和 grok，脚本只在它们的输入框已经画出来之后才判断，不会把 shell 的回显误认为任务已经开始。

## 实测（2026-10-20，Orca 1.4.227）

从 `~/labs/omp` 交接给 blog-next 仓库，任务是只读的 `pwd; git branch --show-current`。dsh 用了 7000 字的长任务说明。

| 场景 | 结果 |
|---|---|
| 三个 agent 都交到已有 workspace（blog-next 主目录、My Blog Site） | codex 6 秒、grok 7 秒开始执行；dsh 实际已在执行，当时的判断方法没识别出来，修正后可以识别 |
| 三个 agent 都新建 worktree，没做任何处理 | 只有 codex 正常。grok 停在信任提示，dsh 的任务停在输入框里 |
| 本脚本，新建 worktree 和已有 workspace 混在一次交接里，共 4 个任务 | 全部开始执行，12 秒完成交接；dsh 补发 1 次回车；每个 agent 都报出了自己正确的目录和分支 |

## 安装

```sh
ln -s ~/labs/unixporn/Orca/Skills/orca-handoff ~/.claude/skills/orca-handoff
```

依赖：Orca 正在运行，`orca` 在 PATH 里，有 `python3`。脚本兼容 macOS 自带的 bash 3.2。新建 worktree 只适用于 git 仓库。普通文件夹（例如 `omp`）只能交给已有的 workspace。`screen_state.py` 和 orca-delegate 里的那份完全相同，修改时两边一起改。
