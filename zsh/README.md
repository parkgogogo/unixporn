# zsh · Claude 风格提示符 + Clawd

这是一份写给 agent 的操作手册：在任何一台 Mac 上把 zsh 的外观复现成和原机**完全一致**，并在配置变化后把改动写回本仓库。

这里的配置作用在 shell 上，不管在哪个终端 app 里打开 zsh 都会生效。终端 app 自己的配色和字体在 [`../Orca/`](../Orca/README.md)。

![Clawd 开场跳舞，然后是两行提示符](clawd/demo.gif)

| 文件 | 管什么 |
|---|---|
| `p10k.zsh` | Powerlevel10k 提示符：两行、无背景色块，路径高亮 git 仓库名和当前目录 |
| `clawd/clawd.zsh` | Clawd：新开终端时跳一小段舞再打招呼；`clawd` 命令随时再跳一次 |
| `clawd/frames.zsh` | Clawd 的动画帧，由 `gen_frames.py` 生成，不要手改 |
| `clawd/gen_frames.py` | 用像素网格画 Clawd 的每个动作，打包成 2×2 象限块字符 |

原机环境：macOS，zsh 5.9，oh-my-zsh 和 Powerlevel10k（commit `20323d6`）。

规则：覆盖用户的文件之前先备份（`p10k.zsh` 是整份替换）；每一步都按「验证」核对，通过了才算完成。`~/.zshrc` 里常有 API key 之类的私密内容：只按下面的说明增补行，**绝不要**把整个 `~/.zshrc` 复制进本仓库。

---

## 1. 安装依赖

```sh
# 字体：JetBrains Mono 的 Nerd Font 版，git 分支、锁等图标要用
brew install --cask font-jetbrains-mono-nerd-font

# oh-my-zsh（已安装就跳过）
[ -d ~/.oh-my-zsh ] || sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

ZC=${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}
[ -d $ZC/themes/powerlevel10k ] || git clone https://github.com/romkatv/powerlevel10k.git $ZC/themes/powerlevel10k
[ -d $ZC/plugins/zsh-autosuggestions ] || git clone https://github.com/zsh-users/zsh-autosuggestions $ZC/plugins/zsh-autosuggestions
[ -d $ZC/plugins/zsh-syntax-highlighting ] || git clone https://github.com/zsh-users/zsh-syntax-highlighting.git $ZC/plugins/zsh-syntax-highlighting
```

想和原机逐字一致，可以把 Powerlevel10k 固定到原机版本：`git -C $ZC/themes/powerlevel10k checkout 20323d6f8cd267805a793dafc840d22330653867`。提示符用了 `'#d97757'` 这种十六进制颜色，太旧的 Powerlevel10k 不支持。

**验证：** `ls ~/Library/Fonts /Library/Fonts | grep JetBrainsMonoNerdFontMono-SemiBold` 有输出；上面三个目录都存在。

## 2. 安装提示符和 Clawd

在本仓库根目录执行：

```sh
[ -f ~/.p10k.zsh ] && cp ~/.p10k.zsh ~/.p10k.zsh.bak-$(date +%Y%m%d%H%M%S)
cp zsh/p10k.zsh ~/.p10k.zsh

# Clawd 用软链接，以后 git pull 就能更新
mkdir -p ~/.config
[ -e ~/.config/clawd ] || ln -s "$PWD/zsh/clawd" ~/.config/clawd
```

`~/.zshrc` 里必须有下面这些行，缺的补上，已有的不要重复添加。改之前先 `cp ~/.zshrc ~/.zshrc.bak-$(date +%Y%m%d%H%M%S)`。

```zsh
# 文件最顶部，必须在 instant prompt 之前：Clawd 会往终端输出内容，
# 而 instant prompt 生效后再有输出，p10k 会报警告。
# always 块保证 Clawd 出任何错，都不会中断 .zshrc 的其余部分。
{ [[ -r ~/.config/clawd/clawd.zsh ]] && source ~/.config/clawd/clawd.zsh && clawd-intro } always { TRY_BLOCK_ERROR=0 }

# 紧接着是 instant prompt
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

**验证提示符：** 运行下面的命令（启动两次，是为了绕开旧的 instant prompt 缓存）：

```sh
for i in 1 2; do ( sleep 5; printf 'exit\n' ) | CLAWD_INTRO=off COLORTERM=truecolor TERM=xterm-256color script -q /dev/null zsh -i > /tmp/p10k-check.raw 2>&1; done
python3 - <<'PY'
import re
raw = open("/tmp/p10k-check.raw", "rb").read().decode("utf-8", "replace")
vis = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[78=>]|\r", "", raw)
print([l.split("❯")[0] + "❯" if "❯" in l else l.split("   ")[0] for l in vis.split("\n") if l and l[0] in "✻❯"][:2])
print("orange current dir:", "38;2;217;119;87m" in raw)
print("no background blocks:", "\x1b[48;" not in raw)
PY
```

在非 git 目录、conda 处于 `base` 时，期望第一行输出形如 `['✻ ~/path', '❯']`，后面两项都是 `True`。

**验证 Clawd：** `zsh -ic clawd </dev/null` 的最后三行是：

```text
 ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝
```

然后让用户新开一个终端看：Clawd 跳一小段舞（约 1.2 秒），停下来眨眼，右边显示 `✻ <git 用户名>, welcome back`、日期时间、终端名和 zsh 版本；下面是两行提示符。

---

## 外观说明

### 提示符

```
✻ ~/labs/orca/src/main/ipc   fork-build =                         4s ⌛
❯ █
```

- **两行**：第一行是位置和状态，第二行只有 `❯`，命令永远从第 3 列开始。开着 transient prompt，执行过的提示符会缩成 `❯ 命令`，所以多出的一行只出现在当前提示符上。
- **路径**（自定义段 `prompt_cwd`，替换内置的 `dir`）：上级目录灰色 `#787878`，git 仓库根目录白色加粗 `#e8e6dc`，当前目录 Claude 橙加粗 `#d97757`。目录名从不截断；路径超出窗格宽度时才从左边折叠成 `…`，开头（`~` 或 `/`）、仓库根和当前目录始终保留，例如 50 列时是 `~/…/orca/…/shell-ready-framework`。只读目录后面带一个灰色锁。
- **git**：灰色的分支名，有改动显示黄色 `!n`，有未跟踪文件显示蓝色 `?n`。
- **`✻`**：第一行开头的 Claude 橙星号。`❯` 平时是 `#b0aea5`，上一条命令失败时变红 `#e5636f`，右侧显示红色的退出码 `1 ✘`。
- **右侧**只在需要时出现：命令耗时超过 3 秒、激活了非 `base` 的 conda 环境等。

可调的参数在 `p10k.zsh` 的 `cwd` 一节：`POWERLEVEL9K_CWD_PARENT_COLOR`、`POWERLEVEL9K_CWD_REPO_COLOR`、`POWERLEVEL9K_CWD_LEAF_COLOR`，以及给 git 状态和右侧留的列数 `POWERLEVEL9K_CWD_RESERVE`。

### Clawd

Clawd 是 Claude Code 欢迎页上的那只橙色小家伙。静止帧和 Claude Code 里的完全一样；动画在 20×8 的像素网格上画（每个字符格 2×2 像素），所以能半格半格地蹦跳和摇摆。

- **开新终端**：跳一小节舞。旁边的 `✳ Moonwalking…` 学的是 Claude Code 的 spinner，旋转的符号、随机动词、扫过文字的高光都一样。跳完眨一下眼，然后打招呼。
- **`clawd` 命令**：一直跳，按任意键停，最多 8 小节；停下后显示 `✻ Grooved for 3s`，学的是 Claude Code 每轮结束时的 `✻ Worked for 12s`。
- **不打扰**：Orca 的 agent 终端（有 `ORCA_AGENT_LAUNCH_TOKEN`）、Claude Code 开的 shell（有 `CLAUDECODE`）、非交互 shell、小于 44 列或 10 行的窗格都不跳。跳舞时不回显按键，但按键不会丢，跳完照常进入命令行。

环境变量：

| 变量 | 作用 |
|---|---|
| `CLAWD_INTRO` | 开新终端时的表现：`dance`（默认）、`still`（只打招呼）、`off` |
| `CLAWD_NAME` | 问候语里的名字，默认取 `~/.gitconfig` 里 `[user]` 的 `name` |

想改舞步：编辑 `clawd/gen_frames.py` 里的 `DANCE`，然后在 `zsh/clawd/` 里运行 `python3 gen_frames.py > frames.zsh`。

---

## 把改动写回仓库

用户在本机调整提示符之后：

```sh
cp ~/.p10k.zsh zsh/p10k.zsh
```

Clawd 是软链接到仓库的，改动已经在 `zsh/clawd/` 里。最后提交并推送。
