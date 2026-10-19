#!/bin/sh
# Build the unixporn fork of dsh-TUI and install it into the dsh-tui profile.
# Safe to re-run: it pulls the branch, rebuilds, and reinstalls.
#
#   sh install-fork.sh            clone/update into ~/labs/dsh-TUI
#   DSH_TUI_SRC=/path sh install-fork.sh
set -eu

REPO=https://github.com/parkgogogo/dsh-TUI.git
BRANCH=unixporn
SRC=${DSH_TUI_SRC:-$HOME/labs/dsh-TUI}
PACK_DIR=$HOME/.dsh-tui/fork

if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch origin "$BRANCH"
  git -C "$SRC" checkout "$BRANCH"
  git -C "$SRC" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$SRC"
fi
git -C "$SRC" submodule update --init --recursive

cd "$SRC"
pnpm install --frozen-lockfile
pnpm build

# npm pack, not pnpm: the vendored @dsh-std/* are bundledDependencies.
# The tarball name carries the commit and build time: pnpm skips a file:
# dependency whose path did not change, even when its contents did.
# pnpm re-reads the currently installed tarball during `add`, so the old one
# is deleted only after the new one installed.
mkdir -p "$PACK_DIR"
STAGE=$(mktemp -d)
PACKED=$(npm pack --silent --pack-destination "$STAGE" | tail -n 1)
TARBALL="$PACK_DIR/dsh-tui-$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S).tgz"
mv "$STAGE/$PACKED" "$TARBALL"
rmdir "$STAGE"

# The profile's package.json records this path; keep the tarball in place.
dsh plugin --profile dsh-tui add "$TARBALL"
find "$PACK_DIR" -name '*.tgz' ! -path "$TARBALL" -delete
echo "installed $TARBALL"
