"""Replay a timestamped dsh-tui pty recording frame by frame and check that
the transcript only grows.

  replay.py <rec.raw> <cols> <rows> [-v]

Frames are cut at each cursor-hide (dsh-tui starts every frame with
ESC[?25l), fed to a pyte screen, and the transcript region (from the
`❯ Test:` prompt row to the input box) is compared frame to frame:

- CARD-FLASH: a tool card line (`• Bash(...)`) drawn and gone again before
  the final frame — the card-then-summary flash.
- SHRINK: a frame with fewer transcript rows than the one before. It fails
  when a tool line (summary `Ran 2 shell commands`, card, `⎿` body, Thinking row) was taken
  back; a reflow of the streamed answer text is only reported.

Prints `VERDICT ok` or `VERDICT FAIL`; exit code 1 on FAIL."""
import re, struct, sys
import pyte

path, cols, rows = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
verbose = '-v' in sys.argv
data = open(path, 'rb').read()
chunks, i = [], 0
while i < len(data):
    t, n = struct.unpack('<dI', data[i:i+12]); i += 12
    chunks.append((t, data[i:i+n])); i += n

screen = pyte.Screen(cols, rows)
stream = pyte.ByteStream(screen)
SPIN = re.compile(r'^\s*[·•●✻✽✶✳✢*⠁-⣿]\s+\S+…\s*\(')
SUMMARY = r'(Ran|Running|Read|Reading|Viewed|Viewing|Searched for|Searching for|Listed|Listing|Fetched|Fetching) \d|(运行了|正在运行|读取了|正在读取|查看了|正在查看|搜索了|正在搜索|列出了|正在列出|进行了|正在进行|抓取了|正在抓取) ?\d'
TOOL = re.compile(r'^\s*(▸|▾|[•⏺●✗]\s+[A-Z][\w ]*[( ]|⎿|\* Thinking|[⠁-⣿] Thinking|' + SUMMARY + ')')
CARD = re.compile(r'^\s*[•⏺●]?\s*[A-Z][A-Za-z ]*\(.*\)( · \d+(ms|s|m))?$')

def transcript():
    lines = [l.rstrip() for l in screen.display]
    top = next((k for k, l in enumerate(lines) if l.startswith(' ❯ Test:')), None)
    if top is None:
        return None
    bot = next((k for k, l in enumerate(lines) if k > top and l.lstrip().startswith('╭─')), len(lines))
    return [l for l in lines[top:bot] if l.strip() and not SPIN.match(l) and 'migrate' not in l]

frames = []
for t, b in chunks:
    for p in re.split(rb'(?=\x1b\[\?25l)', b):
        if p:
            stream.feed(p)
            body = transcript()
            if body is not None:
                frames.append((t, body))
if not frames:
    print('no transcript frames (prompt never submitted?)'); print('VERDICT FAIL'); sys.exit(1)
states = []
for t, body in frames:
    if not states or states[-1][1] != body:
        states.append((t, body))
t0 = states[0][0]
ms = lambda t: int((t - t0) * 1000)
if verbose:
    for t, body in states:
        print(f'=== +{ms(t)}ms')
        for l in body: print('   ', l[:110])

fail = 0
for k in range(1, len(states)):
    (ta, a), (tb, b) = states[k-1], states[k]
    if len(b) >= len(a):
        continue
    lost = [l for l in a if l not in b]
    tool = any(TOOL.match(l) for l in lost)
    fail += tool
    print(f'{"SHRINK" if tool else "reflow"} at +{ms(tb)}ms ({len(a)} -> {len(b)} rows, prior state {int((tb-ta)*1000)}ms)')
    for l in lost[:4]: print('   gone|', l.strip()[:100])
final = set(l.strip() for l in states[-1][1])
seen = {}
for t, body in states:
    for l in body:
        if CARD.match(l) and l.strip() not in final:
            seen.setdefault(re.sub(r'\d+(ms|s)\b', 'N', l.strip()), t)
for l, t in seen.items():
    print(f'CARD-FLASH at +{ms(t)}ms: {l[:100]}')
fail += len(seen)
print(f'{len(frames)} frames, {len(states)} states')
print('VERDICT', 'FAIL' if fail else 'ok')
sys.exit(1 if fail else 0)
