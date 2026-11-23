"""Phone UI over adb: `labels` lists what is on screen; `tap REGEX` taps the
first view whose text or content-desc matches; `wait REGEX [secs]` waits for one."""
import re, subprocess, sys, time

def dump():
    subprocess.run(['adb', 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], capture_output=True)
    return subprocess.run(['adb', 'shell', 'cat', '/sdcard/ui.xml'], capture_output=True, text=True).stdout

def nodes(xml):
    for m in re.finditer(r'<node [^>]*>', xml):
        n = m.group(0)
        text = re.search(r' text="([^"]*)"', n).group(1)
        desc = re.search(r'content-desc="([^"]*)"', n).group(1)
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            x1, y1, x2, y2 = map(int, b.groups())
            yield (text or desc), ((x1 + x2) // 2, (y1 + y2) // 2)

def find(pattern, xml=None):
    rx = re.compile(pattern, re.I)
    for label, xy in nodes(xml or dump()):
        if label and rx.search(label):
            return label, xy
    return None

cmd = sys.argv[1]
if cmd == 'labels':
    seen = []
    for label, _ in nodes(dump()):
        if label and label not in seen:
            seen.append(label)
    print('\n'.join(seen[:80]))
elif cmd == 'tap':
    hit = find(sys.argv[2])
    if not hit:
        print('NOT FOUND:', sys.argv[2]); sys.exit(1)
    subprocess.run(['adb', 'shell', 'input', 'tap', str(hit[1][0]), str(hit[1][1])])
    print('tapped:', hit[0], hit[1])
elif cmd == 'wait':
    end = time.time() + float(sys.argv[3] if len(sys.argv) > 3 else 10)
    while time.time() < end:
        hit = find(sys.argv[2])
        if hit:
            print('found:', hit[0]); sys.exit(0)
        time.sleep(0.8)
    print('TIMEOUT:', sys.argv[2]); sys.exit(1)
