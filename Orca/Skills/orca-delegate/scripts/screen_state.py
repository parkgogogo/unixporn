#!/usr/bin/env python3
"""Classify an agent TUI screen after a handoff.

usage: orca terminal read --terminal <h> --screen --json | screen_state.py <task-spec-file> <agent>
prints one of:
  TRUST     grok's folder-trust dialog is up; it waits for `y`
  PENDING:<digest>  the task sits in the input box unsubmitted (dsh drops the launch Enter);
            the digest changes while a long paste is still arriving
  STARTED   the task text is in the conversation, outside the input box
  WAIT      nothing conclusive yet
A long task scrolls its first line off screen, so every spec line counts: the first 12
non-space characters of any line, matched against the screen with whitespace and wrapping removed.
dsh and grok only count as STARTED once their input box is drawn: on Orca's new-worktree path the
task is typed into the shell before dsh's TUI is up, and that shell echo must not look like a start.
"""
import hashlib
import json
import re
import sys

squash = lambda ls: re.sub(r"\s+", "", "".join(ls))
with open(sys.argv[1], encoding="utf-8") as f:
    snippets = {squash([l])[:12] for l in f if len(squash([l])) >= 6}
agent = sys.argv[2] if len(sys.argv) > 2 else ""
try:
    lines = json.load(sys.stdin)["result"]["terminal"]["tail"]
except Exception:
    print("WAIT")
    sys.exit(0)

screen = "\n".join(lines)
if "Do you trust the contents of this directory" in screen and "Grok Build" in screen:
    print("TRUST")
    sys.exit(0)

# The input box is the last ╭…╰ frame on screen (dsh and grok draw one; codex has none).
top = max((i for i, l in enumerate(lines) if "╭" in l), default=-1)
bottom = max((i for i, l in enumerate(lines) if "╰" in l), default=-1)
has_box = 0 <= top < bottom
if has_box:
    box = lines[top + 1 : bottom]
    outside = lines[:top] + lines[bottom + 1 :]
else:
    box, outside = [], lines

box_text = re.sub(r"[⌸❯⛶│]", "", squash(box))
pasted_chip = re.search(r"▸\d+lines・\d+chars・", box_text)

outside_text = squash(outside)
in_box = any(s in box_text for s in snippets)
needs_box = agent in ("dsh", "grok")
if any(s in outside_text for s in snippets) and not (in_box or pasted_chip) and (has_box or not needs_box):
    print("STARTED")
elif pasted_chip or in_box:
    print("PENDING:" + hashlib.md5(box_text.encode()).hexdigest()[:8])
else:
    print("WAIT")
