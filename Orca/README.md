# Orca · Claude Dark

这是一份写给 agent 的操作手册：在任何一台 Mac 上把终端外观复现成和原机**完全一致**，并在配置变化后把改动写回本仓库。

外观包括三层，缺一层就不一致：

| 层 | 管什么 | 本目录里的文件 |
|---|---|---|
| Orca 终端设置 | 终端配色、字体、行距、光标 | `claude-dark-1e1e1e.yaml`、`orca-settings.json`、`orca_settings.py` |
| zsh 提示符 | 单行、直角色块的 Powerlevel10k 提示符 | `p10k.zsh` |
| Claude Code | Claude Code 自己的 UI 配色 | 无文件，只有一项设置（见第 4 步） |

原机环境：macOS，Orca 1.4.227，zsh 5.9，oh-my-zsh 和 Powerlevel10k（commit `20323d6`）。

---

## 规则（agent 必读）

1. **Orca 运行时不要写它的数据库。** Orca 把设置放在内存里，退出时会写回去，直接改 `profile-state.db` 会被覆盖。`orca_settings.py apply` 检测到 Orca 在运行时会拒绝执行。
2. **如果你自己运行在 Orca 的终端里**（环境变量 `TERM_PROGRAM=Orca`），退出 Orca 会把你也杀掉。这种情况下走第 3 步的路线 A（界面导入），或者让用户在 Orca 之外的终端（Terminal.app、iTerm）里执行路线 B。
3. 覆盖用户的文件之前先备份。`p10k.zsh` 是整份替换。
4. 每一步都按 “验证” 小节核对，核对通过才算完成。

---

## 1. 安装依赖

```sh
# 字体：Orca 的字体设置写的是 "FiraCode Nerd Font"，中文回退用 macOS 自带的 PingFang
brew install --cask font-fira-code-nerd-font

# oh-my-zsh（已安装就跳过）
[ -d ~/.oh-my-zsh ] || sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

ZC=${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}
[ -d $ZC/themes/powerlevel10k ] || git clone https://github.com/romkatv/powerlevel10k.git $ZC/themes/powerlevel10k
[ -d $ZC/plugins/zsh-autosuggestions ] || git clone https://github.com/zsh-users/zsh-autosuggestions $ZC/plugins/zsh-autosuggestions
[ -d $ZC/plugins/zsh-syntax-highlighting ] || git clone https://github.com/zsh-users/zsh-syntax-highlighting.git $ZC/plugins/zsh-syntax-highlighting
```

想要和原机逐字一致，可以把 Powerlevel10k 固定到原机的版本：`git -C $ZC/themes/powerlevel10k checkout 20323d6f8cd267805a793dafc840d22330653867`。提示符里用了 `'#d97757'` 这种十六进制颜色，Powerlevel10k 太旧的话不支持。

**验证：** `ls ~/Library/Fonts /Library/Fonts | grep -i "FiraCode"` 有输出；上面三个目录都存在。

## 2. zsh 提示符

```sh
[ -f ~/.p10k.zsh ] && cp ~/.p10k.zsh ~/.p10k.zsh.bak-$(date +%Y%m%d%H%M%S)
cp p10k.zsh ~/.p10k.zsh
```

`~/.zshrc` 里必须有下面这些行，缺的就补上，已有的不要重复添加：

```zsh
# 文件最顶部（instant prompt）
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"
plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
source $ZSH/oh-my-zsh.sh

# 文件最底部
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
```

**验证：** 运行下面的命令（启动两次，是为了绕开旧的 instant prompt 缓存）：

```sh
for i in 1 2; do ( sleep 4; printf 'exit\n' ) | COLORTERM=truecolor TERM=xterm-256color script -q /dev/null zsh -i > /tmp/p10k-check.raw 2>&1; done
python3 - <<'PY'
import re
raw = open("/tmp/p10k-check.raw", "rb").read().decode("utf-8", "replace")
vis = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[78]|\r", "", raw)
print([re.sub(" {3,}", " … ", l) for l in vis.split("\n") if "❯" in l])
print("orange dir block:", "48;2;217;119;87m" in raw)
print("no frame / no rounded caps:", not any(c in raw for c in "╭╮╰╯"))
PY
```

在非 git 目录、conda 处于 `base` 时，期望输出：只有一行，形如 `' ~/path  ❯ '`，后面两项都是 `True`。

## 3. Orca 终端设置

先打开一次 Orca，让它生成配置目录 `~/Library/Application Support/orca/`。

### 路线 A：界面导入（已在原机验证）

1. Orca → Settings → Terminal Themes → **Import from YAML**，选本目录的 `claude-dark-1e1e1e.yaml`。
2. 把深色终端主题（Dark theme）设成 **Claude Dark (1e1e1e)**。
3. 按下表在 Settings 里逐项设置（数值取自 `orca-settings.json`，两者冲突时以 json 为准）：

| 设置 | 值 |
|---|---|
| App theme | Dark |
| Terminal font | `FiraCode Nerd Font`（回退：`PingFang SC`、`PingFang TC`） |
| Font size / weight / bold weight | 14 / 400 / 600 |
| Line height | 1.2 |
| Cursor | Block，闪烁 |
| Ligatures | Auto |
| Divider (dark) | `#3f3f46`，3px |
| Pane opacity active / inactive | 1 / 0.9 |
| Scrollback | 5000 行 |

### 路线 B：脚本写入（可以无人值守）

前提：Orca **已完全退出**（Cmd+Q），而且你不是运行在 Orca 的终端里。

```sh
python3 orca_settings.py check            # 列出和仓库不一致的设置
python3 orca_settings.py apply --dry-run  # 预览要改什么
python3 orca_settings.py apply            # 先备份数据库，再写入
open -a Orca
```

脚本会做这些事：合并 `orca-settings.json` 里的 23 项设置；把 Claude Dark 主题按原机的 id 写进 `terminalCustomThemes`（已存在就覆盖）；把深色终端主题指向它。写入时 `revision` 加 1，`content_hash` 重新计算为 payload 的 sha256。备份在数据库旁边的 `profile-state.db.unixporn-backup-<时间>/` 目录。

脚本在数据库副本上测过 check、apply、export，模拟了全新机器的情况。但 “退出 Orca → 脚本写入 → 重新打开 Orca” 这一整条链路还没在真机上走过。重开后如果设置没生效，改走路线 A。

如果配置文件不在默认的 `local-default` 目录，用 `--db` 指定：`ls ~/Library/Application\ Support/orca/profiles/` 看看有哪些目录。

**验证（两条路线通用）：** 重开 Orca 后运行 `python3 orca_settings.py check`，期望输出 `matches repo`。然后肉眼确认：终端背景是 `#1e1e1e`，光标是橙色 `#d97757`。

## 4. Claude Code

在 Claude Code 里运行 `/theme` 选 **Dark mode**，或者在 `~/.claude/settings.json` 里设 `"theme": "dark"`。

---

## 配色（Claude Dark 1e1e1e）

以 Anthropic 品牌色为基础。背景是中性灰，和 Orca 外框（`#171717`）及侧栏（`#2a2a2a`）统一；文字偏暖；全画面唯一的高饱和色是 Claude 橙。

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

提示符：平时只显示一个橙色直角色块（`#d97757` 底、`#1e1e1e` 字）里的路径，后面是橙色的 `❯`，没有 OS 图标和文件夹图标。在 git 仓库里会多出一个 `#333333` 色块显示 git 状态。右侧只在需要时出现：命令失败（同时 `❯` 变红）、命令耗时超过 3 秒、激活了非 `base` 的 conda 环境。

---

## 把改动写回仓库

用户在本机调整外观之后，按下面的步骤同步到仓库：

```sh
cp ~/.p10k.zsh p10k.zsh
python3 orca_settings.py export   # 从本机数据库重新导出 orca-settings.json（只读，Orca 运行时也能执行）
```

`export` 只导出 `orca-settings.json` 里已经列出的设置项，外加当前选中的深色主题。如果主题换了，还要做两件事：把新主题的 YAML 放进本目录，并更新本文件第 3 步的文件名和上面的色表。需要导出新的设置项时，先把键名加进 `orca-settings.json` 的 `settings` 里，再执行 export。最后提交改动并推送。
