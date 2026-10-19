---
name: orca-delegate
description: 通过 Orca 把一批任务同时派给多个 agent（Codex、Grok、DSH/DeepSeek、Claude 等），一条命令完成建 Run、并行启动、等待、收尾，并处理 dsh 收不到回车而卡住、worker 进程死掉后一直空等等已知问题。当用户要把任务委托、分发或派给 codex / grok / dsh 等多个 agent 并等结果，要多模型并行审稿或交叉验证，或要测试 Orca 委托链路时使用。
---

# Orca 多 agent 委派

一条命令完成整个委派：新建 Run，并行启动每个 agent，等所有 worker 结束，逐个回收终端、确认消息。协调者中途不用自己轮询，只在 worker 提问时才需要介入。

## 先记住的几件事

- **Codex、Grok、DSH 都是 Orca 内置 agent。** 一律用 `worker-start --agent <id>` 启动，id 分别是 `codex`、`grok`、`dsh`，不要先 `terminal create` 再用 `--terminal` 接入。用 `--agent` 启动时，终端由 Orca 创建，`worker-release` 时会自动关闭并存档对话记录。手动开的终端 release 后只会被标记为 `retained / external_terminal`，标签页会一直留着。
- **`--agent dsh` 实际运行的是 `dsh-tui .`，用的是 `dsh-tui` profile，也就是 parkgogogo/dsh-TUI 的 fork。** 手动输入 `dsh tui` 用的是另一个 profile `tui`。
- **dsh 会丢掉 Orca 发出的第一个回车。** 新启动的 dsh 收到粘贴进来的任务后，任务停在输入框里，显示成折叠的 `▸ 90 lines・5300 chars・…`，不会自动提交。`worker-start` 仍然返回 `input_accepted`，因为 Orca 把“已粘贴、尚未开始”也算作已接收，所以单看回执发现不了。脚本会检查屏幕：两次读取（间隔 2 秒）都还看到这个折叠块，就补发一次回车。
- **`input_accepted` 不代表 agent 已经开始干活。** 只有 `worker_done` 才算完成，或者 `worker-show` 里 `worker.state` 变成 `failed`。
- **worker 进程死掉（比如终端被关掉）时，不会有任何消息送到。** 一直 `check --wait` 会永远等下去。脚本每 30 秒没有新消息时，会用 `worker-show` 检查各个 worker，发现 `failed` 或 `stopped` 就记为失败并从等待列表中移除。
- 不在 Orca 终端里运行时（`orca status --json` 里 `caller` 为 `null`），`check` 必须带 `--run <run_id>`。
- `check --wait` 的 `_keepalive` 心跳打印在 stderr 上，需要过滤掉。

## 用法

1. 每个 agent 写一份任务说明，参考 `templates/task_spec.md`。必须写清以下几项：目标目录、要产出什么、限制、只能写哪个文件、怎样算完成。每个 worker 写自己的文件，互不重叠。要求 worker 把结果写进文件，以文件为准，因为 worker 的 orca 命令偶尔会报错，`worker_done` 可能回不来。
2. 运行：

   ```sh
   scripts/orca_fanout.sh "<目标>" <工作目录绝对路径> codex=spec_codex.md grok=spec_grok.md dsh=spec_dsh.md
   ```

   工作目录必须是 Orca 已经认识的 worktree 或文件夹，可以用 `orca worktree list --json` 确认。任务较长时用 Bash 的 `run_in_background` 运行，完成时会收到通知。输出示例：

   ```text
   run run_375e667079c6  state ./.orca-fanout/run_375e667079c6
   +8s dsh: launch prompt was not submitted, sent Enter
   +15s started codex ctx_…
   +15s started grok ctx_…
   +15s started dsh ctx_…
   +15s done dsh succeeded — …
   +37s done grok succeeded — …
   +40s done codex succeeded — …
   all settled in 43s (run run_375e667079c6)
   ```

3. 根据退出码处理：
   - **0**：所有 worker 都已结束，终端已回收，消息已确认。逐个打开结果文件核对内容，不要只看 `done` 那一行的摘要。有 `FAILED` 行时，向用户说明失败原因；需要重试时，为那一个 agent 单独再跑一次。
   - **2**：有 worker 提问或升级。脚本会打印这条消息，并且不确认它。先用 `orca orchestration reply --id <message_id> --body "<答复>" --json` 回答，再运行 `orca orchestration check --run <run> --ack <delivery_id> --json` 确认，最后运行 `scripts/orca_fanout.sh --resume <state 目录>` 继续等待。
   - **出现 `START FAILED`**：不要直接重新启动。先看 `<state>/start-<agent>.json` 里的 `failedStage` 和 `residualResources`，再按 `orca skills get orchestration --reference references/recovery-and-cleanup.md` 处理。

4. 收尾检查：`orca orchestration worker-list --run <run> --terminal-state reclaimable --json` 应该返回空列表。

## 实测（2026-10-19，Orca 1.4.227，同一个小任务，三个 agent）

| 做法 | 结果 |
|---|---|
| 手动 `terminal create` 打开 grok 和 `dsh tui`，再用 `--terminal` 接入，协调者逐步执行命令 | 能完成，但 grok 和 dsh 的标签页一直留着，协调者要花好几轮操作 |
| 全部用 `--agent`，没有补发回车 | codex 21 秒、grok 34 秒完成；dsh 一直卡在输入框，等待也不会结束 |
| 本脚本 | 三个全部完成，从建 Run 到全部收尾共 43 秒，所有终端都已关闭 |

## 安装

```sh
ln -s ~/labs/unixporn/Orca/Skills/orca-delegate ~/.claude/skills/orca-delegate
```

依赖：Orca 正在运行，`orca` 在 PATH 里，有 `python3`。脚本兼容 macOS 自带的 bash 3.2。完整的编排规范以 `orca skills get orchestration` 输出的版本为准，本 skill 只覆盖“并行派单，再等全部结束”这一种流程。
