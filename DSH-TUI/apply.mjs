#!/usr/bin/env node
// Apply the unixporn look to dsh-TUI: /settings values and the Claude Dark
// theme. One-line Bash cards, folded tool runs and status-only thinking are
// settings of the fork (github.com/parkgogogo/dsh-TUI, branch unixporn);
// this script checks that the fork is what the profiles run.
//
//   node apply.mjs           apply settings + theme, check the fork
//   node apply.mjs check     report what is applied, change nothing
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODE = process.argv[2] ?? 'apply';
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');
const TUI_HOME = join(homedir(), '.dsh-tui');
const THEME = 'claude-dark-1e1e1e';
// Present only in the fork build: the folded tool-run summary line.
const FORK_MARKER = 'lib/types/components/Chat/ToolGroup.js';
// Left behind by the old string-patch apply.mjs; the fork replaces it.
const OLD_PATCH_MARK = '/* unixporn-patch';

let failed = false;
const say = (msg) => console.log(msg);
const fail = (msg) => { failed = true; console.error(`✗ ${msg}`); };

function readJson(path, fallback) {
    if (!existsSync(path))
        return fallback;
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (error) {
        throw new Error(`${path} is not valid JSON (${error.message}) — fix or move it, then re-run`);
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
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    writeFileSync(pref, `${JSON.stringify({ theme: THEME }, null, 2)}\n`);
    say(`✓ theme ${THEME} installed and selected`);
    if (process.env.DSH_TUI_THEME)
        say(`  note: DSH_TUI_THEME=${process.env.DSH_TUI_THEME} overrides theme.json`);
}

function forkStep(dir) {
    const profile = dir.split('/profiles/')[1].split('/')[0];
    const version = readJson(join(dir, 'package.json')).version;
    const label = `dsh-tui ${version} (profile ${profile})`;
    if (existsSync(join(dir, FORK_MARKER)))
        return say(`✓ ${label} is the unixporn fork`);
    const patched = ['MessageList.js', 'messages/AssistantToolUseMessage.js']
        .some((file) => {
            const path = join(dir, 'lib/types/components', file);
            return existsSync(path) && readFileSync(path, 'utf8').startsWith(OLD_PATCH_MARK);
        });
    fail(`${label} is ${patched ? 'the npm release with the old string patch' : 'the npm release'} — install the fork (README step 1); compactTools and thinkingFold "status" do nothing on it`);
}

if (!['apply', 'check'].includes(MODE)) {
    console.error('usage: node apply.mjs [apply|check]');
    process.exit(2);
}
try {
    settingsStep();
    themeStep();
}
catch (error) {
    fail(error.message);
}
const dirs = packageDirs();
if (dirs.length === 0)
    fail(`no dsh-TUI install under ${DSH_HOME}/profiles — install it first (see README)`);
dirs.forEach(forkStep);
process.exit(failed ? 1 : 0);
