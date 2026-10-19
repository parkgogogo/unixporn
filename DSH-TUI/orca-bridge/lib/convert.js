// Convert a DSH session log (session.v2–v4 JSONL) into a pi-format session (version 3 JSONL).
// Orca indexes pi-format files for its built-in "Prime Agent", which is how a mirror shows up
// in Orca's Session History and full-text search.

export const GENERATOR = 'dsh-orca-bridge';
// Mirrors written by the earlier standalone bridge carry this marker; cleanup recognizes both.
export const GENERATORS = new Set([GENERATOR, 'orca-dsh-history']);

export function parseEvents(text) {
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // the last line can be cut mid-write; anything unreadable is skipped
    }
  }
  return events;
}

// A delegated child's log: it resumes only through its parent, so it gets no row of its own.
export function isSubagentHeader(head) {
  return head.origin === 'subagent' || (Number.isFinite(head.delegationDepth) && head.delegationDepth > 0);
}

// Index of the first event this session owns. A fork (v2+: `isSeeded`) starts with its parent's
// history, which ends at the LAST `session/end-seed` marked `inherited` (a fork of a fork keeps
// its parent's marker too). Unmarked end-seed events close constructor setup and cut nothing.
// v0/v1 recorded the inherited event count as `seedLength` instead.
export function ownStart(head, events) {
  if (head.version >= 2) {
    if (head.isSeeded !== true) return 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'session/end-seed' && events[i].data?.inherited === true) return i + 1;
    }
    return 0;
  }
  const seed = head.seedLength > 0 ? head.seedLength : 0;
  if (!seed) return 0;
  const i = events.findIndex((e) => e.seq >= seed);
  return i === -1 ? events.length : i;
}

// `events` is the whole log, header line included.
// Returns { header, entries, updatedAt } or null when there is nothing to show
// (no header, a subagent log, or no typed prompt yet).
export function convertSession(events) {
  const head = events[0]?.type === 'session' ? events[0] : events.find((e) => e.type === 'session');
  if (!head?.id || !head.cwd || isSubagentHeader(head)) return null;
  const body = events.filter((e) => e !== head);
  const own = body.slice(ownStart(head, body));

  const entries = [];
  let parentId = null;
  let counter = 0;
  let title = null;
  let model = null;
  let lastTime = head.createdAt;
  const toolNames = new Map();

  const add = (time, message) => {
    const id = (++counter).toString(16).padStart(8, '0');
    entries.push({ type: 'message', id, parentId, timestamp: iso(time), message: { ...message, timestamp: time } });
    parentId = id;
    lastTime = time;
  };

  // A fork keeps its parent's title until it is given its own.
  for (const ev of body) {
    if (ev.type === 'session/title' && typeof ev.data?.title === 'string' && ev.data.title.trim()) title = ev.data.title.trim();
  }

  for (const ev of own) {
    const d = ev.data ?? {};
    switch (ev.type) {
      case 'user/message':
        // only what the person typed; approval notices, runtime context and skill catalogs are synthetic
        if (d.source?.kind === 'user') add(ev.time, { role: 'user', content: userContent(d.content) });
        break;
      case 'assistant/message': {
        const m = d.message ?? {};
        const content = [];
        for (const part of m.content ?? []) {
          if (part.type === 'text' && part.text) content.push({ type: 'text', text: part.text });
          else if (part.type === 'reasoning' && part.text) content.push({ type: 'thinking', thinking: part.text });
          else if (part.type === 'tool-call') {
            toolNames.set(part.id, part.name);
            content.push({ type: 'toolCall', id: part.id, name: part.name, arguments: parseArgs(part.arguments) });
          }
        }
        if (!content.length) break;
        model = m.source?.model ?? model;
        add(ev.time, {
          role: 'assistant',
          content,
          provider: m.source?.provider ?? 'deepseek',
          model: m.source?.model ?? model ?? 'dsh',
          ...(d.usage ? { usage: usage(d.usage) } : {}),
        });
        break;
      }
      case 'tool/result': {
        const m = d.message ?? {};
        add(ev.time, {
          role: 'toolResult',
          toolCallId: m.toolCallId,
          toolName: toolNames.get(m.toolCallId) ?? '',
          content: toolContent(m.content),
          isError: Boolean(m.isError),
        });
        break;
      }
    }
  }

  if (!entries.some((e) => e.message.role === 'user')) return null;
  const header = {
    type: 'session',
    version: 3,
    id: head.id,
    timestamp: iso(head.createdAt),
    cwd: head.cwd,
    ...(title ? { title } : {}),
    generator: GENERATOR,
  };
  const meta = [];
  // pi's own record for a session name; Orca titles Prime Agent rows by the first prompt for now
  if (title) meta.push({ type: 'session_info', id: 'title000', parentId: null, timestamp: header.timestamp, name: title });
  if (model) meta.push({ type: 'model_change', id: 'model000', parentId: null, timestamp: header.timestamp, provider: 'deepseek', modelId: model });
  return { header, entries: [...meta, ...entries], updatedAt: lastTime };
}

export function serialize({ header, entries }) {
  return [header, ...entries].map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function userContent(parts = []) {
  const out = [];
  for (const p of parts) {
    if (p.type === 'text' && p.text) out.push({ type: 'text', text: p.text });
    else if (p.type === 'image') out.push({ type: 'text', text: imageLabel(p) });
  }
  return out.length ? out : [{ type: 'text', text: '' }];
}

// Images are kept as a placeholder: the attachment bytes live in DSH's own store, not in the log.
function toolContent(parts = []) {
  const out = [];
  for (const p of parts) {
    if (p.type === 'text') out.push({ type: 'text', text: p.text ?? '' });
    else if (p.type === 'image') out.push({ type: 'text', text: imageLabel(p) });
  }
  return out;
}

const imageLabel = (p) => `[image${p.attachment?.name ? `: ${p.attachment.name}` : ''}]`;

function usage(u) {
  const input = u.inputTokens ?? 0;
  const output = u.outputTokens ?? 0;
  return {
    input,
    output,
    cacheRead: u.cacheReadTokens ?? 0,
    cacheWrite: u.cacheWriteTokens ?? 0,
    totalTokens: u.totalTokens ?? input + output,
  };
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw: String(raw ?? '') };
  }
}

const iso = (ms) => new Date(ms).toISOString();
