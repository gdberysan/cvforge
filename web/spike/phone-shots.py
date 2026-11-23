"""Screenshots down the page in front, each one proven different: the visible
labels must change after every scroll, and the app must stay in front."""
import subprocess, sys, time, hashlib
sys.path.insert(0, 'web/spike')

def sh(*a):
    return subprocess.run(['adb', 'shell', *a], capture_output=True, text=True, stdin=subprocess.DEVNULL).stdout

def front():
    out = sh('dumpsys', 'window')
    for line in out.splitlines():
        if 'mCurrentFocus' in line:
            return line
    return ''

def signature():
    """The screen's pixels below the status bar (its clock changes): nested
    scrollers keep their text bounds still while their content moves."""
    raw = subprocess.run(['adb', 'exec-out', 'screencap'], capture_output=True, stdin=subprocess.DEVNULL).stdout
    w = int.from_bytes(raw[0:4], 'little')
    header = 16 if len(raw) > 16 and (len(raw) - 16) % (w * 4) == 0 else 12
    skip = header + 200 * w * 4
    return hashlib.md5(raw[skip:]).hexdigest()

app = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 6
shots = 0
for i in range(limit):
    if app not in front():
        print('stop: app not in front'); break
    before = signature()
    sh('input', 'keyevent', '120')
    shots += 1
    time.sleep(4.5)  # Samsung's screenshot toolbar sits over the bottom for a few seconds
    moved = False
    for attempt in range(3):
        sh('input', 'swipe', '720', '1900', '720', '800', '600')
        time.sleep(1.8)
        if signature() != before:
            moved = True
            break
    print(f'shot {shots} taken; scrolled after it: {moved}')
    if not moved:
        print('end of page'); break
print('shots', shots)
