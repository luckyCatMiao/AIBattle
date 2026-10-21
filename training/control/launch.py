"""User-invoked launcher; keep work in hidden processes and open the live board."""
import json, pathlib, subprocess, sys, time, urllib.request, webbrowser

root=pathlib.Path(__file__).resolve().parents[2]
active=root/'training'/'active-run.json'
players=['luna','sol']
if active.exists():
    active_info=json.loads(active.read_text(encoding='utf-8'))
    pid=active_info['pid']; players=active_info.get('players',players)
    check=subprocess.run(['powershell.exe','-NoProfile','-Command',
        f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}'; if ($p.CommandLine -match 'training.*train.py') {{ exit 1 }}"],capture_output=True)
    if check.returncode==1:
        print('A training batch is already running. Opening the live board.')
        webbrowser.open('http://127.0.0.1:8787')
        raise SystemExit(0)
try:
    urllib.request.urlopen('http://127.0.0.1:8787/api/state',timeout=2).close()
except OSError:
    subprocess.Popen(['node','server.js'],cwd=root,creationflags=subprocess.CREATE_NO_WINDOW,
        stdout=(root/'server.log').open('a'),stderr=(root/'server-error.log').open('a'))
    for _ in range(30):
        try:
            urllib.request.urlopen('http://127.0.0.1:8787/api/state',timeout=1).close()
            break
        except OSError: time.sleep(.2)
    else: raise SystemExit('Could not start the game service. Check server-error.log.')
with (root/'training'/'latest.log').open('w',encoding='utf-8') as out, (root/'training'/'latest-error.log').open('w',encoding='utf-8') as err:
    proc=subprocess.Popen([sys.executable,'-u',str(root/'training'/'control'/'train.py'),'--cycles','3','--players',*players],
        cwd=root,stdout=out,stderr=err,creationflags=subprocess.CREATE_NO_WINDOW)
print(f'Started 3 more review/improvement cycles (PID {proc.pid}).')
webbrowser.open('http://127.0.0.1:8787')
