#!/usr/bin/env python3
"""Apply or export the Orca terminal look stored in orca-settings.json.

Orca keeps its settings as one JSON document in a SQLite file:
  ~/Library/Application Support/orca/profiles/<profile>/profile-state.db
  table profile_state_documents, row domain='settings'
  columns: payload (JSON text), revision, updated_at (ms), content_hash (sha256 hex of payload)

A running Orca holds these settings in memory and writes them back, so `apply`
refuses to touch the live database while Orca is running.

Usage:
  python3 orca_settings.py apply  [--db PATH] [--dry-run]
  python3 orca_settings.py export [--db PATH]
  python3 orca_settings.py check  [--db PATH]
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
SPEC = HERE / "orca-settings.json"
ORCA_DIR = pathlib.Path.home() / "Library/Application Support/orca"
DEFAULT_DB = ORCA_DIR / "profiles/local-default/profile-state.db"


def orca_running():
    # pgrep -f misses the Orca main process on macOS; read the full process list instead.
    out = subprocess.run(["ps", "-axo", "command="], capture_output=True, text=True, check=True)
    return any(line.strip().endswith("Orca.app/Contents/MacOS/Orca") for line in out.stdout.splitlines())


def load(db):
    con = sqlite3.connect(db)
    con.execute("PRAGMA busy_timeout=5000")
    payload, rev = con.execute(
        "select payload, revision from profile_state_documents where domain='settings'").fetchone()
    settings = json.loads(payload)
    # Re-serialize exactly the way Orca does, so unchanged keys stay byte-identical.
    for seps in [(",", ":"), (", ", ": ")]:
        if json.dumps(settings, ensure_ascii=False, separators=seps) == payload:
            return con, settings, rev, seps
    sys.exit("error: cannot reproduce Orca's JSON serialization; refusing to write")


def diff(settings, spec):
    changes = {k: (settings.get(k), v) for k, v in spec["settings"].items() if settings.get(k) != v}
    theme = spec["customTheme"]
    current = next((t for t in settings.get("terminalCustomThemes", []) if t.get("id") == theme["id"]), None)
    if current != theme:
        changes["terminalCustomThemes[" + theme["id"] + "]"] = ("missing" if current is None else "different", "upsert")
    return changes


def cmd_check(db, spec):
    _, settings, rev, _ = load(db)
    changes = diff(settings, spec)
    print(f"settings revision {rev}: " + ("matches repo" if not changes else f"{len(changes)} differences"))
    for k, (old, new) in changes.items():
        print(f"  {k}: {json.dumps(old, ensure_ascii=False)} -> {json.dumps(new, ensure_ascii=False)}")
    return 0 if not changes else 1


def cmd_apply(db, spec, dry_run):
    if db.resolve().is_relative_to(ORCA_DIR.resolve()) and orca_running():
        sys.exit("error: Orca is running. Quit it completely (Cmd+Q) and run this from a terminal outside Orca.")
    con, settings, rev, seps = load(db)
    changes = diff(settings, spec)
    if not changes:
        print("already matches repo; nothing to do")
        return 0
    for k, (old, new) in changes.items():
        print(f"  {k}: {json.dumps(old, ensure_ascii=False)} -> {json.dumps(new, ensure_ascii=False)}")
    if dry_run:
        print("dry run; nothing written")
        return 0
    backup = db.parent / f"profile-state.db.unixporn-backup-{time.strftime('%Y%m%d%H%M%S')}"
    backup.mkdir()
    for f in db.parent.glob(db.name + "*"):
        if f.is_file():
            shutil.copy2(f, backup / f.name)
    settings.update(spec["settings"])
    theme = spec["customTheme"]
    themes = [t for t in settings.get("terminalCustomThemes", []) if t.get("id") != theme["id"]]
    settings["terminalCustomThemes"] = themes + [theme]
    payload = json.dumps(settings, ensure_ascii=False, separators=seps)
    with con:
        cur = con.execute(
            "update profile_state_documents set payload=?, revision=?, updated_at=?, content_hash=? "
            "where domain='settings' and revision=?",
            (payload, rev + 1, int(time.time() * 1000), hashlib.sha256(payload.encode()).hexdigest(), rev))
        if cur.rowcount != 1:
            sys.exit("error: settings changed while writing; nothing written")
    print(f"written revision {rev + 1}; backup in {backup}")
    return 0


def cmd_export(db, spec):
    _, settings, _, _ = load(db)
    spec["settings"] = {k: settings.get(k) for k in spec["settings"]}
    tid = settings["terminalThemeDark"].removeprefix("custom:")
    theme = next((t for t in settings.get("terminalCustomThemes", []) if t.get("id") == tid), None)
    if theme is None:
        sys.exit(f"error: dark terminal theme {settings['terminalThemeDark']!r} is not a custom theme")
    spec["customTheme"] = theme
    SPEC.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n")
    print(f"exported {len(spec['settings'])} settings and theme {theme['name']!r} to {SPEC}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["apply", "export", "check"])
    ap.add_argument("--db", type=pathlib.Path, default=DEFAULT_DB)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not a.db.exists():
        sys.exit(f"error: {a.db} not found (open Orca once so it creates its profile)")
    spec = json.loads(SPEC.read_text())
    if a.command == "check":
        return cmd_check(a.db, spec)
    if a.command == "apply":
        return cmd_apply(a.db, spec, a.dry_run)
    return cmd_export(a.db, spec)


if __name__ == "__main__":
    sys.exit(main())
