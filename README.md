# unixporn

我的桌面和终端外观配置。每个目录对应一个应用，目录里的 README 是给 agent 的操作手册，可以在新机器上把外观复现得一模一样。

| 目录 | 内容 |
|---|---|
| [`Orca/`](Orca/README.md) | Orca 终端（默认暗色模式）：Claude Dark 配色（`#1e1e1e`）、JetBrains Mono 字体；`Skills/` 里有 Orca 多 agent 委派和跨 workspace 交接的 skill |
| [`zsh/`](zsh/README.md) | zsh：两行无背景色块的 Powerlevel10k 提示符（路径高亮仓库名和当前目录），开终端时 Clawd 跳舞打招呼，`clawd` 命令随时再跳；在任何终端 app 里都生效 |
| [`DSH-TUI/`](DSH-TUI/README.md) | dsh-TUI（DeepSeek Harness 终端界面）：用 fork 版（parkgogogo/dsh-TUI），极简界面、Bash 只占一行、连续工具调用折成一行、Think 只显示状态，配色和终端同一套 Claude Dark；`orca-bridge` 插件把 DSH 的状态和会话历史同步进 Orca |
