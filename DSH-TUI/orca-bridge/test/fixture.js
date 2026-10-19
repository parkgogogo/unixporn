import zlib from 'node:zlib';

// A small synthetic DSH session log in the session.v4 shape.
export function sampleEvents({ id = '11111111-2222-3333-4444-555555555555', cwd = '/work/demo' } = {}) {
  const t0 = Date.UTC(2026, 9, 1, 8, 0, 0);
  return [
    { type: 'session', version: 4, id, createdAt: t0, cwd, isSeeded: false, delegationDepth: 0, agentPreset: 'standard' },
    { type: 'user/message', seq: 1, time: t0 + 10, data: { role: 'user', content: [{ type: 'text', text: 'The approval policy changed.' }], source: { kind: 'user-approval' } } },
    { type: 'user/message', seq: 2, time: t0 + 20, data: { role: 'user', content: [{ type: 'text', text: 'list the files please' }], source: { kind: 'user' } } },
    { type: 'session/title', seq: 3, time: t0 + 30, data: { title: 'List files', source: { kind: 'llm' } } },
    {
      type: 'assistant/message', seq: 4, time: t0 + 40,
      data: { turn: 1, step: 1, message: { role: 'assistant', content: [
        { type: 'reasoning', text: 'Run ls.' },
        { type: 'text', text: 'Listing.' },
        { type: 'tool-call', id: 'call_1', name: 'bash', arguments: '{"command":"ls"}' },
      ] } },
    },
    { type: 'tool/call', seq: 5, time: t0 + 41, data: { turn: 1, step: 1, callId: 'call_1', name: 'bash', arguments: '{"command":"ls"}' } },
    {
      type: 'tool/result', seq: 6, time: t0 + 50,
      data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'call_1', content: [
        { type: 'text', text: 'a.txt\nb.txt\n' },
        { type: 'image', attachment: { name: 'shot.png' } },
      ], isError: false } },
    },
    { type: 'assistant/message', seq: 7, time: t0 + 60, data: { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: 'Two files.' }] } } },
    { type: 'turn/end', seq: 8, time: t0 + 61, data: { turn: 1, reason: { kind: 'completed' } } },
  ];
}

// DSH appends one zstd frame per write; reproduce that by compressing each line separately.
export function toZstdFrames(events) {
  return Buffer.concat(events.map((e) => zlib.zstdCompressSync(Buffer.from(JSON.stringify(e) + '\n'))));
}
