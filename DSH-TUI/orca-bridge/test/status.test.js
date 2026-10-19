import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createOrcaHookClient, orcaPaneFromEnv } from '../lib/orca-hook.js';
import { attachStatus } from '../lib/status.js';

// A stand-in for Orca's hook server that records what each POST carried.
async function fakeOrca() {
  const posts = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const form = new URLSearchParams(body);
      posts.push({ path: req.url, token: req.headers['x-orca-agent-hook-token'], paneKey: form.get('paneKey'), payload: JSON.parse(form.get('payload')) });
      res.end('ok');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { posts, port: server.address().port, close: () => server.close() };
}

function fakeCtx() {
  const listeners = new Map();
  const agents = new Map();
  return {
    agents,
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) => (name === 'agents' ? agents : undefined),
    emit: (name, ...args) => (listeners.get(name) ?? []).forEach((fn) => fn(...args)),
    middleware: (name, ...args) => (listeners.get(name) ?? []).forEach((fn) => fn(...args, () => Promise.resolve({ kind: 'continue' }))),
    has: (name) => listeners.has(name),
  };
}

const agent = (id, extra = {}) => ({ id, session: { header: { id: `s-${id}`, cwd: '/work/demo', version: 4, ...extra } } });
const ev = (type, data) => ({ type, data });

async function setup(mode) {
  const orca = await fakeOrca();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-endpoint-'));
  const endpoint = path.join(dir, 'endpoint.env');
  fs.writeFileSync(endpoint, `ORCA_AGENT_HOOK_PORT=${orca.port}\nORCA_AGENT_HOOK_TOKEN='tok-1'\nORCA_AGENT_HOOK_ENV=production\nORCA_AGENT_HOOK_VERSION=1\n`);
  // the port in the env is stale on purpose: the endpoint file wins
  const pane = orcaPaneFromEnv({ ORCA_AGENT_PANE: 'tab:pane', ORCA_TAB_ID: 'tab', ORCA_AGENT_HOOK_ENDPOINT: endpoint, ORCA_AGENT_HOOK_PORT: '1' });
  const client = createOrcaHookClient(pane);
  const ctx = fakeCtx();
  attachStatus(ctx, client, { mode });
  return { orca, ctx, client, done: () => { orca.close(); fs.rmSync(dir, { recursive: true }); } };
}

function turn(ctx, lead, { tool = true, approval = false, error = false } = {}) {
  const s = lead.session;
  ctx.emit('agent/status', { agent: lead, status: 'running' });
  ctx.emit('session/event', s, ev('turn/start', { turn: 1 }));
  ctx.emit('session/event', s, ev('user/message', { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'ctx' }] }));
  ctx.emit('session/event', s, ev('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: 'list files' }] }));
  if (tool) {
    ctx.emit('session/event', s, ev('assistant/message', { message: { content: [{ type: 'text', text: 'Listing.' }, { type: 'tool-call', name: 'bash' }] } }));
    ctx.middleware('tools/pre-execute', { agent: lead, name: 'bash', arguments: { command: 'ls' }, callId: 'c1' });
    if (approval) {
      ctx.emit('session/event', s, ev('approval/asked', { id: 'a1', toolName: 'bash', reason: 'writes outside the workspace' }));
      ctx.emit('session/event', s, ev('approval/decided', { id: 'a1', outcome: 'allowed-once' }));
    }
    ctx.middleware('tools/post-execute', { agent: lead, name: 'bash', arguments: { command: 'ls' }, callId: 'c1' }, { content: [{ type: 'text', text: 'a.txt' }] });
  }
  if (error) {
    ctx.emit('session/event', s, ev('turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'request failed' } } }));
  } else {
    ctx.emit('session/event', s, ev('assistant/message', { message: { content: [{ type: 'reasoning', text: 'hm' }, { type: 'text', text: 'Two files.' }] } }));
    ctx.emit('agent/turn-stopping', { agent: lead });
    ctx.emit('session/event', s, ev('turn/end', { turn: 1, reason: { kind: 'completed' } }));
  }
  ctx.emit('agent/status', { agent: lead, status: 'idle' });
}

const names = (posts) => posts.map((p) => `${p.payload.hook_event_name}${p.payload.tool_name ? `(${p.payload.tool_name})` : ''}`);

test('full mode sends the whole lifecycle in order, with the reply on Stop', async () => {
  const { orca, ctx, client, done } = await setup('full');
  const lead = agent('lead');
  ctx.emit('agent/created', { agent: lead, source: 'startup' });
  turn(ctx, lead, { approval: true });
  await client.idle();
  assert.deepEqual(names(orca.posts), [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse(bash)',
    'PreToolUse(AskUserQuestion)',
    'PostToolUse(AskUserQuestion)',
    'PostToolUse(bash)',
    'Stop',
  ]);
  const by = (n) => orca.posts.find((p) => p.payload.hook_event_name === n).payload;
  assert.equal(by('UserPromptSubmit').prompt, 'list files');
  assert.equal(by('Stop').last_assistant_message, 'Two files.');
  assert.equal(orca.posts[3].payload.tool_input.questions[0].question, 'Allow bash? writes outside the workspace');
  assert.ok(orca.posts.every((p) => p.path === '/hook/dsh' && p.token === 'tok-1' && p.paneKey === 'tab:pane'));
  assert.ok(orca.posts.every((p) => p.payload.session_id === 's-lead' && p.payload.cwd === '/work/demo'));
  done();
});

test('complement mode adds only approvals and the Stop', async () => {
  const { orca, ctx, client, done } = await setup('complement');
  assert.equal(ctx.has('tools/pre-execute'), false);
  const lead = agent('lead');
  ctx.emit('agent/created', { agent: lead, source: 'startup' });
  turn(ctx, lead, { approval: true });
  await client.idle();
  assert.deepEqual(names(orca.posts), ['PreToolUse(AskUserQuestion)', 'PostToolUse(AskUserQuestion)', 'Stop']);
  done();
});

test('a turn that fails still ends with Stop, carrying the error', async () => {
  const { orca, ctx, client, done } = await setup('complement');
  const lead = agent('lead');
  turn(ctx, lead, { tool: false, error: true });
  await client.idle();
  assert.deepEqual(names(orca.posts), ['Stop']);
  assert.equal(orca.posts[0].payload.last_assistant_message, 'Error: request failed');
  done();
});

test('subagents do not drive the pane', async () => {
  const { orca, ctx, client, done } = await setup('full');
  const lead = agent('lead');
  const child = agent('child');
  ctx.agents.set('child', child);
  ctx.emit('subagent/start', { id: 'child', runId: 'r1' });
  ctx.emit('agent/created', { agent: child, source: 'startup' });
  turn(ctx, child);
  const nested = agent('nested', { delegationDepth: 1 });
  turn(ctx, nested);
  await client.idle();
  assert.deepEqual(orca.posts, []);
  turn(ctx, lead, { tool: false });
  await client.idle();
  assert.deepEqual(names(orca.posts), ['UserPromptSubmit', 'Stop']);
  done();
});

test('an unreachable Orca never throws into DSH', async () => {
  const pane = orcaPaneFromEnv({ ORCA_PANE_KEY: 'p', ORCA_AGENT_HOOK_PORT: '1', ORCA_AGENT_HOOK_TOKEN: 't' });
  let errors = 0;
  const client = createOrcaHookClient(pane, { onError: () => errors++ });
  assert.equal(await client.send({ hook_event_name: 'Stop' }), false);
  assert.equal(errors, 1);
  assert.equal(orcaPaneFromEnv({}), null);
});
