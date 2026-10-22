# Orca · Claude Dark

这是一份写给 agent 的操作手册：在任何一台 Mac 上把终端外观复现成和原机**完全一致**，并在配置变化后把改动写回本仓库。

Orca 本身保持默认设置（暗色模式），只导入一个终端配色主题、改终端字体。外观分四层：

| 层 | 管什么 | 本目录里的文件 |
|---|---|---|
| Orca 终端配色 | 终端的背景、文字和 16 色 | `claude-dark-1e1e1e.yaml` |
| 终端字体 | JetBrains Mono（Nerd Font 版），14 号 | 无文件，在 Orca 设置里填（见第 3 步） |
| zsh 提示符和 Clawd | 两行、无背景色块的 Powerlevel10k 提示符，开终端时 Clawd 跳舞打招呼 | 在 [`../zsh/`](../zsh/README.md)，不在本目录 |
| Claude Code | Claude Code 自己的 UI 配色 | 无文件，只有一项设置（见第 4 步） |

原机环境：macOS，Orca 1.4.227。

规则：每一步都按「验证」核对，通过了才算完成。

---

## 1. 安装字体

```sh
# 终端字体：JetBrains Mono 的 Nerd Font 版，自带提示符要用的图标
brew install --cask font-jetbrains-mono-nerd-font
```

**验证：** `ls ~/Library/Fonts /Library/Fonts | grep JetBrainsMonoNerdFontMono-SemiBold` 有输出。

## 2. zsh 提示符和 Clawd

提示符和 Clawd 作用在 shell 上，在任何终端 app 里都生效，所以单独放在 [`../zsh/`](../zsh/README.md)。按那边的 README 装好再回来做第 3 步。

## 3. Orca 终端配色和字体

Orca 的其他设置都保持默认，确保 App theme 是 **Dark** 即可。然后：

1. Orca → Settings → Terminal Themes → **Import from YAML**，选本目录的 `claude-dark-1e1e1e.yaml`。
2. 把深色终端主题（Dark theme）设为 **Claude Dark (1e1e1e)**。
3. Orca → Settings → Terminal 的字体（Font family）填下面这一行，字号 14，字重 400，粗体字重 600：

   ```text
   JetBrainsMono Nerd Font Mono", "PingFang SC", "PingFang TC
   ```

   首尾**不带**引号，中间的引号要留着：Orca 会在整串外面再包一层引号，拼出来正好是 `"JetBrainsMono Nerd Font Mono", "PingFang SC", "PingFang TC"`。首尾也带引号的话，第一个字体名会变成 `""JetBrainsMono…`，字体就失效了。

   用 `Nerd Font Mono` 这一款，不用 `Nerd Font`：Mono 款的图标严格占一个字符宽，TUI 的边框和对齐不会被挤歪。中文回退到苹方。

这三步需要用户在界面里点。agent 不要去改 Orca 的设置数据库，因为 Orca 运行时会用内存里的设置把它覆盖掉。

**验证：** 让用户截图，或者看用户的截图：终端背景是 `#1e1e1e`，光标是橙色 `#d97757`，提示符的路径是橙色文字，没有背景色块；字体是 JetBrains Mono（`0` 中间是点、`l` 底部带弯），git 分支前的图标正常显示、不是方块。

也可以只读地查 Orca 当前存的字体（不要写这个数据库）：

```sh
sqlite3 -readonly ~/Library/Application\ Support/orca/profiles/local-default/profile-state.db \
  "select payload from profile_state_documents" | grep -oE '"terminalFont(Family|Size)":[^,]*'
```

## 4. Claude Code

在 Claude Code 里运行 `/theme` 选 **Dark mode**，或者在 `~/.claude/settings.json` 里设 `"theme": "dark"`。

---

## 配色（Claude Dark 1e1e1e）

以 Anthropic 品牌色为基础。背景是中性灰，和 Orca 默认暗色外框（`#171717`）、侧栏（`#2a2a2a`）统一；文字偏暖；全画面唯一的高饱和色是 Claude 橙。

| 角色 | normal | bright |
|---|---|---|
| background / foreground | `#1e1e1e` / `#e8e6dc` | — |
| cursor / accent | `#d97757` | — |
| black | `#333333` | `#787878` |
| red | `#e5636f` | `#f08890` |
| green | `#93a86f` | `#adc28a` |
| yellow | `#e2b56a` | `#efca8d` |
| blue | `#6a9bcc` | `#8db6de` |
| magenta | `#c58bb5` | `#d8a9cc` |
| cyan | `#6fb0a5` | `#92c8bf` |
| white | `#b0aea5` | `#faf9f5` |

在 `#1e1e1e` 上的对比度：正文 13.3:1，橙色 5.3:1，注释 3.8:1。

提示符用的也是这套颜色，说明见 [`../zsh/`](../zsh/README.md#外观说明)。

---

## 把改动写回仓库

提示符的改动写回 [`../zsh/`](../zsh/README.md#把改动写回仓库)。

如果换了终端配色，把新主题的 YAML 放进本目录，同时更新第 3 步的文件名和上面的色表。最后提交并推送。

---

## Skills

`Skills/` 下是配合 Orca 用的 agent skill，链接到 `~/.claude/skills/` 即可使用：

| Skill | 用途 |
|---|---|
| [`orca-delegate`](Skills/orca-delegate/SKILL.md) | 一条命令把任务并行派给 Codex、Grok、DSH 等 agent，等全部结束后自动回收终端；绕开 dsh 丢回车、worker 死掉后空等等坑 |
| [`orca-handoff`](Skills/orca-handoff/SKILL.md) | 把任务交接给其他 workspace（已有目录或新建 worktree）里的 Codex、Grok、DSH，确认对方已开工就返回，不等结果；自动处理 dsh 丢回车、grok 目录信任提示 |
