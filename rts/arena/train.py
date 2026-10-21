"""Private model preparation, simultaneous decisions, swapped seats, repeated review."""
import argparse, concurrent.futures, hashlib, json, os, pathlib, queue, shutil, socket, subprocess, sys, threading, time, msvcrt, urllib.parse
ROOT=pathlib.Path(__file__).resolve().parent
CONTROL=ROOT/'control'; PLAYERS=ROOT/'players'
CATALOG={'sol':'gpt-6.1-sol','luna':'gpt-6-luna','astra':'gpt-6-astra','opus':'claude-opus-5-5'}
MODELS={w:CATALOG[w] for w in ('sol','luna')}
LABELS={'sol':'GPT-6.1 Sol','luna':'GPT-6 Luna','astra':'GPT-6 Astra','opus':'Claude Opus 5.5'}
ARGS=None; HISTORY=[]; STARTING={}
RUN=None; STATE={'phase':'准备比赛','round':0,'results':[],'ready':[]}; GUARD=threading.Lock(); ARENA=None

def save(p,data):
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    os.replace(tmp,p)

def hashed(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def load_history(run,seen=None):
    run=pathlib.Path(run).resolve();seen=set() if seen is None else seen
    if run in seen:raise RuntimeError('Cyclic series history')
    seen.add(run)
    config=json.loads((run/'config.json').read_text(encoding='utf-8'))
    history=load_history(config['from_run'],seen) if config.get('from_run') else []
    records=json.loads((run/'replays.json').read_text(encoding='utf-8'))
    for record in records:
        record['id']='history-'+run.name+'-'+record['id']
        for frame in record['frames']:frame['id']=record['id']
        record['final']['id']=record['id']
    return history+records

def isolated(who,mode,args):
    return ['wsl.exe','-d','Ubuntu','-u','root','--','runuser','-u','nobody','--','python3',
            '/mnt/c/Users/Admin/Desktop/AIBattle/rts/arena/isolate.py',who,mode,*args]

def model_command(who,output='submission.txt',seconds=600):
    if who=='opus':
        return ['timeout','--signal=TERM','--kill-after=10s',str(seconds)+'s','claude','-p',
          '--safe-mode','--settings','/home/player/.claude/settings.json','--setting-sources','user',
          '--model',MODELS[who],'--effort','low','--dangerously-skip-permissions',
          '--strict-mcp-config','--disable-slash-commands','--no-chrome','--no-session-persistence',
          '--tools','Bash,Read,Write,Edit,Glob,Grep','--output-format','stream-json','--verbose']
    return ['timeout','--signal=TERM','--kill-after=10s',str(seconds)+'s','codex','exec',
      '--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox','-m',MODELS[who],
      '-c','model_reasoning_effort="medium"','-c','web_search="disabled"',
      '--disable','apps','--disable','plugins','--disable','multi_agent',
      '--disable','computer_use','--disable','browser_use','--disable','in_app_browser',
      '--disable','memories','--disable','hooks','--json','-o','/workspace/'+output,'-']

def completed_usage(who,events):
    if who=='opus':
        results=[e for e in events if e.get('type')=='result']
        if len(results)!=1 or results[0].get('is_error') or results[0].get('subtype')!='success':
            raise RuntimeError('Opus did not complete successfully')
        init=[e for e in events if e.get('type')=='system' and e.get('subtype')=='init']
        if not init or init[0].get('model')!=MODELS[who]:raise RuntimeError('Unexpected Claude model selection')
        usage=results[0].get('modelUsage',{})
        if MODELS[who] not in usage:raise RuntimeError('Requested Opus model missing from model usage')
        return [{'usage':results[0].get('usage'), 'modelUsage':usage,'reported_cost_usd':results[0].get('total_cost_usd')}]
    usage=[e['usage'] for e in events if e.get('type')=='turn.completed']
    if not usage:raise RuntimeError(who+': no completed model turn')
    return usage

class JsonProcess:
    def __init__(self,cmd,log,env=None):
        self.err=log.open('w',encoding='utf-8')
        self.p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.err,
             text=True,encoding='utf-8',bufsize=1,creationflags=subprocess.CREATE_NO_WINDOW,env=env)
        self.lines=queue.Queue();self.lock=threading.Lock()
        def reader():
            for line in self.p.stdout:self.lines.put(line)
            self.lines.put(None)
        threading.Thread(target=reader,daemon=True).start()
    def ask(self,msg,limit=10):
        with self.lock:
            self.p.stdin.write(json.dumps(msg)+'\n');self.p.stdin.flush()
            try:line=self.lines.get(timeout=limit)
            except queue.Empty:raise RuntimeError('Process response deadline exceeded')
            if line is None:raise RuntimeError('Process exited: '+str(self.p.poll()))
            result=json.loads(line)
            if 'error' in result:raise RuntimeError(result['error'])
            return result
    def close(self):
        try:self.p.stdin.close();self.p.wait(timeout=3)
        except (OSError,subprocess.TimeoutExpired):self.p.terminate()
        self.err.close()

def status(phase=None,**fields):
    with GUARD:
        if phase:STATE['phase']=phase
        STATE.update(fields);STATE['updated']=time.strftime('%Y-%m-%dT%H:%M:%S')
        save(CONTROL/'status.json',STATE)
        save(RUN/'status.json',STATE)
        ARENA.ask({'type':'status','data':STATE})
        with (RUN/'events.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps(STATE,ensure_ascii=False)+'\n')
        print(json.dumps(STATE,ensure_ascii=False),flush=True)

def probe(who,mode):
    script='''import os,pathlib,json,socket
assert os.getuid()==65534
assert pathlib.Path('/workspace/canary.txt').read_text().strip()==WHO
blocked=[]
for target in ['/mnt/c','/mnt/d','/run/WSL','/mnt/wsl','/workspace/../OTHER','/proc/1/root/mnt/c','/opt/aibattle-tools/auth/OTHER','/home/admin1','/workspace/../../control']:
 assert not pathlib.Path(target).exists(),target
 blocked.append(target)
if MODE=='engine':
 assert not pathlib.Path('/home/player/.codex').exists()
 assert not pathlib.Path('/home/player/.claude').exists()
 assert len(pathlib.Path('/proc/net/route').read_text().splitlines())==1
 try:pathlib.Path('/workspace/canary.txt').write_text('bad')
 except OSError as e:assert e.errno in (13,30)
 else:raise AssertionError('Workspace writable')
print(json.dumps({'player':WHO,'mode':MODE,'uid':os.getuid(),'blocked':blocked,'readonly_engine':MODE=='engine'}))
'''.replace('WHO',repr(who)).replace('OTHER',next(w for w in MODELS if w!=who)).replace('MODE',repr(mode))
    p=subprocess.run(isolated(who,mode,['python3','-']),input=script,text=True,encoding='utf-8',capture_output=True,timeout=30)
    if p.returncode:raise RuntimeError(p.stderr)
    return json.loads(p.stdout)

def bootstrap():
    CONTROL.mkdir(exist_ok=True)
    endpoints=['chatgpt.com','api.openai.com']
    if 'opus' in MODELS:
        host=urllib.parse.urlparse(os.environ.get('ANTHROPIC_BASE_URL','')).hostname
        if host:endpoints.append(host)
    hosts='127.0.0.1 localhost\n::1 localhost\n'+'\n'.join(socket.gethostbyname(h)+' '+h for h in endpoints)+'\n'
    (CONTROL/'network-hosts').write_text(hosts,encoding='utf-8')
    sim=(ROOT.parent/'simulation.js').read_text(encoding='utf-8')
    # Public mechanics without the built-in controller; identical for both models.
    public=sim[:sim.index('function bot(')]+sim[sim.index('function step('):]
    public=public.replace("  if(p.kind==='bot')bot(g,p);",'')
    initial=json.loads(subprocess.check_output(['node','-e',"const s=require('./rts/simulation');let g=s.createMatch({players:[{name:'Player 0',kind:'api'},{name:'Player 1',kind:'api'}]});s.command(g,0,{type:'start'});console.log(JSON.stringify(s.snapshot(g,0)));"],cwd=ROOT.parents[1],text=True,encoding='utf-8'))
    for who in MODELS:
        folder=PLAYERS/who
        if folder.exists():raise RuntimeError('Run workspace already exists')
        if ARGS.resume_both or who==ARGS.incumbent:
            previous=pathlib.Path(ARGS.from_run)/f'round-{ARGS.source_round}'/who
            manifest=json.loads((previous/'manifest.json').read_text(encoding='utf-8'))
            for f,h in manifest.items():
                if hashed(previous/f)!=h:raise RuntimeError('Archived starting submission failed hash check')
            shutil.copytree(previous,folder,ignore=shutil.ignore_patterns('manifest.json','public_replays.json','__pycache__'))
            STARTING[who]={f:h for f,h in manifest.items() if f not in ('SETUP.md','RULES.md','public_replays.json','example.json','canary.txt')}
            for f,h in STARTING[who].items():
                if hashed(folder/f)!=h:raise RuntimeError('Starting workspace copy failed hash check')
        folder.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT/'RULES.md',folder/'RULES.md')
        (folder/'rules.js').write_text(public,encoding='utf-8')
        (folder/'canary.txt').write_text(who,encoding='utf-8')
        save(folder/'example.json',initial);save(folder/'public_replays.json',HISTORY)
        setup=(f"This is a continuation: BOTH players retain their OWN final round-{ARGS.source_round} files from the previous series. Both must review the latest public games and may improve before EVERY round, including the first. There are {ARGS.rounds} additional revision rounds, two swapped-seat games per round. Neither player starts from scratch. Both receive identical historical public records." if ARGS.resume_both else f"Incumbent {ARGS.incumbent} retains its prior round-{ARGS.source_round} strategy unchanged for this series' first two games. The challenger starts without private strategy code. Both receive identical historical public records. Both may revise in subsequent rounds." if ARGS.incumbent else f'Both players start from scratch. There are {ARGS.rounds} revision rounds.')
        (folder/'SETUP.md').write_text(setup+'\nPublic replay IDs prefixed history- belong to the previous series. New-series records use r1-g1 etc.\n',encoding='utf-8')
    save(CONTROL/'workspace-paths.json',{w:(PLAYERS/w).relative_to(ROOT).as_posix() for w in MODELS})
    save(RUN/'isolation-prepare.json',[probe(w,'prepare') for w in MODELS])
    save(RUN/'config.json',{'models':MODELS,'reasoning_effort':'medium','rounds':ARGS.rounds,'games_per_round':2,
         'clients':{w:'Claude Code' if w=='opus' else 'Codex CLI' for w in MODELS},
         'fresh_start':not bool(ARGS.incumbent or ARGS.resume_both),'incumbent':ARGS.incumbent,'from_run':ARGS.from_run,
         'resume_both':ARGS.resume_both,'source_round':ARGS.source_round,
         'first_round_incumbent_frozen':bool(ARGS.incumbent),'starting_files':STARTING,
         'history_sha256':hashed(PLAYERS/next(iter(MODELS))/'public_replays.json'),'history_games':len(HISTORY),
         'port':ARGS.port,'preparation_seconds':600,'decision_sim_seconds':1,'max_commands':10,'speed_target':8,
         'source_sha256':hashed(ROOT.parent/'simulation.js'),'rules_sha256':hashed(ROOT/'RULES.md'),
         'public_sim_sha256':hashed(PLAYERS/next(iter(MODELS))/'rules.js')})

def freeze(who,iteration,usage):
    entry=json.loads((PLAYERS/who/'entry.json').read_text(encoding='utf-8'))
    if entry.get('mode') not in ('program','direct'):raise RuntimeError('Invalid entry mode')
    if entry['mode']=='program' and (not isinstance(entry.get('command'),list) or not entry['command'] or entry['command'][0] not in ('python3','node')):raise RuntimeError('Invalid entry command')
    frozen=RUN/f'round-{iteration}'/who
    if any(p.is_symlink() for p in (PLAYERS/who).rglob('*')):raise RuntimeError('Submission symlinks unsupported')
    shutil.copytree(PLAYERS/who,frozen,ignore=shutil.ignore_patterns('__pycache__'))
    manifest={p.relative_to(frozen).as_posix():hashed(p) for p in frozen.rglob('*') if p.is_file()}
    save(frozen/'manifest.json',manifest)
    if iteration==1 and who==ARGS.incumbent:
        for f,h in STARTING[who].items():
            if hashed(frozen/f)!=h:raise RuntimeError('First-round incumbent must remain byte-identical')
    with GUARD:STATE['ready'].append(who)
    status(player_ready=who,usage=usage)
    return entry

def prepare(who,iteration):
    if iteration==1 and who==ARGS.incumbent:
        return freeze(who,iteration,[{'reused_frozen_incumbent':True}])
    prompt=f'''You are {MODELS[who]}, an independent competitor in Frontier RTS revision round {iteration} of {ARGS.rounds}.
Your goal is to win against another AI. Read SETUP.md, RULES.md, rules.js, example.json, and public_replays.json; the latter contains the same public records for both contestants. Analyze large records with scripts rather than printing everything. SETUP.md specifies whether you start from scratch or continue your own prior strategy. Whenever previous records exist, diagnose concrete mistakes at specific game IDs/times, then improve your own approach. Your own previous files remain available. You cannot see the opponent's source.
Choose your own strategy: direct reasoning, a self-authored program, or a hybrid. Follow the entry.json protocol in RULES.md. Do not browse, download engines, or try to obtain private opponent code. Do not change SETUP.md, RULES.md, rules.js, example.json, canary.txt or public_replays.json. If writing a program, implement it, test it on realistic game observations and measure response time. Write review.md in Simplified Chinese, explaining your strategy, specific replay lessons, tests and remaining weaknesses. Use Simplified Chinese for reader-facing review notes and the final concise summary; keep code identifiers, file paths, JSON protocol keys and numeric evidence unchanged. Preserve useful notes for the next revision. Finish by submitting a working entry.json and a concise summary.
Both contestants use medium reasoning and the same preparation budget. Aim for five minutes; the hard cutoff is ten minutes. Two games with swapped west/east seats will run before the next review. Only tactical results count; the simulation waits for both responses and does not reward model latency. You choose all gameplay strategy; the organizer supplies only rules and transport.'''
    log=RUN/f'round-{iteration}-{who}.jsonl';err=RUN/f'round-{iteration}-{who}.stderr.log'
    protected={f:hashed(PLAYERS/who/f) for f in ['SETUP.md','RULES.md','rules.js','example.json','canary.txt','public_replays.json']}
    with log.open('w',encoding='utf-8') as out,err.open('w',encoding='utf-8') as errors:
        result=subprocess.run(isolated(who,'prepare',model_command(who)),input=prompt,stdout=out,stderr=errors,text=True,encoding='utf-8',timeout=630,creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:raise RuntimeError(f'{who} round {iteration} preparation failed: {result.returncode}; see {log}')
    events=[json.loads(x) for x in log.read_text(encoding='utf-8').splitlines() if x.startswith('{')]
    usage=completed_usage(who,events)
    if who=='opus':
        (PLAYERS/who/'submission.txt').write_text(next(e for e in events if e.get('type')=='result').get('result',''),encoding='utf-8')
    for f,h in protected.items():
        if hashed(PLAYERS/who/f)!=h:raise RuntimeError(who+' modified protected rules/records: '+f)
    return freeze(who,iteration,usage)

class Competitor:
    def __init__(self,who,entry,iteration,game):
        self.who,self.entry,self.iteration,self.game=who,entry,iteration,game;self.process=None
        if entry['mode']=='program':self.process=JsonProcess(isolated(who,'engine',['timeout','--signal=KILL','7200s',*entry['command']]),RUN/f'engine-{iteration}-{game}-{who}.stderr.log')
    def move(self,obs):
        begin=time.monotonic()
        if self.process:out=self.process.ask(obs,5)
        else:
            action=PLAYERS/self.who/'action.json'
            if action.exists():action.unlink()
            prompt='Play this next Frontier RTS decision. Read RULES.md and your own notes. Write only {"commands":[...],"note":"..."} JSON to action.json. Current observation:\n'+json.dumps(obs)
            log=RUN/f'direct-{self.iteration}-{self.game}-{self.who}-{obs["tick"]}.jsonl'
            with log.open('w',encoding='utf-8') as f:
                p=subprocess.run(isolated(self.who,'prepare',model_command(self.who,'action-summary.txt',180)),input=prompt,text=True,encoding='utf-8',stdout=f,stderr=f,timeout=200,creationflags=subprocess.CREATE_NO_WINDOW)
            if p.returncode:raise RuntimeError('Direct decision failed')
            out=json.loads(action.read_text(encoding='utf-8'))
        if not isinstance(out,dict) or not isinstance(out.get('commands'),list):raise RuntimeError(self.who+': invalid command envelope')
        return out,round(time.monotonic()-begin,6)
    def close(self):
        if self.process:self.process.close()

def play(iteration,entries,seat_order,game_number,pool):
    game_id=f'r{iteration}-g{game_number}';players=[LABELS[w] for w in seat_order]
    state=ARENA.ask({'type':'create','id':game_id,'players':players})['state'];frames=[state];decisions=[];errors=[[],[]]
    controllers={w:Competitor(w,entries[w],iteration,game_number) for w in MODELS}
    status('交战中',round=iteration,game=game_number,game_id=game_id,seats=seat_order)
    record={'id':game_id,'round':iteration,'game':game_number,'seats':seat_order,'frames':frames,'decisions':decisions}
    archive=RUN/f'{game_id}.jsonl'
    try:
        with archive.open('w',encoding='utf-8') as f:
            f.write(json.dumps({'initial':state,'seats':seat_order})+'\n');f.flush()
            for _ in range(601):
                if state['status']=='finished':break
                begin=time.monotonic();futures=[]
                for owner,who in enumerate(seat_order):
                    obs={**state,'yourPlayer':owner,'lastErrors':errors[owner],'decisionSeconds':1,'maxCommands':10}
                    futures.append(pool.submit(controllers[who].move,obs))
                answers=[future.result() for future in futures]
                commands=[a[0]['commands'] for a in answers]
                decision={'tick':state['tick'],'now':state['now'],'commands':commands,'seconds':[a[1] for a in answers],'notes':[str(a[0].get('note',''))[:500] for a in answers]}
                reply=ARENA.ask({'type':'advance','commands':commands});state=reply['state'];errors=reply['errors'];decision['errors']=errors
                frames.append(state);decisions.append(decision)
                f.write(json.dumps({'decision':decision,'state':state})+'\n');f.flush()
                time.sleep(max(0,.125-(time.monotonic()-begin)))
            if state['status']!='finished':raise RuntimeError('Game did not finish at deadline')
    finally:
        for engine in controllers.values():engine.close()
    record['final']=state;record['winner']=seat_order[state['winner']] if state['winner'] is not None else None
    record['reason']=state['reason'];record['duration']=round(state['now'],2)
    result={k:record[k] for k in ['id','round','game','seats','winner','reason','duration']}
    result['scores']={w:state['players'][i]['score'] for i,w in enumerate(seat_order)}
    result['errors']={w:sum(len(d['errors'][i]) for d in decisions) for i,w in enumerate(seat_order)}
    STATE['results'].append(result);status('本局结束')
    return record

def main():
    global RUN,ARENA,MODELS,PLAYERS,ARGS,HISTORY
    parser=argparse.ArgumentParser()
    parser.add_argument('--players',nargs=2,choices=tuple(CATALOG),default=['sol','luna'])
    parser.add_argument('--incumbent',choices=tuple(CATALOG))
    parser.add_argument('--from-run')
    parser.add_argument('--resume-both',action='store_true',help='Continue both archived final strategies, reviewing before every round')
    parser.add_argument('--rounds',type=int,default=3)
    parser.add_argument('--port',type=int,default=8789)
    ARGS=parser.parse_args()
    if len(set(ARGS.players))!=2:parser.error('Distinct players required')
    if ARGS.rounds<1:parser.error('Positive round count required')
    if ARGS.resume_both and (ARGS.incumbent or not ARGS.from_run):parser.error('--resume-both requires --from-run and excludes --incumbent')
    if ARGS.incumbent and (ARGS.incumbent not in ARGS.players or not ARGS.from_run):parser.error('Incumbent requires selected player and --from-run')
    MODELS={w:CATALOG[w] for w in ARGS.players}
    ARGS.source_round=None
    if ARGS.from_run:
        previous_config=json.loads((pathlib.Path(ARGS.from_run)/'config.json').read_text(encoding='utf-8'))
        ARGS.source_round=previous_config['rounds']
        for w in (ARGS.players if ARGS.resume_both else [ARGS.incumbent] if ARGS.incumbent else []):
            if previous_config['models'].get(w)!=MODELS[w]:parser.error('Retained player must match the archived model')
        HISTORY=load_history(ARGS.from_run)
    # Fail before launching models or overwriting active-series metadata if occupied.
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',ARGS.port))
    CONTROL.mkdir(parents=True,exist_ok=True)
    lock=(CONTROL/'.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
    msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    RUN=CONTROL/('run-'+time.strftime('%Y%m%d-%H%M%S'));RUN.mkdir()
    PLAYERS=RUN/'workspaces'
    STATE.update({'contestants':[{'id':w,'name':LABELS[w],'short':w.title()} for w in MODELS],
        'setup_note':f'双方沿用上一系列最终策略，继续复盘改进 {ARGS.rounds} 轮' if ARGS.resume_both else f'{ARGS.incumbent.title()} 沿用既有策略，首轮保持原样；挑战者从零开始' if ARGS.incumbent else '双方从零开始',
        'port':ARGS.port,'rounds':ARGS.rounds})
    save(CONTROL/'active-run.json',{'path':str(RUN),'pid':os.getpid()})
    ARENA=JsonProcess(['node',str(ROOT/'arena.js')],RUN/'arena.stderr.log',env={**os.environ,'ARENA_PORT':str(ARGS.port)})
    save(CONTROL/'viewer.json',{'pid':ARENA.p.pid,'url':f'http://127.0.0.1:{ARGS.port}/'})
    records=[]
    try:
        bootstrap();status('双方准备策略',round=1)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for iteration in range(1,ARGS.rounds+1):
                status('双方准备策略' if iteration==1 else '双方复盘并改进',round=iteration,ready=[])
                futures={w:pool.submit(prepare,w,iteration) for w in MODELS}
                entries={w:f.result() for w,f in futures.items()}
                save(CONTROL/'engine-paths.json',{w:(RUN/f'round-{iteration}'/w).relative_to(ROOT).as_posix() for w in MODELS})
                save(RUN/f'isolation-engine-{iteration}.json',[probe(w,'engine') for w in MODELS])
                for game_number,order in enumerate([list(MODELS),list(reversed(MODELS))],1):
                    records.append(play(iteration,entries,order,game_number,pool))
                for w in MODELS:save(PLAYERS/w/'public_replays.json',HISTORY+records)
                save(RUN/'results.json',STATE['results'])
                # Both frozen revisions must still match the files used for play.
                for w in MODELS:
                    frozen=RUN/f'round-{iteration}'/w
                    for name,h in json.loads((frozen/'manifest.json').read_text(encoding='utf-8')).items():
                        if hashed(frozen/name)!=h:raise RuntimeError('Frozen submission changed during play')
        save(RUN/'replays.json',records)
        status('比赛完成',completed=True)
    except Exception as exc:
        status('比赛中止，需要检查',error=str(exc));raise
    finally:
        # Closing only stdin leaves the spectator server and replay frames available.
        ARENA.p.stdin.close()

if __name__=='__main__':main()
