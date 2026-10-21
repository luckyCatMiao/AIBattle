"""Restore the latest series into the read-only spectator, without invoking models."""
import argparse,json,os,pathlib,subprocess,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run');parser.add_argument('--open',action='store_true');args=parser.parse_args()
    run=pathlib.Path(args.run) if args.run else pathlib.Path(json.loads((ROOT/'control/active-run.json').read_text(encoding='utf-8'))['path'])
    config=json.loads((run/'config.json').read_text(encoding='utf-8'));port=config.get('port',8789);url=f'http://127.0.0.1:{port}/'
    try:
        with urllib.request.urlopen(url+'api/arena',timeout=2) as r:
            if r.status==200:
                if args.open:os.startfile(url)
                return
    except OSError:pass
    records=json.loads((run/'replays.json').read_text(encoding='utf-8'))
    status=run/'status.json'
    if status.exists():meta=json.loads(status.read_text(encoding='utf-8'))
    else:meta={'completed':True,'phase':'比赛完成','round':config['rounds'],'results':json.loads((run/'results.json').read_text(encoding='utf-8'))}
    meta.setdefault('rounds',config['rounds'])
    log=(run/'replay-server.log').open('a',encoding='utf-8')
    p=subprocess.Popen(['node',str(ROOT/'arena.js')],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log,text=True,encoding='utf-8',creationflags=subprocess.CREATE_NO_WINDOW,env={**os.environ,'ARENA_PORT':str(port)})
    p.stdin.write(json.dumps({'type':'load','records':records,'meta':meta})+'\n');p.stdin.close()
    (ROOT/'control/viewer.json').write_text(json.dumps({'pid':p.pid,'url':url}),encoding='utf-8')
    if args.open:os.startfile(url)
if __name__=='__main__':main()
