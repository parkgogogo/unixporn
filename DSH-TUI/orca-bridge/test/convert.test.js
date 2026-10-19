import test from 'node:test';
import assert from 'node:assert/strict';
import { decompressFrames } from '../lib/zstd.js';
import { convertSession, parseEvents } from '../lib/convert.js';
import { sampleEvents, toZstdFrames } from './fixture.js';

const messages = (converted) => converted.entries.filter((e) => e.type === 'message').map((e) => e.message);

test('decompresses every concatenated frame', () => {
  const events = sampleEvents();
  const text = decompressFrames(toZstdFrames(events)).toString('utf8');
  assert.equal(parseEvents(text).length, events.length);
});

test('ignores a truncated trailing frame', () => {
  const events = sampleEvents();
  const buf = toZstdFrames(events);
  const cut = buf.subarray(0, buf.length - 5);
  assert.equal(parseEvents(decompressFrames(cut).toString('utf8')).length, events.length - 1);
});

test('converts to a pi-format session', () => {
  const converted = convertSession(sampleEvents());
  const { header, entries } = converted;
  assert.deepEqual(
    { type: header.type, version: header.version, id: header.id, cwd: header.cwd, title: header.title, generator: header.generator },
    { type: 'session', version: 3, id: '11111111-2222-3333-4444-555555555555', cwd: '/work/demo', title: 'List files', generator: 'dsh-orca-bridge' },
  );
  const m = messages(converted);
  assert.deepEqual(m.map((x) => x.role), ['user', 'assistant', 'toolResult', 'assistant']);
  assert.equal(m[0].content[0].text, 'list the files please'); // the approval notice is dropped
  assert.deepEqual(m[1].content.map((c) => c.type), ['thinking', 'text', 'toolCall']);
  assert.deepEqual(m[1].content[2].arguments, { command: 'ls' });
  assert.equal(m[2].toolName, 'bash');
  assert.equal(m[2].content[1].text, '[image: shot.png]');
  assert.equal(entries.find((e) => e.type === 'session_info').name, 'List files');
  // entries form a single parent chain
  const msgs = entries.filter((e) => e.type === 'message');
  msgs.forEach((e, i) => assert.equal(e.parentId, i === 0 ? null : msgs[i - 1].id));
});

test('keeps the model and token usage', () => {
  const events = sampleEvents();
  const am = events.find((e) => e.type === 'assistant/message');
  am.data.message.source = { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash' };
  am.data.usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 0, totalTokens: 17 };
  const converted = convertSession(events);
  const reply = messages(converted)[1];
  assert.equal(reply.model, 'deepseek-flash');
  assert.equal(reply.provider, 'deepseek-official');
  assert.equal(reply.usage.totalTokens, 17);
  assert.equal(converted.entries.find((e) => e.type === 'model_change').modelId, 'deepseek-flash');
});

test('skips a session without a user prompt', () => {
  const blank = sampleEvents().filter((e) => e.type === 'session' || e.data?.source?.kind === 'user-approval');
  assert.equal(convertSession(blank), null);
});

test('skips delegated subagent logs', () => {
  const events = sampleEvents();
  events[0] = { ...events[0], delegationDepth: 1 };
  assert.equal(convertSession(events), null);
  events[0] = { ...events[0], delegationDepth: 0, origin: 'subagent' };
  assert.equal(convertSession(events), null);
});

test('a fork shows only its own turns, under the inherited title', () => {
  const parent = sampleEvents();
  const t = parent.at(-1).time;
  const fork = [
    { ...parent[0], id: 'fork-1', isSeeded: true },
    ...parent.slice(1),
    { type: 'session/end-seed', seq: 9, time: t + 1, data: { inherited: true } },
    { type: 'user/message', seq: 10, time: t + 2, data: { role: 'user', content: [{ type: 'text', text: 'now count them' }], source: { kind: 'user' } } },
    { type: 'assistant/message', seq: 11, time: t + 3, data: { message: { role: 'assistant', content: [{ type: 'text', text: 'Two.' }] } } },
  ];
  const converted = convertSession(fork);
  assert.deepEqual(messages(converted).map((x) => x.content[0].text), ['now count them', 'Two.']);
  assert.equal(converted.header.title, 'List files');
});

test('an unmarked end-seed cuts nothing', () => {
  const events = sampleEvents();
  events.splice(1, 0, { type: 'session/end-seed', seq: 0, time: events[0].createdAt, data: {} });
  assert.equal(messages(convertSession(events)).length, 4);
});
