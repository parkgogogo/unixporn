# Orca · Claude Dark

这是一份写给 agent 的操作手册：在任何一台 Mac 上把终端外观复现成和原机**完全一致**，并在配置变化后把改动写回本仓库。

Orca 本身保持默认设置（暗色模式），只导入一个终端配色主题。外观分三层：

| 层 | 管什么 | 本目录里的文件 |
|---|---|---|
| Orca 终端配色 | 终端的背景、文字和 16 色 | `claude-dark-1e1e1e.yaml` |
| zsh 提示符 | 单行、直角色块的 Powerlevel10k 提示符 | `p10k.zsh` |
| Claude Code | Claude Code 自己的 UI 配色 | 无文件，只有一项设置（见第 4 步） |

原机环境：macOS，Orca 1.4.227，zsh 5.9，oh-my-zsh 和 Powerlevel10k（commit `20323d6`）。

规则：覆盖用户的文件之前先备份（`p10k.zsh` 是整份替换）；每一步都按「验证」核对，通过了才算完成。

---

## 1. 安装依赖

```sh
# 提示符里的图标需要 Nerd Font
brew install --cask font-fira-code-nerd-font

# oh-my-zsh（已安装就跳过）
[ -d ~/.oh-my-zsh ] || sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

ZC=${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}
[ -d $ZC/themes/powerlevel10k ] || git clone https://github.com/romkatv/powerlevel10k.git $ZC/themes/powerlevel10k
[ -d $ZC/plugins/zsh-autosuggestions ] || git clone https://github.com/zsh-users/zsh-autosuggestions $ZC/plugins/zsh-autosuggestions
[ -d $ZC/plugins/zsh-syntax-highlighting ] || git clone https://github.com/zsh-users/zsh-syntax-highlighting.git $ZC/plugins/zsh-syntax-highlighting
```

想和原机逐字一致，可以把 Powerlevel10k 固定到原机版本：`git -C $ZC/themes/powerlevel10k checkout 20323d6f8cd267805a793dafc840d22330653867`。提示符用了 `'#d97757'` 这种十六进制颜色，太旧的 Powerlevel10k 不支持。

**验证：** `ls ~/Library/Fonts /Library/Fonts | grep -i "FiraCode"` 有输出；上面三个目录都存在。

## 2. zsh 提示符

```sh
[ -f ~/.p10k.zsh ] && cp ~/.p10k.zsh ~/.p10k.zsh.bak-$(date +%Y%m%d%H%M%S)
cp p10k.zsh ~/.p10k.zsh
```

`~/.zshrc` 里必须有下面这些行，缺的补上，已有的不要重复添加：

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

在非 git 目录、conda 处于 `base` 时，期望输出只有一行，形如 `' ~/path  ❯ '`，后面两项都是 `True`。

## 3. Orca 终端配色

Orca 的其他设置都保持默认，确保 App theme 是 **Dark** 即可。然后导入配色：

1. Orca → Settings → Terminal Themes → **Import from YAML**，选本目录的 `claude-dark-1e1e1e.yaml`。
2. 把深色终端主题（Dark theme）设为 **Claude Dark (1e1e1e)**。

这两步需要用户在界面里点。agent 不要去改 Orca 的设置数据库，因为 Orca 运行时会用内存里的设置把它覆盖掉。

**验证：** 让用户截图，或者看用户的截图：终端背景是 `#1e1e1e`，光标是橙色 `#d97757`，提示符的路径在橙色色块里。

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

提示符：平时只显示一个橙色直角色块（`#d97757` 底、`#1e1e1e` 字）里的路径，后面是橙色的 `❯`，没有 OS 图标和文件夹图标。在 git 仓库里会多出一个 `#333333` 色块显示 git 状态。右侧只在需要时出现：命令失败（同时 `❯` 变红）、命令耗时超过 3 秒、激活了非 `base` 的 conda 环境。

---

## 把改动写回仓库

用户在本机调整外观之后：

```sh
cp ~/.p10k.zsh p10k.zsh
```

如果换了终端配色，把新主题的 YAML 放进本目录，同时更新第 3 步的文件名和上面的色表。最后提交并推送。
