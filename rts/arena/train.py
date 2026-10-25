"""Private model preparation, simultaneous decisions, swapped seats, repeated review."""
import argparse, concurrent.futures, hashlib, json, os, pathlib, queue, shutil, socket, subprocess, sys, tempfile, threading, time, msvcrt, urllib.parse
ROOT=pathlib.Path(__file__).resolve().parent
CONTROL=ROOT/'control'; PLAYERS=ROOT/'players'
CATALOG={
    'sol':'gpt-6.1-sol','luna':'gpt-6-luna','astra':'gpt-6-astra','opus':'claude-opus-5-5',
    # DeepSeek 通过 Claude Code CLI 使用，与 GPT 走同一条客户端路径。
    'deepseek-flash':'deepseek-v4.1-flash','deepseek':'deepseek-v4.1-flash',
}
MODELS={w:CATALOG[w] for w in ('sol','luna')}
LABELS={'sol':'GPT-6.1 Sol','luna':'GPT-6 Luna','astra':'GPT-6 Astra','opus':'Claude Opus 5.5',
    'deepseek-flash':'DeepSeek V4.1 Flash','deepseek':'DeepSeek V4.1 Flash'}
# 本轮所有对手都通过 Claude Code CLI 调用（不再使用 Codex CLI）。
CLIENTS={w:'claude' for w in CATALOG}
# GPT 系模型在当前网关下会出现「thinking 块提前结束、后续 delta 继续」的流式乱序，
# 需要本地顺序修正代理；DeepSeek 不需要。
STREAM_PROXY={'sol','luna','astra'}
EFFORT='medium'
PROXY_PORT=8895
PROXY=None
HOME_ROOT='/opt/aibattle-tools/auth/rts-models'
NO_ISOLATION=False
SETTINGS_FILES={}
HOMES_TMP=None
ARGS=None; HISTORY=[]; STARTING={}
RUN=None; STATE={'phase':'准备比赛','round':0,'results':[],'ready':[]}; GUARD=threading.Lock(); ARENA=None

def save(p,data):
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    os.replace(tmp,p)

def hashed(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def resolve_run(p):
    """旧系列记录里的 from_run 可能指向仓库迁移前的位置（例如桌面上那份拷贝）。
    按「仓库名之后的相对路径」在当前仓库里重新定位，找不到才原样返回。"""
    p=pathlib.Path(p)
    if p.exists():return p
    parts=list(p.parts)
    for i,part in enumerate(parts):
        if part.lower()=='aibattle':
            candidate=ROOT.parents[1].joinpath(*parts[i+1:])
            if candidate.exists():return candidate
    return p

def load_history(run,seen=None):
    run=pathlib.Path(run).resolve();seen=set() if seen is None else seen
    if run in seen:raise RuntimeError('Cyclic series history')
    seen.add(run)
    config=json.loads((run/'config.json').read_text(encoding='utf-8'))
    history=load_history(resolve_run(config['from_run']),seen) if config.get('from_run') else []
    records=json.loads((run/'replays.json').read_text(encoding='utf-8'))
    for record in records:
        record['id']='history-'+run.name+'-'+record['id']
        for frame in record['frames']:frame['id']=record['id']
        record['final']['id']=record['id']
    return history+records

def isolated(who,mode,args):
    return ['wsl.exe','-d','Ubuntu','-u','root','--','runuser','-u','nobody','--','python3',
            '/mnt/c/Users/Admin/Desktop/AIBattle/rts/arena/isolate.py',who,mode,*args]

def model_command(who, output='submission.txt', seconds=0):
    """本轮统一使用 Claude Code；保留 codex 分支只用于显式配置的旧对手。

    seconds<=0 表示不包裹 timeout，准备阶段可以一直进行到模型自己结束。
    """
    # 本机直跑不套 timeout 包装：Windows 的 timeout.exe 与 GNU timeout 语法不同，
    # 时限交给 subprocess.run 的 timeout 参数。
    prefix = [] if (not seconds or seconds <= 0 or NO_ISOLATION) else [
        'timeout', '--signal=TERM', '--kill-after=10s', str(seconds) + 's']
    if CLIENTS.get(who, 'claude') == 'claude':
        settings = SETTINGS_FILES.get(who, '/home/player/.claude/settings.json') if NO_ISOLATION else '/home/player/.claude/settings.json'
        exe = (shutil.which('claude') or 'claude') if NO_ISOLATION else 'claude'
        return prefix + [exe, '-p',
                '--safe-mode', '--settings', settings, '--setting-sources', 'user',
                '--model', MODELS[who], '--effort', EFFORT, '--dangerously-skip-permissions',
                '--strict-mcp-config', '--disable-slash-commands', '--no-chrome', '--no-session-persistence',
                '--tools', 'Bash,Read,Write,Edit,Glob,Grep', '--output-format', 'stream-json', '--verbose']
    return prefix + ['codex', 'exec',
            '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check',
            '--dangerously-bypass-approvals-and-sandbox', '-m', MODELS[who],
            '-c', 'model_reasoning_effort="medium"', '-c', 'web_search="disabled"',
            '--disable', 'apps', '--disable', 'plugins', '--disable', 'multi_agent',
            '--disable', 'computer_use', '--disable', 'browser_use', '--disable', 'in_app_browser',
            '--disable', 'memories', '--disable', 'hooks', '--json', '-o', '/workspace/' + output, '-']


def completed_usage(who, events):
    if CLIENTS.get(who, 'claude') == 'claude':
        results = [e for e in events if e.get('type') == 'result']
        if len(results) != 1 or results[0].get('is_error') or results[0].get('subtype') != 'success':
            raise RuntimeError(who + ' did not complete successfully')
        init = [e for e in events if e.get('type') == 'system' and e.get('subtype') == 'init']
        if not init or init[0].get('model') != MODELS[who]:
            raise RuntimeError('Unexpected Claude Code model selection for ' + who)
        usage = results[0].get('modelUsage', {})
        if MODELS[who] not in usage:
            raise RuntimeError('Requested model missing from model usage: ' + who)
        return [{'usage': results[0].get('usage'), 'modelUsage': usage,
                 'reported_cost_usd': results[0].get('total_cost_usd')}]
    usage = [e['usage'] for e in events if e.get('type') == 'turn.completed']
    if not usage:
        raise RuntimeError(who + ': no completed model turn')
    return usage


class JsonProcess:
    def __init__(self,cmd,log,env=None,cwd=None):
        self.err=log.open('w',encoding='utf-8')
        self.p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.err,
             text=True,encoding='utf-8',bufsize=1,creationflags=subprocess.CREATE_NO_WINDOW,env=env,cwd=cwd)
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

def wsl_path(p):
    """Windows 绝对路径 -> WSL /mnt/<drive>/... 路径。"""
    s = str(pathlib.Path(p).resolve())
    return '/mnt/' + s[0].lower() + '/' + s[3:].replace('\\', '/')




def provision_homes():
    """把宿主 Claude Code 配置写给每名选手的私有 home。

    凭据只写进 WSL 的 /opt/aibattle-tools/auth，不进入项目目录、日志或回放。
    所有选手本轮都走 Claude Code CLI；GPT 系额外指向本地流顺序修正代理。
    """
    host = pathlib.Path(os.environ.get('USERPROFILE', str(pathlib.Path.home()))) / '.claude' / 'settings.json'
    settings = json.loads(host.read_text(encoding='utf-8-sig'))
    base_env = dict(settings.get('env', {}))
    for key in ('CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_THINKING_TOKENS', 'CLAUDE_CODE_EFFORT_LEVEL'):
        base_env.pop(key, None)
    base_env['DISABLE_AUTOUPDATER'] = '1'
    base_env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1'
    settings_by_player = {}
    for who in MODELS:
        env = dict(base_env)
        if who in STREAM_PROXY:
            env['ANTHROPIC_BASE_URL'] = f'http://127.0.0.1:{PROXY_PORT}'
        entry = {'env': env, 'model': MODELS[who], 'disableAllHooks': True}
        # 自定义模型 ID 需要宿主 settings 里的 modelPicker/modelSettings，
        # 否则隔离 home 里的 Claude Code 会报 unrecognized_model。
        for key in ('modelPicker', 'modelSettings'):
            if key in settings:
                entry[key] = settings[key]
        settings_by_player[who] = entry
    if NO_ISOLATION:
        global HOMES_TMP
        HOMES_TMP = tempfile.mkdtemp(prefix='aibattle-rts-homes-')
        for who in MODELS:
            folder = pathlib.Path(HOMES_TMP) / who
            folder.mkdir(parents=True, exist_ok=True)
            f = folder / 'settings.json'
            f.write_text(json.dumps(settings_by_player[who], ensure_ascii=False, indent=2), encoding='utf-8')
            try: os.chmod(f, 0o600)
            except OSError: pass
            SETTINGS_FILES[who] = str(f)
        save(CONTROL / 'home-paths.json', {who: str(pathlib.Path(HOMES_TMP) / who) for who in MODELS})
        save(CONTROL / 'clients.json', {who: CLIENTS.get(who, 'claude') for who in MODELS})
        return base_env

    payload = {'root': HOME_ROOT, 'players': list(MODELS), 'settings': settings_by_player,
               'clients': {who: CLIENTS.get(who, 'claude') for who in MODELS}}
    script = '''import json,os,pathlib,sys
d=json.load(sys.stdin)
import glob, shutil
for who in d['players']:
    client=d['clients'][who]
    p=pathlib.Path(d['root'])/who/('.'+client)
    p.mkdir(parents=True,exist_ok=True)
    f=p/'settings.json'
    f.write_text(json.dumps(d['settings'][who],ensure_ascii=False))
    os.chmod(f,0o600)
    # Claude Code 的全局状态文件必须在 HOME 根目录；优先恢复之前的备份，
    # 否则写一个最小的已完成引导配置，避免 unrecognized_model / 反复引导。
    home=p.parent
    backups=sorted((p/'backups').glob('.claude.json.backup.*')) if (p/'backups').exists() else []
    state=home/'.claude.json'
    if backups:
        shutil.copy2(backups[-1],state)
    else:
        state.write_text(json.dumps({'hasCompletedOnboarding':True,'lastOnboardingVersion':'2.1.296','numStartups':1,'autoUpdates':False}))
    os.chmod(state,0o600)
    for item in [home,p,f,state]:os.chown(item,65534,65534)
'''
    subprocess.run(['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'python3', '-c', script],
                   input=json.dumps(payload), text=True, encoding='utf-8', check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW)
    save(CONTROL / 'home-paths.json', {who: f'{HOME_ROOT}/{who}' for who in MODELS})
    save(CONTROL / 'clients.json', {who: CLIENTS.get(who, 'claude') for who in MODELS})
    return base_env




def start_stream_proxy(env):
    """GPT 系模型经本地代理修正流式块顺序；它只转发真实 CLI 请求。"""
    global PROXY
    if not (STREAM_PROXY & set(MODELS)):
        return
    base = env.get('ANTHROPIC_BASE_URL')
    if not base:
        raise RuntimeError('Claude Code 配置缺少 ANTHROPIC_BASE_URL')
    script = str(ROOT.parents[1] / 'writing-bench' / 'cc_stream_proxy.py')
    if NO_ISOLATION:
        log = str(CONTROL / f'rts-stream-proxy-{RUN.name}.log')
        PROXY = subprocess.Popen(
            [sys.executable, script, '--base', base, '--port', str(PROXY_PORT), '--log', log, '--normalize'],
            cwd=str(ROOT.parents[1] / 'writing-bench'),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        script = wsl_path(script)
        log = f'/tmp/rts-stream-proxy-{RUN.name}.log'
        PROXY = subprocess.Popen(
            ['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'python3', script, '--base', base,
             '--port', str(PROXY_PORT), '--log', log, '--normalize'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    for _ in range(50):
        ok = False
        if NO_ISOLATION:
            try:
                s = socket.create_connection(('127.0.0.1', PROXY_PORT), 0.5); s.close(); ok = True
            except OSError:
                ok = False
        else:
            probe = (f"import socket;socket.create_connection(('127.0.0.1',{PROXY_PORT}),0.5).close()")
            ok = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'python3', '-c', probe],
                                capture_output=True).returncode == 0
        if ok:
            save(CONTROL / 'stream-proxy.json', {'port': PROXY_PORT, 'base': base, 'log': log})
            return
        time.sleep(0.2)
    raise RuntimeError('本地流顺序修正代理没有启动')




def stop_stream_proxy():
    global PROXY
    if PROXY is None:
        return
    if not NO_ISOLATION:
        subprocess.run(['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'pkill', '-f', f'rts-stream-proxy-{RUN.name}'],
                       check=False)
    try:
        PROXY.terminate()
    except OSError:
        pass
    PROXY = None




def bootstrap():
    env=provision_homes()
    start_stream_proxy(env)
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
                # public_replays.json 这类公开战报在归档时已被清理，且 bootstrap 本来就不搬运它，
                # 这里只对真正要继承的选手文件做完整性自检。
                if f=='public_replays.json' or f.startswith('public-') or f=='manifest.json':continue
                if hashed(previous/f)!=h:raise RuntimeError('Archived starting submission failed hash check')
            shutil.copytree(previous,folder,ignore=shutil.ignore_patterns('manifest.json','public_replays.json','__pycache__'))
            STARTING[who]={f:h for f,h in manifest.items() if f not in ('SETUP.md','RULES.md','public_replays.json','example.json','canary.txt')}
            for f,h in STARTING[who].items():
                if hashed(folder/f)!=h:raise RuntimeError('Starting workspace copy failed hash check')
        folder.mkdir(parents=True,exist_ok=True)
        if ARGS.reuse_workspaces and not (ARGS.resume_both or who==ARGS.incumbent):
            src=pathlib.Path(ARGS.reuse_workspaces)
            candidates=sorted(src.glob(f'round-*/{who}'),key=lambda x:x.name,reverse=True)+[src/'workspaces'/who]
            for cand in candidates:
                if (cand/'entry.json').exists():
                    shutil.copytree(cand,folder,dirs_exist_ok=True,
                                    ignore=shutil.ignore_patterns('manifest.json','__pycache__'))
                    print(f'{who} 复用 {cand} 里已完成的提交',flush=True)
                    break
        shutil.copy2(ROOT/'RULES.md',folder/'RULES.md')
        (folder/'rules.js').write_text(public,encoding='utf-8')
        (folder/'canary.txt').write_text(who,encoding='utf-8')
        save(folder/'example.json',initial);save(folder/'public_replays.json',HISTORY)
        setup=(f"This is a continuation: BOTH players retain their OWN final round-{ARGS.source_round} files from the previous series. Both must review the latest public games and may improve before EVERY round, including the first. There are {ARGS.rounds} additional revision rounds, two swapped-seat games per round. Neither player starts from scratch. Both receive identical historical public records." if ARGS.resume_both else f"Incumbent {ARGS.incumbent} retains its prior round-{ARGS.source_round} strategy unchanged for this series' first two games. The challenger starts without private strategy code. Both receive identical historical public records. Both may revise in subsequent rounds." if ARGS.incumbent else f'Both players start from scratch. There are {ARGS.rounds} revision rounds.')
        (folder/'SETUP.md').write_text(setup+'\nPublic replay IDs prefixed history- belong to the previous series. New-series records use r1-g1 etc.\n',encoding='utf-8')
    save(CONTROL/'workspace-paths.json',{w:(PLAYERS/w).relative_to(ROOT).as_posix() for w in MODELS})
    save(RUN/'isolation-prepare.json',{'mode':'none','note':'本机直跑；赛前约定不读取对方工作区'} if NO_ISOLATION else [probe(w,'prepare') for w in MODELS])
    save(RUN/'config.json',{'models':MODELS,'reasoning_effort':'medium','rounds':ARGS.rounds,'games_per_round':2,
         'clients':{w:'Claude Code' for w in MODELS},'no_isolation':NO_ISOLATION,
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
    # manifest.json 自身不能进清单：它是清单的载体，写进去就变成自引用。
    manifest={p.relative_to(frozen).as_posix():hashed(p) for p in frozen.rglob('*') if p.is_file() and p.name!='manifest.json'}
    save(frozen/'manifest.json',manifest)
    if iteration==1 and who==ARGS.incumbent:
        for f,h in STARTING[who].items():
            if hashed(frozen/f)!=h:raise RuntimeError('First-round incumbent must remain byte-identical')
    with GUARD:STATE['ready'].append(who)
    status(player_ready=who,usage=usage)
    return entry

def prepare(who,iteration):
    # 冻结现任者：整个系列都不再调用模型，直接把上一系列的冻结提交原样冻结到本轮。
    if who==ARGS.incumbent:
        return freeze(who,iteration,[{'frozen_incumbent':True,'from_run':ARGS.from_run,'source_round':ARGS.source_round}])
    if ARGS.reuse_workspaces and iteration==1:
        return freeze(who,iteration,[{'reused_from':ARGS.reuse_workspaces}])
    incumbent_goal = (chr(10) * 2 + 'GOAL FOR THIS SERIES: your opponent is the FROZEN ' + (ARGS.incumbent or '') + ' strategy; its code and workspace are invisible to you and must not be read. Target at least a 90% win rate against it: self-test across many seeds and both seats until your measured win rate is steadily above 90%.') if ARGS.incumbent and who!=ARGS.incumbent else ''
    budget_text = (f'Aim for about {ARGS.prepare_seconds//60} minutes; the hard cutoff is {ARGS.prepare_seconds//60} minutes.' if ARGS.prepare_seconds > 0
                   else 'Preparation time is unlimited; finish when you are confident.')
    hard_timeout = None if ARGS.prepare_seconds <= 0 else ARGS.prepare_seconds + 30
    prompt=f'''You are {MODELS[who]}, an independent competitor in Frontier RTS revision round {iteration} of {ARGS.rounds}.
Your goal is to win against another AI. Read SETUP.md, RULES.md, rules.js, example.json, and public_replays.json; the latter contains the same public records for both contestants. Analyze large records with scripts rather than printing everything. SETUP.md specifies whether you start from scratch or continue your own prior strategy. Whenever previous records exist, diagnose concrete mistakes at specific game IDs/times, then improve your own approach. Your own previous files remain available. You cannot see the opponent's source.
Choose your own strategy: direct reasoning, a self-authored program, or a hybrid. Follow the entry.json protocol in RULES.md. Do not browse, download engines, or try to obtain private opponent code. Do not change SETUP.md, RULES.md, rules.js, example.json, canary.txt or public_replays.json. If writing a program, implement it, test it on realistic game observations and measure response time. Write review.md in Simplified Chinese, explaining your strategy, specific replay lessons, tests and remaining weaknesses. Use Simplified Chinese for reader-facing review notes and the final concise summary; keep code identifiers, file paths, JSON protocol keys and numeric evidence unchanged. Preserve useful notes for the next revision. Finish by submitting a working entry.json and a concise summary.{incumbent_goal}
Both contestants use medium reasoning and the same preparation budget. {budget_text} Two games with swapped west/east seats will run before the next review. Only tactical results count; the simulation waits for both responses and does not reward model latency. You choose all gameplay strategy; the organizer supplies only rules and transport.'''
    log=RUN/f'round-{iteration}-{who}.jsonl';err=RUN/f'round-{iteration}-{who}.stderr.log'
    protected={f:hashed(PLAYERS/who/f) for f in ['SETUP.md','RULES.md','rules.js','example.json','canary.txt','public_replays.json']}
    cmd=model_command(who,seconds=0) if NO_ISOLATION else model_command(who)
    timed_out=False
    try:
        with log.open('w',encoding='utf-8') as out,err.open('w',encoding='utf-8') as errors:
            if NO_ISOLATION:
                ws=PLAYERS/who
                result=subprocess.run(cmd,input=prompt.replace('/workspace',str(ws)),stdout=out,stderr=errors,text=True,encoding='utf-8',timeout=hard_timeout,cwd=str(ws),creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                result=subprocess.run(isolated(who,'prepare',cmd),input=prompt,stdout=out,stderr=errors,text=True,encoding='utf-8',timeout=hard_timeout,creationflags=subprocess.CREATE_NO_WINDOW)
    except subprocess.TimeoutExpired:
        # 模型跑满预算：只要它已经把 entry.json 落盘，就按已提交处理，不整场报废。
        timed_out=True
        print(f'{who} 准备跑满 630 秒预算',flush=True)
    events=[json.loads(x) for x in log.read_text(encoding='utf-8').splitlines() if x.startswith('{')]
    if timed_out:
        if not (PLAYERS/who/'entry.json').exists():raise RuntimeError(f'{who} 准备超时且没有提交 entry.json')
        usage=[{'timed_out':True}]
    else:
        if result.returncode:raise RuntimeError(f'{who} round {iteration} preparation failed: {result.returncode}; see {log}')
        usage=completed_usage(who,events)
    if who=='opus':
        (PLAYERS/who/'submission.txt').write_text(next(e for e in events if e.get('type')=='result').get('result',''),encoding='utf-8')
    for f,h in protected.items():
        if hashed(PLAYERS/who/f)!=h:raise RuntimeError(who+' modified protected rules/records: '+f)
    return freeze(who,iteration,usage)

class Competitor:
    def __init__(self,who,entry,iteration,game):
        self.who,self.entry,self.iteration,self.game=who,entry,iteration,game;self.process=None
        if entry['mode']=='program':
            if NO_ISOLATION:
                cmd=list(entry['command'])
                if cmd[0] in ('python3','python','py'):cmd[0]=sys.executable
                elif cmd[0]=='node':cmd[0]=shutil.which('node') or 'node'
                self.process=JsonProcess(cmd,RUN/f'engine-{iteration}-{game}-{who}.stderr.log',cwd=str(RUN/f'round-{iteration}'/who))
            else:
                self.process=JsonProcess(isolated(who,'engine',['timeout','--signal=KILL','7200s',*entry['command']]),RUN/f'engine-{iteration}-{game}-{who}.stderr.log')
    def move(self,obs):
        begin=time.monotonic()
        if self.process:out=self.process.ask(obs,5)
        else:
            action=PLAYERS/self.who/'action.json'
            if action.exists():action.unlink()
            prompt='Play this next Frontier RTS decision. Read RULES.md and your own notes. Write only {"commands":[...],"note":"..."} JSON to action.json. Current observation:\n'+json.dumps(obs)
            log=RUN/f'direct-{self.iteration}-{self.game}-{self.who}-{obs["tick"]}.jsonl'
            with log.open('w',encoding='utf-8') as f:
                if NO_ISOLATION:
                    p=subprocess.run(model_command(self.who,'action-summary.txt',0),input=prompt,text=True,encoding='utf-8',stdout=f,stderr=f,timeout=200,cwd=str(PLAYERS/self.who),creationflags=subprocess.CREATE_NO_WINDOW)
                else:
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
    global RUN,ARENA,MODELS,PLAYERS,ARGS,HISTORY,NO_ISOLATION
    parser=argparse.ArgumentParser()
    parser.add_argument('--players',nargs=2,choices=tuple(CATALOG),default=['sol','luna'])
    parser.add_argument('--incumbent',choices=tuple(CATALOG))
    parser.add_argument('--from-run')
    parser.add_argument('--resume-both',action='store_true',help='Continue both archived final strategies, reviewing before every round')
    parser.add_argument('--rounds',type=int,default=3)
    parser.add_argument('--port',type=int,default=8789)
    parser.add_argument('--prepare-seconds',type=int,default=600,help='本轮模型准备上限（秒），60–3600')
    parser.add_argument('--reuse-workspaces',metavar='RUN_DIR',help='复用某个运行里已完成的提交，跳过第一轮准备（用于裁判侧故障中断后续跑）')
    parser.add_argument('--no-isolation',action='store_true',help='本机直跑：不使用 WSL/bubblewrap，只靠赛前约定不读取对方工作区')
    ARGS=parser.parse_args();NO_ISOLATION=bool(ARGS.no_isolation)
    if ARGS.prepare_seconds!=0 and not 60<=ARGS.prepare_seconds<=86400:parser.error('Preparation budget must be 0 (unlimited) or 60-86400 seconds')
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
                save(RUN/f'isolation-engine-{iteration}.json',{'mode':'none'} if NO_ISOLATION else [probe(w,'engine') for w in MODELS])
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
        stop_stream_proxy()
        if HOMES_TMP:shutil.rmtree(HOMES_TMP,ignore_errors=True)
        # Closing only stdin leaves the spectator server and replay frames available.
        ARENA.p.stdin.close()

if __name__=='__main__':main()
