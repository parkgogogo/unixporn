#!/usr/bin/env node
// Apply the unixporn look to dsh-TUI: /settings values, the Claude Dark
// theme, and a small render patch (one-line Bash cards, status-only thinking).
// Safe to re-run; run it again after every dsh-TUI install or /update.
//
//   node apply.mjs           apply everything
//   node apply.mjs check     report what is applied, change nothing
//   node apply.mjs revert    undo the render patch (settings/theme stay)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODE = process.argv[2] ?? 'apply';
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const TUI_HOME = join(homedir(), '.dsh-tui');
const MARK = '/* unixporn-patch */\n';
const ORIG = '.unixporn-orig';
const THEME = 'claude-dark-1e1e1e';

// [find, replace, expected occurrences]. Every anchor must match exactly, or
// the file is left untouched and the script exits non-zero.
const PATCHES = {
    'lib/types/components/messages/AssistantThinkingMessage.js': [
        // Live thinking: no three-line ticker; the header (spinner + Thinking · 12s…) is all that shows.
        ['    if (preview) {', '    if (false && preview) {', 1],
        // Settled thinking: drop the "(ctrl+o to expand)" hint; Ctrl+O still expands.
        ["${streaming ? '…' : ` ${t('hint-expand-ctrl-o', { key: primaryComboString('transcript') })}`}", "${streaming ? '…' : ''}", 1],
        // Spinner takes the theme accent instead of the fixed DeepSeek blue.
        ['_jsx(Text, { children: minimalUi ? frameText : chalk.rgb(pulseColor.r, pulseColor.g, pulseColor.b).bold(frameText) })', '_jsx(Text, { color: "accent", children: frameText })', 2],
    ],
    'lib/types/components/messages/AssistantToolUseMessage.js': [
        // Collapsed terminal cards stream no live output rows...
        ["const liveText = isRunning && !isError && sendMessage === undefined && !useSplitDiff ? tool.liveOutput ?? '' : '';", "const liveText = !(headerIsTerminal && !verbose) && isRunning && !isError && sendMessage === undefined && !useSplitDiff ? tool.liveOutput ?? '' : '';", 1],
        // ...and no output body. Errors and non-zero exit codes still show.
        ["    const cap = view?.card === 'diff' ? DIFF_BODY_MAX_LINES : TEXT_BODY_MAX_LINES;", "    if (headerIsTerminal && !verbose && !isError)\n        body = [];\n    const cap = view?.card === 'diff' ? DIFF_BODY_MAX_LINES : TEXT_BODY_MAX_LINES;", 1],
        // The elapsed chip ticks on the header while the command runs.
        ['!isRunning && (_jsx(Box, { flexWrap: "nowrap", children: _jsx(Text, { dimColor: !hovered, children: elapsedText }) }))', '(!isRunning || headerIsTerminal) && (_jsx(Box, { flexWrap: "nowrap", children: _jsx(Text, { dimColor: !hovered, children: elapsedText }) }))', 1],
        // A long command truncates to one row (hover shows it, Ctrl+O expands).
        ['_jsxs(Text, { children: ["(", folded.first, ")"] })', '_jsxs(Text, { wrap: "truncate-end", children: ["(", folded.first, ")"] })', 1],
        ['    if (hiddenLines <= 0 && clipped.hiddenChars === 0)\n        return undefined;\n', '', 1],
    ],
};

let failed = false;
const say = (msg) => console.log(msg);
const fail = (msg) => { failed = true; console.error(`✗ ${msg}`); };

function count(text, needle) {
    let n = 0;
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length))
        n++;
    return n;
}

function readJson(path, fallback) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return fallback;
    }
}

/** `over` laid on `under`: nested objects merge, anything else replaces. */
function merge(under, over) {
    const out = { ...under };
    for (const [key, value] of Object.entries(over)) {
        const below = out[key];
        const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
        out[key] = isObj(below) && isObj(value) ? merge(below, value) : value;
    }
    return out;
}

/** Every dsh-TUI copy under $DSH_HOME/profiles (dsh-tui, rescue, custom). */
function packageDirs() {
    const root = join(DSH_HOME, 'profiles');
    if (!existsSync(root))
        return [];
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, 'node_modules/@deepseek-harness-tui/dsh-tui'))
        .filter((dir) => existsSync(join(dir, 'package.json')));
}

function settingsStep() {
    const want = readJson(join(HERE, 'settings.json'));
    const file = join(TUI_HOME, 'settings.json');
    const doc = readJson(file, { version: 1, values: {} });
    const values = merge(doc.values ?? {}, want);
    const same = JSON.stringify(values) === JSON.stringify(doc.values ?? {});
    if (MODE === 'check')
        return say(`${same ? '✓' : '·'} settings ${same ? 'applied' : 'not applied'} (${file})`);
    if (same)
        return say('✓ settings already applied');
    const next = { ...doc, version: 1, values };
    mkdirSync(TUI_HOME, { recursive: true });
    if (existsSync(file))
        copyFileSync(file, `${file}.bak-${Date.now()}`);
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    say(`✓ settings merged into ${file}`);
}

function themeStep() {
    const src = join(HERE, `${THEME}.json`);
    const dst = join(TUI_HOME, 'themes', `${THEME}.json`);
    const pref = join(TUI_HOME, 'theme.json');
    const same = existsSync(dst) && readFileSync(dst, 'utf8') === readFileSync(src, 'utf8')
        && readJson(pref, {}).theme === THEME;
    if (MODE === 'check')
        return say(`${same ? '✓' : '·'} theme ${THEME} ${same ? 'active' : 'not active'}`);
    if (MODE !== 'apply')
        return;
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    writeFileSync(pref, `${JSON.stringify({ theme: THEME }, null, 2)}\n`);
    say(`✓ theme ${THEME} installed and selected`);
    if (process.env.DSH_TUI_THEME)
        say(`  note: DSH_TUI_THEME=${process.env.DSH_TUI_THEME} overrides theme.json`);
}

function patchStep(dir) {
    const version = readJson(join(dir, 'package.json')).version;
    for (const [rel, edits] of Object.entries(PATCHES)) {
        const file = join(dir, rel);
        const label = `${rel.split('/').pop()} (dsh-tui ${version}, ${dir.split('/profiles/')[1].split('/')[0]})`;
        if (!existsSync(file)) {
            fail(`${label}: file missing — dsh-TUI layout changed, update PATCHES`);
            continue;
        }
        const text = readFileSync(file, 'utf8');
        const patched = text.startsWith(MARK);
        if (MODE === 'check') {
            say(`${patched ? '✓' : '·'} ${label} ${patched ? 'patched' : 'not patched'}`);
            continue;
        }
        if (MODE === 'revert') {
            if (patched && existsSync(file + ORIG)) {
                copyFileSync(file + ORIG, file);
                say(`✓ ${label} restored`);
            }
            continue;
        }
        if (patched) {
            say(`✓ ${label} already patched`);
            continue;
        }
        let out = text;
        const misses = [];
        for (const [find, replace, expected] of edits) {
            const n = count(out, find);
            if (n !== expected) {
                misses.push(`expected ${expected}× got ${n}×: ${find.slice(0, 70)}…`);
                continue;
            }
            out = out.split(find).join(replace);
        }
        if (misses.length > 0) {
            fail(`${label}: anchors drifted, file left untouched\n    ${misses.join('\n    ')}`);
            continue;
        }
        copyFileSync(file, file + ORIG);
        writeFileSync(file, MARK + out);
        say(`✓ ${label} patched`);
    }
}

if (!['apply', 'check', 'revert'].includes(MODE)) {
    console.error('usage: node apply.mjs [apply|check|revert]');
    process.exit(2);
}
if (MODE !== 'revert') {
    settingsStep();
    themeStep();
}
const dirs = packageDirs();
if (dirs.length === 0)
    fail(`no dsh-TUI install under ${DSH_HOME}/profiles — install it first (see README)`);
dirs.forEach(patchStep);
process.exit(failed ? 1 : 0);
