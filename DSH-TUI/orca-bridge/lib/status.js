// DSH events → the Claude-shaped hook events Orca's DSH integration reads
// (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop; see Orca's
// `normalizeDshEvent`). Orca maps them to working / waiting / done.
//
// Two modes:
// - full: Orca has not installed its own DSH hook row (`orca-agent-hooks` in
//   $DSH_HOME/cordis.patch.yml), so this plugin sends every event itself.
// - complement: Orca's row is loaded and already sends the five events through
//   DSH's generic Claude-hook bridge; this plugin adds only what that bridge cannot:
//   * waiting while an approval prompt is open (the bridge has no permission event,
//     so Orca shows "working" while DSH waits for you),
//   * the reply text on Stop (the bridge sends none, so Orca's preview and
//     notification show the last tool output instead),
//   * a Stop for turns that end in an error or a cancel (the bridge sends no Stop
//     then, and Orca stays on "working").
import { isSubagentHeader } from './convert.js';

// Orca reads `waiting` from PreToolUse of an ask-user tool (`isAskUserQuestionTool`), and the
// tool input becomes the question card; PostToolUse of the same tool returns the pane to working.
const QUESTION_TOOL = 'AskUserQuestion';

export function attachStatus(ctx, client, { mode }) {
  const full = mode === 'full';
  const children = new Set(); // agent ids of delegated children
  const childSessions = new Set();
  const turns = new Map(); // lead session id -> { text, error, stopped }
  const approvals = new Map(); // approval id -> question input

  const turnOf = (sessionId) => {
    let t = turns.get(sessionId);
    if (!t) turns.set(sessionId, (t = { text: null, error: null, stopped: true }));
    return t;
  };
  const isLeadSession = (session) =>
    Boolean(session?.header) && !isSubagentHeader(session.header) && !childSessions.has(session.header.id);
  const isLead = (agent) => Boolean(agent) && !children.has(agent.id) && isLeadSession(agent.session);
  const base = (session, event) => ({
    session_id: session?.header?.id ?? '',
    transcript_path: '',
    cwd: session?.header?.cwd ?? process.cwd(),
    hook_event_name: event,
  });
  const send = (session, event, fields = {}) => {
    client.send({ ...base(session, event), ...fields });
  };

  function stop(agent) {
    const t = turnOf(agent.session.header.id);
    if (t.stopped) return;
    t.stopped = true;
    const message = t.text ?? (t.error ? `Error: ${t.error}` : null);
    send(agent.session, 'Stop', { stop_hook_active: false, ...(message ? { last_assistant_message: message } : {}) });
  }

  ctx.on('subagent/start', (info) => {
    children.add(info.id);
    const sid = ctx.get('agents')?.get(info.id)?.session?.header?.id;
    if (sid) childSessions.add(sid);
  });
  ctx.on('subagent/end', (info) => children.delete(info.id));

  ctx.on('agent/created', ({ agent, source }) => {
    if (!isLead(agent)) return;
    turnOf(agent.session.header.id).stopped = true;
    if (full) send(agent.session, 'SessionStart', { source });
  });

  ctx.on('agent/status', ({ agent, status }) => {
    if (!isLead(agent)) return;
    const t = turnOf(agent.session.header.id);
    if (status === 'running') {
      t.stopped = false;
    } else if (status === 'idle') {
      // A completed turn already sent Stop from turn-stopping; this catches errors and cancels.
      stop(agent);
    }
  });

  ctx.on('agent/turn-stopping', ({ agent }) => {
    if (isLead(agent)) stop(agent);
  });

  // Read single fields only: serializing a whole event materializes embedded assistant
  // streams, which broke DSH's next model request in testing.
  ctx.on('session/event', (session, event) => {
    const d = event.data ?? {};
    switch (event.type) {
      // Every turn ends in one Stop, including turns DSH starts itself (goal rounds, follow-ups).
      case 'turn/start': {
        if (!isLeadSession(session)) return;
        Object.assign(turnOf(session.header.id), { text: null, error: null, stopped: false });
        return;
      }
      case 'user/message': {
        if (full && d.source?.kind === 'user' && isLeadSession(session)) {
          send(session, 'UserPromptSubmit', { prompt: textOf(d.content) });
        }
        return;
      }
      case 'assistant/message': {
        if (!isLeadSession(session)) return;
        const text = textOf(d.message?.content).trim();
        if (text) turnOf(session.header.id).text = text;
        return;
      }
      case 'turn/end': {
        if (!isLeadSession(session)) return;
        const reason = d.reason ?? {};
        if (reason.kind === 'error') turnOf(session.header.id).error = reason.error?.message ?? 'turn failed';
        return;
      }
      // A child's approval waits on you too, so these are not filtered to the lead.
      case 'approval/asked': {
        const input = approvalQuestion(d.toolName, d.reason);
        approvals.set(d.id, input);
        send(session, 'PreToolUse', { tool_name: QUESTION_TOOL, tool_input: input, tool_use_id: `approval:${d.id}` });
        return;
      }
      case 'approval/decided': {
        const input = approvals.get(d.id) ?? approvalQuestion('', '');
        approvals.delete(d.id);
        send(session, 'PostToolUse', {
          tool_name: QUESTION_TOOL,
          tool_input: input,
          tool_use_id: `approval:${d.id}`,
          tool_response: '',
        });
        return;
      }
    }
  });

  if (!full) return;

  ctx.on('tools/pre-execute', (exec, next) => {
    if (isLead(exec.agent)) {
      send(exec.agent.session, 'PreToolUse', { tool_name: exec.name, tool_input: exec.arguments, tool_use_id: exec.callId });
    }
    return next();
  });

  ctx.on('tools/post-execute', (exec, result, next) => {
    if (isLead(exec.agent)) {
      send(exec.agent.session, 'PostToolUse', {
        tool_name: exec.name,
        tool_input: exec.arguments,
        tool_use_id: exec.callId,
        tool_response: textOf(result?.content),
      });
    }
    return next();
  });
}

function approvalQuestion(toolName, reason) {
  const what = toolName ? `Allow ${toolName}?` : 'Approval needed';
  return { questions: [{ header: 'Approval', question: reason ? `${what} ${reason}` : what }] };
}

function textOf(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
}
