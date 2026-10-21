"""Review -> private strategy revision -> color-swapped games -> repeat.

Coordinator only; contains no move selection or contestant strategy.
"""
import argparse, concurrent.futures, hashlib, json, pathlib, queue, shutil
import subprocess, sys, threading, time, urllib.request, socket, msvcrt

ROOT = pathlib.Path(__file__).resolve().parents[2]
TRAIN = ROOT / 'training'
CONTROL = TRAIN / 'control'
ISOLATE = '/mnt/c/Users/Admin/Desktop/AIBattle/training/control/isolate.py'
CATALOG = {'luna': 'gpt-6-luna', 'sol': 'gpt-6.1-sol', 'astra': 'gpt-6-astra'}
LABELS = {'luna': 'GPT-6 Luna', 'sol': 'GPT-6.1 Sol', 'astra': 'GPT-6 Astra'}
MODELS = {who:CATALOG[who] for who in ('luna','sol')}
RUN = None
STATE = {}
LOCK = threading.Lock()

def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def status(event, **data):
    with LOCK:
        record = {'at':time.strftime('%Y-%m-%dT%H:%M:%S'), 'event':event, **data}
        STATE.update(record)
        save(TRAIN / 'status.json', STATE)
        with (RUN / 'events.jsonl').open('a', encoding='utf-8') as f:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')
        print(json.dumps(record, ensure_ascii=False), flush=True)

def command(who, mode, args):
    return ['wsl.exe','-d','Ubuntu','-u','root','--','runuser','-u','nobody','--',
            'python3',ISOLATE,who,mode,*args]

def codex_args(who, output='submission.txt'):
    return ['timeout','--signal=TERM','650s','codex','exec','--ignore-user-config',
            '--ignore-rules','--ephemeral','--skip-git-repo-check',
            '--dangerously-bypass-approvals-and-sandbox',
            '-m',MODELS[who],'-c','model_reasoning_effort="medium"',
            '-c','web_search="disabled"',
            '--disable','apps','--disable','plugins','--disable','multi_agent',
            '--disable','computer_use','--disable','browser_use',
            '--disable','in_app_browser','--disable','memories',
            '--disable','hooks','--json','-o','/workspace/'+output,'-']

def probe(who):
    res = subprocess.run(command(who,'prepare',['python3','probe.py',who]),
                         capture_output=True,text=True,encoding='utf-8',timeout=30)
    if res.returncode: raise RuntimeError(res.stderr)
    return json.loads(res.stdout)

def prepare(who, iteration):
    status('preparing',player=who,iteration=iteration)
    records=json.loads((TRAIN/who/'public_replays.json').read_text(encoding='utf-8'))
    recent=' '.join(g['id'] for g in records[-2:]) if iteration>1 else 'No games from this new batch yet.'
    prompt = f'''You are {MODELS[who]}, the {who} contestant in iteration {iteration}.
Your task is to play Gomoku well against another independent AI, learn from the public records, and improve your own strategy.
Read RULES.md, your own previous_bot.py / engine files if present, and public_replays.json. If no previous engine exists, author your own from scratch. There are {len(records)} completed public records. Some early records repeat sequences, so deduplicate them rather than treating repetitions as independent evidence. The newest games from this batch to prioritize in your review are: {recent}
Choose your own strategy: direct reasoning, a self-authored program, or a hybrid. You may redesign your own implementation. Do not obtain any other contestant's private implementation. No network browsing or downloading engines. You only have your own workspace.
Complete the input/output protocol from RULES.md in entry.json. If programming, test the entrypoint on multiple real/relevant positions and check your time budget. Do not merely discuss changes: implement and test them. Do not touch previous_bot.py if it exists. Write review.md describing concrete replay mistakes with game IDs and move numbers, your changes, validation, and remaining weaknesses. Keep useful notes for future iterations.
Both contestants have the same preparation instructions and medium reasoning setting. Work efficiently: aim to finish review, implementation, and tests in about five minutes, with a hard preparation cutoff after ten minutes. The organizer will freeze your submission and run two games swapping colors, then feed back public records for further improvement. Finish with a concise summary.'''
    log = RUN / f'iteration-{iteration}-{who}.jsonl'
    err = RUN / f'iteration-{iteration}-{who}.stderr.log'
    with log.open('w',encoding='utf-8') as out, err.open('w',encoding='utf-8') as errors:
        result = subprocess.run(command(who,'prepare',codex_args(who)), input=prompt,
                                stdout=out,stderr=errors,text=True,encoding='utf-8',timeout=680)
    if result.returncode:
        raise RuntimeError(f'{who} preparation failed ({result.returncode}); see {err.name}')
    # Require actual successful model turn, not an empty or interrupted launch.
    events = [json.loads(line) for line in log.read_text(encoding='utf-8').splitlines() if line.startswith('{')]
    if not any(e.get('type') == 'turn.completed' for e in events):
        raise RuntimeError(f'{who}: no completed model turn')
    entry = json.loads((TRAIN/who/'entry.json').read_text(encoding='utf-8'))
    if entry.get('mode') not in ('program','direct'): raise ValueError('invalid entry mode')
    if entry['mode']=='program':
        cmd = entry['command']
        if not isinstance(cmd,list) or not cmd or cmd[0] not in ('python3','node'):
            raise ValueError('program must run Python or Node inside private sandbox')
    snapshot = RUN / f'iteration-{iteration}' / who
    shutil.copytree(TRAIN/who,snapshot,ignore=shutil.ignore_patterns('__pycache__'))
    hashes = {str(p.relative_to(snapshot)):hashlib.sha256(p.read_bytes()).hexdigest()
              for p in snapshot.rglob('*') if p.is_file()}
    save(snapshot/'manifest.json',hashes)
    usage = [e.get('usage') for e in events if e.get('type')=='turn.completed']
    status('ready',player=who,iteration=iteration,mode=entry['mode'],usage=usage)
    return entry

def api(route, body=None, token=None):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    request=urllib.request.Request('http://127.0.0.1:8787'+route,
        data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(request,timeout=15) as response: return json.load(response)

class Engine:
    def __init__(self,who,entry,iteration,game):
        self.who,self.entry=who,entry
        self.process=None
        if entry['mode']=='program':
            self.err=(RUN/f'engine-{iteration}-{game}-{who}.log').open('w',encoding='utf-8')
            self.process=subprocess.Popen(command(who,'engine',['timeout','--signal=KILL','1800s',*entry['command']]),
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.err,text=True,encoding='utf-8',bufsize=1)
            self.lines=queue.Queue()
            def read():
                for line in self.process.stdout: self.lines.put(line)
                self.lines.put(None)
            threading.Thread(target=read,daemon=True).start()

    def move(self,observation):
        if self.entry['mode']=='direct':
            prompt='Play the next move using your own notes/strategy. Read RULES.md. This is the current public position:\n'+json.dumps(observation)+'\nWrite only JSON {"x":int,"y":int,"note":string} to move.json. Do not access opponent source.'
            result=subprocess.run(command(self.who,'prepare',codex_args(self.who,'move-summary.txt')),
                input=prompt,capture_output=True,text=True,encoding='utf-8',timeout=680)
            if result.returncode: raise RuntimeError('direct model move failed')
            return json.loads((TRAIN/self.who/'move.json').read_text(encoding='utf-8'))
        self.process.stdin.write(json.dumps(observation)+'\n')
        self.process.stdin.flush()
        try: line=self.lines.get(timeout=10)
        except queue.Empty: raise RuntimeError(f'{self.who} exceeded 10 second hard move limit')
        if line is None: raise RuntimeError(f'{self.who} engine exited')
        return json.loads(line)

    def close(self):
        if self.process:
            try:
                self.process.stdin.close()
                self.process.wait(timeout=5)
            except (OSError,subprocess.TimeoutExpired): self.process.terminate()
            self.err.close()

def play(iteration,entries):
    t=api('/api/tournaments',{'players':[{'name':f'{LABELS[who]} · 迭代 {iteration}'} for who in MODELS],'rounds':2})
    creds=dict(zip(MODELS,t['credentials']))
    save(RUN/f'private-credentials-{iteration}.json',t)
    tid=t['tournament']['id']; replays=[]; timings=[]
    status('playing',iteration=iteration,tournamentId=tid)
    for game_number in (1,2):
        engines={who:Engine(who,entries[who],iteration,game_number) for who in MODELS}
        game_id=None
        try:
            for _ in range(225):
                observations={who:api('/api/agent/state',token=creds[who]['token']) for who in MODELS}
                who=next(who for who,s in observations.items() if s['yourTurn'])
                obs=observations[who]; game_id=obs['matchId']; obs['timeLimitMs']=5000
                start=time.monotonic(); move=engines[who].move(obs); elapsed=time.monotonic()-start
                result=api('/api/move',{'matchId':game_id,'ply':obs['ply'],
                    'x':move['x'],'y':move['y'],'note':str(move.get('note',''))[:160]},creds[who]['token'])
                timings.append({'game':game_id,'ply':obs['ply']+1,'player':who,'seconds':elapsed})
                status('move',iteration=iteration,game=game_number,matchId=game_id,
                       ply=obs['ply']+1,player=who,atMove=result['move']['coordinate'],seconds=round(elapsed,3))
                if result['status']=='finished':
                    replay=api('/api/games/'+game_id); replays.append(replay)
                    status('game_finished',iteration=iteration,game=game_number,matchId=game_id,
                           winner=next((p['name'] for p in creds.values() if p['id']==replay['winner']),None),plies=len(replay['moves']))
                    break
        finally:
            for engine in engines.values(): engine.close()
    save(RUN/f'games-{iteration}.json',replays); save(RUN/f'timings-{iteration}.json',timings)
    state=api('/api/state')
    result=next(t for t in state['tournaments'] if t['id']==tid)
    save(RUN/f'result-{iteration}.json',result)
    for who in MODELS:
        file=TRAIN/who/'public_replays.json'
        prior=json.loads(file.read_text(encoding='utf-8'))
        save(file,prior+replays)
    status('iteration_finished',iteration=iteration,tournamentId=tid,standings=result['standings'])
    return result

def main():
    global RUN, MODELS
    parser=argparse.ArgumentParser()
    parser.add_argument('--cycles',type=int,default=3)
    parser.add_argument('--players',nargs=2,choices=tuple(CATALOG),default=['luna','sol'])
    parser.add_argument('--setup-note',default='Both players continue from their own available strategy files.')
    args=parser.parse_args()
    if not 1<=args.cycles<=20: parser.error('cycles must be 1..20')
    if len(set(args.players))!=2: parser.error('players must be different')
    MODELS={who:CATALOG[who] for who in args.players}
    process_lock=(TRAIN/'.train.lock').open('a+b')
    process_lock.seek(0); process_lock.write(b'0'); process_lock.flush(); process_lock.seek(0)
    try: msvcrt.locking(process_lock.fileno(),msvcrt.LK_NBLCK,1)
    except OSError: raise SystemExit('Another training controller is already running.')
    # Resolve through Windows DNS; the static Linux Codex binary cannot use this WSL DNS tunnel.
    hosts='127.0.0.1 localhost\n::1 localhost\n'
    hosts+='\n'.join(socket.gethostbyname(host)+' '+host for host in ('chatgpt.com','api.openai.com'))+'\n'
    (CONTROL/'network-hosts').write_text(hosts,encoding='utf-8')
    RUN=CONTROL/('run-'+time.strftime('%Y%m%d-%H%M%S'))
    RUN.mkdir(parents=True)
    save(TRAIN/'active-run.json',{'path':str(RUN),'pid':__import__('os').getpid(),'players':args.players})
    starting_engines={who:{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (TRAIN/who).glob('engine.*')} for who in MODELS}
    shared_hashes={who:hashlib.sha256((TRAIN/who/'public_replays.json').read_bytes()).hexdigest() for who in MODELS}
    if len(set(shared_hashes.values()))!=1: raise RuntimeError('Players must receive identical public records')
    save(RUN/'config.json',{'players':[{'id':who,'model':model,'name':LABELS[who]} for who,model in MODELS.items()],
         'reasoning_effort':'medium','cycles':args.cycles,'setup_note':args.setup_note,
         'starting_engines':starting_engines,'public_replays_sha256':shared_hashes})
    results=[]
    try:
        checks=[probe(who) for who in MODELS]
        save(RUN/'isolation-checks.json',checks)
        subprocess.run([sys.executable,str(CONTROL/'check_engine_isolation.py')],check=True)
        status('isolation_verified',players=list(MODELS),cycles=args.cycles)
        for iteration in range(1,args.cycles+1):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                futures={who:pool.submit(prepare,who,iteration) for who in MODELS}
                entries={who:f.result() for who,f in futures.items()}
            results.append(play(iteration,entries))
        save(RUN/'results.json',results)
        status('completed',cycles=args.cycles,run=str(RUN))
        subprocess.run([sys.executable,str(CONTROL/'report.py')],check=True)
    except Exception as exc:
        status('error',error=str(exc),run=str(RUN))
        raise

if __name__=='__main__': main()
