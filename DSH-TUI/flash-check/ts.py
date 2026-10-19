import os, sys, time, struct
out = open(sys.argv[1], 'ab', buffering=0)
fd = sys.stdin.fileno()
while True:
    b = os.read(fd, 65536)
    if not b: break
    out.write(struct.pack('<dI', time.time(), len(b)) + b)
