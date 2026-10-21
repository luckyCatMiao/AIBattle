"""Open the saved Combat Lab gallery without initiating model requests."""
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import webbrowser

def main():
    root=Path(__file__).resolve().parent
    url='http://127.0.0.1:8805/'
    def serving():
        try:
            with urllib.request.urlopen(url+'api/runs',timeout=2) as response:
                return response.status==200
        except OSError:return False
    if not serving():
        with (root/'combat-launcher.log').open('ab') as log:
            subprocess.Popen([sys.executable,str(root/'combat_bench.py'),'--serve','--port','8805'],
                cwd=root,stdout=log,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        for _ in range(30):
            if serving():break
            time.sleep(.15)
        else:raise RuntimeError('试玩服务未能启动，请查看 combat-launcher.log')
    latest=root/'latest-combat-run.txt'
    if latest.exists():url+='?run='+latest.read_text(encoding='utf-8').strip()
    webbrowser.open(url)

if __name__=='__main__':main()
