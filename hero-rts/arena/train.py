"""Isolated, independently authored model competitors; durable public game replays."""
import argparse, concurrent.futures, gzip, hashlib, importlib.util, json, msvcrt, os, pathlib, shutil, socket, subprocess, sys, tempfile, threading, time, urllib.parse

ROOT=pathlib.Path(__file__).resolve().parent
CONTROL=ROOT/'control'
spec=importlib.util.spec_from_file_location('legacy_transport',ROOT.parents[1]/'rts'/'arena'/'train.py')
transport=importlib.util.module_from_spec(spec);spec.loader.exec_module(transport)
MODELS={'luna':'gpt-6-luna','sol':'gpt-6.1-sol'}
LABELS=transport.LABELS
transport.MODELS=MODELS
RUN=None;REF=None;STATE={};GUARD=threading.Lock();ARGS=None;STARTING={};INHERITED={};HISTORY=[];HISTORY_FILES={}
PROTECTED=['RULES.md','GAME.md','simulation.js','catalog.js','example.json','canary.txt']
NO_ISOLATION=False
HOMES_TMP=None

def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,path)

def hashed(path):return hashlib.sha256(path.read_bytes()).hexdigest()

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
    if config.get('from_run'):load_history(resolve_run(config['from_run']),seen)
    for result in json.loads((run/'results.json').read_text(encoding='utf-8')):
        ident='history-'+run.name+'-'+result['id']
        HISTORY.append({**result,'original_id':result['id'],'id':ident,'source_run':run.name})
        HISTORY_FILES[ident]=run/(result['id']+'.json.gz')

def status(phase=None,**fields):
    with GUARD:
        if phase:STATE['phase']=phase
        STATE.update(fields);STATE['updated']=time.strftime('%Y-%m-%dT%H:%M:%S')
        save(RUN/'status.json',STATE);save(CONTROL/'status.json',STATE)
        print(json.dumps(STATE,ensure_ascii=False),flush=True)

def isolated(who,mode,cmd):
    return ['wsl.exe','-d','Ubuntu','-u','root','--','runuser','-u','nobody','--','python3',
        '/mnt/c/Users/Admin/Desktop/AIBattle/hero-rts/arena/isolate.py',who,mode,*cmd]

def probe(who,mode):
    code='''import os,pathlib,json
assert os.getuid()==65534
assert pathlib.Path('/workspace/canary.txt').read_text().strip()==WHO
blocked=['/mnt/c','/mnt/d','/run/WSL','/mnt/wsl','/proc/1/root/mnt/c','/workspace/../sol','/workspace/../luna','/workspace/../opus','/opt/aibattle-tools/auth','/home/admin1','/workspace/../../control']
for p in blocked:assert not pathlib.Path(p).exists(),p
if MODE=='engine':
 assert not pathlib.Path('/home/player/.codex').exists()
 assert not pathlib.Path('/home/player/.claude').exists()
 assert len(pathlib.Path('/proc/net/route').read_text().splitlines())==1
 try:pathlib.Path('/workspace/canary.txt').write_text('bad')
 except OSError as e:assert e.errno in (13,30)
 else:raise AssertionError('Workspace writable')
print(json.dumps({'who':WHO,'mode':MODE,'uid':os.getuid(),'blocked':blocked,'readonly':MODE=='engine'}))
'''.replace('WHO',repr(who)).replace('MODE',repr(mode))
    p=subprocess.run(isolated(who,mode,['python3','-']),input=code,text=True,encoding='utf-8',capture_output=True,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
    if p.returncode:raise RuntimeError(p.stderr)
    return json.loads(p.stdout)

def bootstrap():
    # provision_homes / start_stream_proxy 定义在 rts 的 transport 里，它们读的是 transport.RUN/CONTROL，
    # 本机直跑时要把这两个全局指向本系列，否则代理日志会写到 rts 目录、甚至因为 RUN 为 None 直接崩。
    transport.RUN=RUN
    transport.CONTROL=CONTROL
    env=transport.provision_homes()
    transport.start_stream_proxy(env)
    endpoints=['chatgpt.com','api.openai.com']
    if 'opus' in MODELS:
        host=urllib.parse.urlparse(os.environ.get('ANTHROPIC_BASE_URL','')).hostname
        if host:endpoints.append(host)
    hosts='127.0.0.1 localhost\n::1 localhost\n'+'\n'.join(socket.gethostbyname(h)+' '+h for h in endpoints)+'\n'
    (CONTROL/'network-hosts').write_text(hosts,encoding='utf-8')
    source=(ROOT.parent/'simulation.js').read_text(encoding='utf-8')
    public=source[:source.index('function bot(g,p)')]+source[source.index('module.exports='):]
    public=public.replace("if(p.kind==='bot')bot(g,p);",'')
    example=REF.ask({'type':'create','id':'example','players':[{'name':'A','hero':'vanguard'},{'name':'B','hero':'vanguard'}]})['state']
    example.update(yourPlayer=0,catalog=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify(require('./hero-rts/catalog')))"],cwd=ROOT.parents[1],text=True,encoding='utf-8')),lastErrors=[],decisionSeconds=.25,maxCommands=20)
    for who in MODELS:
        folder=RUN/'workspaces'/who
        if who==ARGS.incumbent or ARGS.continue_both:
            previous=pathlib.Path(ARGS.from_run)/f'round-{ARGS.source_round}'/who
            manifest=json.loads((previous/'manifest.json').read_text(encoding='utf-8'))
            for name,h in manifest.items():
                if hashed(previous/name)!=h:raise RuntimeError('Previous submission hash mismatch: '+name)
            shutil.copytree(previous,folder,ignore=shutil.ignore_patterns('manifest.json','public-*.json.gz','__pycache__'))
            if ARGS.continue_both:
                shutil.copytree(previous,RUN/'starting'/who)
                INHERITED[who]=manifest
                post=pathlib.Path(ARGS.from_run)/f'postmatch-{who}.md'
                if post.exists():shutil.copy2(post,folder/'previous-postmatch.md')
            else:STARTING[who]={name:h for name,h in manifest.items() if name not in PROTECTED and name!='public_results.json' and not name.startswith('public-')}
        else:folder.mkdir(parents=True)
        shutil.copy2(ROOT/'RULES.md',folder/'RULES.md');shutil.copy2(ROOT.parent/'README.md',folder/'GAME.md');shutil.copy2(ROOT.parent/'catalog.js',folder/'catalog.js')
        (folder/'simulation.js').write_text(public,encoding='utf-8');(folder/'canary.txt').write_text(who,encoding='utf-8');save(folder/'example.json',example)
        save(folder/'public_results.json',HISTORY)
        for result in HISTORY:
            source=HISTORY_FILES[result['id']]
            if hashed(source)!=result['sha256']:raise RuntimeError('Historical replay hash mismatch')
            shutil.copy2(source,folder/('public-'+result['id']+'.json.gz'))
    save(CONTROL/'workspace-paths.json',{w:(RUN/'workspaces'/w).relative_to(ROOT).as_posix() for w in MODELS})
    save(RUN/'isolation-prepare.json',{'mode':'none','note':'本机直跑；赛前约定不读取对方工作区'} if NO_ISOLATION else [probe(w,'prepare') for w in MODELS])
    save(RUN/'config.json',{**STATE,'preparation_seconds':ARGS.prepare_seconds,'decision_sim_seconds':.25,'max_commands':20,'games_per_round':2,'fresh_start':not bool(ARGS.incumbent or ARGS.continue_both),'incumbent':ARGS.incumbent,'continue_both':ARGS.continue_both,'from_run':ARGS.from_run,'source_round':ARGS.source_round,'starting_files':STARTING,'inherited_files':INHERITED,'clients':{w:'Claude Code' for w in MODELS},'no_isolation':NO_ISOLATION,'history_games':len(HISTORY),'source_sha256':hashed(ROOT.parent/'simulation.js'),'catalog_sha256':hashed(ROOT.parent/'catalog.js'),'public_sim_sha256':hashed(RUN/'workspaces'/next(iter(MODELS))/'simulation.js')})

def freeze(who,iteration,usage):
    folder=RUN/'workspaces'/who
    entry=json.loads((folder/'entry.json').read_text(encoding='utf-8'))
    catalog=json.loads((folder/'example.json').read_text(encoding='utf-8'))['catalog']
    if entry.get('hero') not in catalog['heroes'] or entry.get('mode') not in ('program','direct'):raise RuntimeError(who+' invalid entry.json')
    if entry['mode']=='program' and (not isinstance(entry.get('command'),list) or not entry['command'] or entry['command'][0] not in ('python3','node') or not all(isinstance(c,str) for c in entry['command'])):raise RuntimeError(who+' invalid command')
    if any(p.is_symlink() for p in folder.rglob('*')):raise RuntimeError('Submission symlinks unsupported')
    frozen=RUN/f'round-{iteration}'/who
    shutil.copytree(folder,frozen,ignore=shutil.ignore_patterns('__pycache__','public-*.json.gz'))
    # manifest.json 自身不能进清单：它是清单的载体，写进去就变成自引用。
    save(frozen/'manifest.json',{p.relative_to(frozen).as_posix():hashed(p) for p in frozen.rglob('*') if p.is_file() and p.name!='manifest.json'})
    if who==ARGS.incumbent and iteration==1:
        for name,h in STARTING[who].items():
            if hashed(frozen/name)!=h:raise RuntimeError('Incumbent strategy changed: '+name)
    save(RUN/f'round-{iteration}-{who}-usage.json',usage)
    with GUARD:STATE['ready'].append(who)
    status(player_ready=who)
    return entry

def prepare(who,iteration):
    # 冻结现任者：整个系列都不再调用模型，直接把上一系列的冻结提交原样冻结到本轮。
    if who==ARGS.incumbent:
        return freeze(who,iteration,[{'frozen_incumbent':True,'from_run':ARGS.from_run,'source_round':ARGS.source_round}])
    folder=RUN/'workspaces'/who
    protected={f:hashed(folder/f) for f in PROTECTED}
    incumbent_goal = (chr(10) * 2 + '【本轮目标】对手是**冻结的 ' + LABELS.get(ARGS.incumbent, ARGS.incumbent or '') + ' 策略**（它的代码与工作区对你不可见，禁止读取）。你的目标是在正式比赛中对它取得 **≥90% 的胜率**：用不同种子、不同座位反复自测，直到自测胜率稳定在 90% 以上再提交，并把实测胜率写进自测报告。') if ARGS.incumbent and who!=ARGS.incumbent else ''
    budget_text = (f'准备上限 {ARGS.prepare_seconds // 60} 分钟' if ARGS.prepare_seconds > 0
                   else '准备时间不设上限，完成你认为充分的准备后再提交')
    hard_timeout = None if ARGS.prepare_seconds <= 0 else ARGS.prepare_seconds + 30
    prompt=f'''你是 {MODELS[who]}，灰烬王座英雄 RTS 的独立参赛选手。当前第 {iteration} 轮。
目标是赢得比赛。阅读 RULES.md、GAME.md、catalog.js、simulation.js、example.json。public_results.json 和 public-*.json.gz 如有内容就是双方相同的历史公开记录。比赛起点：{STATE['setup_note']}。历史记录 id 以 history- 开头；压缩回放内部仍保留原局号，应通过文件名区分系列。你看不到对手代码。
你自己决定游戏策略和控制形式：可以直接推理，可以编写控制程序，也可以混合。组织者只提供游戏规则和传输，不提供战术。请遵守 entry.json 协议，提交合法首发英雄，实际测试你的控制方式能在完整战局使用。自写程序必须从 stdin 持续逐行读状态并逐行输出 JSON 后 flush，每次最多20条命令、5秒响应预算。
本轮使用 medium effort，{budget_text}。充分理解机制，编写并运行有对抗性的自测；提前完成即可提交，不需要等满预算。{'这是双方继续迭代的系列：工作区保留你自己的上一版实现、测试及复盘。每轮都应先分析最新公开比赛，再由你决定并实施改进，双方各有完整准备预算。' if ARGS.continue_both or iteration>1 else '挑战赛中被标为原样沿用的选手首轮不额外修改。'}每轮2场交换出生点，策略只在这2场期间冻结。每0.25游戏秒同步决策，等待双方响应期间游戏不推进。禁止获取对方私有文件，禁止更改公开资料、下载现成引擎或调用外部选手。
完整资料中包含金币木材、建筑科技、英雄技能与16种战斗兵种。自己理解机制和胜负；不要把组织者提供的测试数据当成策略。阅读大文件时用脚本针对性分析。
完成 entry.json、可运行实现以及简体中文 review.md（本轮复盘、实际改进、自测事实、已知弱点；只根据真实对局复盘）。如有 previous-postmatch.md，那是你自己上一系列的赛后复盘。{incumbent_goal}最终给简体中文简短说明。'''
    cmd=transport.model_command(who,seconds=0) if NO_ISOLATION else transport.model_command(who,seconds=ARGS.prepare_seconds)
    save(RUN/f'round-{iteration}-{who}-invocation.json',{'model':MODELS[who],'reasoning_effort':'medium','command':cmd,'budget_seconds':ARGS.prepare_seconds})
    try:
        with (RUN/f'round-{iteration}-{who}.jsonl').open('w',encoding='utf-8') as out,(RUN/f'round-{iteration}-{who}.stderr.log').open('w',encoding='utf-8') as err:
            if NO_ISOLATION:
                ws=RUN/'workspaces'/who
                p=subprocess.run(cmd,input=prompt.replace('/workspace',str(ws)),stdout=out,stderr=err,text=True,encoding='utf-8',timeout=hard_timeout,cwd=str(ws),creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                p=subprocess.run(isolated(who,'prepare',cmd),input=prompt,stdout=out,stderr=err,text=True,encoding='utf-8',timeout=hard_timeout,creationflags=subprocess.CREATE_NO_WINDOW)
    except subprocess.TimeoutExpired:
        # 模型跑满预算：只要它已经把 entry.json 落盘，就按已提交处理，不整场报废。
        print(f'{who} 准备跑满 {ARGS.prepare_seconds//60} 分钟预算',flush=True)
        if not (folder/'entry.json').exists():raise RuntimeError(f'{who} 准备超时且没有提交 entry.json')
        save(RUN/f'round-{iteration}-{who}-completion.json',{'model_completed':False,'timed_out':True})
        for f,h in protected.items():
            if hashed(folder/f)!=h:raise RuntimeError(who+' modified protected file '+f)
        return freeze(who,iteration,[{'timed_out':True}])
    events=[json.loads(line) for line in (RUN/f'round-{iteration}-{who}.jsonl').read_text(encoding='utf-8').splitlines() if line.startswith('{')]
    usage=transport.completed_usage(who,events)
    save(RUN/f'round-{iteration}-{who}-completion.json',{'returncode':p.returncode,'model_completed':True})
    if who=='opus':(folder/'submission.txt').write_text(next(e for e in events if e.get('type')=='result').get('result',''),encoding='utf-8')
    for f,h in protected.items():
        if hashed(folder/f)!=h:raise RuntimeError(who+' modified protected file '+f)
    return freeze(who,iteration,usage)

class Competitor:
    def __init__(self,who,entry,iteration,number):
        self.who,self.entry,self.iteration,self.number=who,entry,iteration,number
        self.process=None
        if entry['mode']=='program':
            if NO_ISOLATION:
                cmd=list(entry['command'])
                if cmd[0] in ('python3','python','py'):cmd[0]=sys.executable
                elif cmd[0]=='node':cmd[0]=shutil.which('node') or 'node'
                self.process=transport.JsonProcess(cmd,RUN/f'engine-{iteration}-{number}-{who}.log',cwd=str(RUN/f'round-{iteration}'/who))
            else:
                self.process=transport.JsonProcess(isolated(who,'engine',['timeout','--signal=KILL','7200s',*entry['command']]),RUN/f'engine-{iteration}-{number}-{who}.log')
    def move(self,obs):
        begin=time.monotonic()
        if self.process:out=self.process.ask(obs,5)
        else:
            folder=RUN/'workspaces'/self.who;action=folder/'action.json'
            if action.exists():action.unlink()
            prompt='继续本场 RTS。只读取自己的笔记和公开规则。将本窗口输出 {"commands":[...],"note":"中文简注"} 写入 action.json。当前状态：\n'+json.dumps(obs)
            with (RUN/f'direct-{self.iteration}-{self.number}-{self.who}-{obs["tick"]}.jsonl').open('w',encoding='utf-8') as f:
                if NO_ISOLATION:
                    p=subprocess.run(transport.model_command(self.who,'action-summary.txt',0),input=prompt,stdout=f,stderr=f,text=True,encoding='utf-8',timeout=200,cwd=str(folder),creationflags=subprocess.CREATE_NO_WINDOW)
                else:
                    p=subprocess.run(isolated(self.who,'prepare',transport.model_command(self.who,'action-summary.txt',180)),input=prompt,stdout=f,stderr=f,text=True,encoding='utf-8',timeout=200,creationflags=subprocess.CREATE_NO_WINDOW)
            if p.returncode:raise RuntimeError('Direct reasoning failed')
            out=json.loads(action.read_text(encoding='utf-8'))
        if not isinstance(out,dict) or not isinstance(out.get('commands'),list) or len(out['commands'])>20:raise RuntimeError('Invalid response envelope')
        return out,round(time.monotonic()-begin,6)
    def close(self):
        if self.process:self.process.close()

def play(iteration,number,order,entries,pool):
    game_id=f'r{iteration}-g{number}'
    state=REF.ask({'type':'create','id':game_id,'players':[{'name':LABELS[w],'hero':entries[w]['hero']} for w in order]})['state']
    catalog=json.loads((RUN/'workspaces'/next(iter(MODELS))/'example.json').read_text(encoding='utf-8'))['catalog']
    controllers={w:Competitor(w,entries[w],iteration,number) for w in order}
    errors=[[],[]];decisions=[];technical=None;last_status=0;frames=1
    status('交战中',round=iteration,game=number,game_id=game_id,seats=order,now=0)
    target=RUN/(game_id+'.json.gz');temp=target.with_suffix('.tmp')
    try:
        with gzip.open(temp,'wt',encoding='utf-8',compresslevel=3) as f:
            prefix={'id':game_id,'round':iteration,'game':number,'seats':order}
            f.write(json.dumps(prefix,ensure_ascii=False)[:-1]+',"frames":[');json.dump(state,f,ensure_ascii=False,separators=(',',':'))
            for _ in range(4801):
                if state['status']=='finished':break
                futures=[pool.submit(controllers[w].move,{**state,'catalog':catalog,'yourPlayer':i,'lastErrors':errors[i],'decisionSeconds':.25,'maxCommands':20}) for i,w in enumerate(order)]
                answers=[];failed=[]
                for i,future in enumerate(futures):
                    try:answers.append(future.result())
                    except Exception as e:answers.append(None);failed.append((i,str(e)))
                if failed:
                    technical={order[i]:message for i,message in failed}
                    state={**state,'status':'finished','winner':1-failed[0][0] if len(failed)==1 else None,'reason':'技术负：'+json.dumps(technical,ensure_ascii=False)}
                    f.write(',');json.dump(state,f,ensure_ascii=False,separators=(',',':'));frames+=1;break
                commands=[a[0]['commands'] for a in answers]
                decision={'tick':state['tick'],'now':state['now'],'commands':commands,'seconds':[a[1] for a in answers],'notes':[str(a[0].get('note',''))[:500] for a in answers]}
                reply=REF.ask({'type':'advance','commands':commands},30);state=reply['state'];errors=reply['errors'];decision['errors']=errors;decisions.append(decision)
                f.write(',');json.dump(state,f,ensure_ascii=False,separators=(',',':'));frames+=1
                if time.monotonic()-last_status>5:status(now=round(state['now'],2),tick=state['tick']);last_status=time.monotonic()
            if state['status']!='finished':raise RuntimeError('Game failed to finish by simulation deadline')
            result={'id':game_id,'round':iteration,'game':number,'seats':order,'winner':order[state['winner']] if state['winner'] is not None else None,'reason':state['reason'],'duration':round(state['now'],2),'scores':{w:state['players'][i]['score'] for i,w in enumerate(order)},'errors':{w:sum(len(d['errors'][i]) for d in decisions) for i,w in enumerate(order)},'technicalFailure':technical,'frames':frames}
            tail={**result,'decisions':decisions,'final':state}
            # Prefix already has id/round/game/seats; avoid duplicate JSON keys.
            for key in ('id','round','game','seats','frames'):tail.pop(key)
            f.write('],'+json.dumps(tail,ensure_ascii=False,separators=(',',':'))[1:])
        os.replace(temp,target)
    finally:
        for controller in controllers.values():controller.close()
    result['sha256']=hashed(target);STATE['games'].append(result);STATE['results'].append(result)
    save(RUN/'results.json',STATE['results']);status('本局结束',now=result['duration'],tick=state['tick'])
    return result

def review(who):
    prompt='比赛结束。读取 public_results.json 和 public-*.json.gz 中双方相同的公开回放，分析具体时间/场次的决策、错误和可改进之处。只重点复盘本次非 history- 前缀的对局，明确区分上一系列历史。请写简体中文 postmatch.md；不得声称你已经实现未做的改进，不修改策略文件。结果能说明本次策略表现，不能泛化为模型整体能力高低。最多3分钟，最后给简短中文说明。'
    with (RUN/f'postmatch-{who}.jsonl').open('w',encoding='utf-8') as out,(RUN/f'postmatch-{who}.stderr.log').open('w',encoding='utf-8') as err:
        if NO_ISOLATION:
            ws=RUN/'workspaces'/who
            p=subprocess.run(transport.model_command(who,'postmatch-summary.txt',0),input=prompt.replace('/workspace',str(ws)),stdout=out,stderr=err,text=True,encoding='utf-8',timeout=210,cwd=str(ws),creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            p=subprocess.run(isolated(who,'prepare',transport.model_command(who,'postmatch-summary.txt',180)),input=prompt,stdout=out,stderr=err,text=True,encoding='utf-8',timeout=210,creationflags=subprocess.CREATE_NO_WINDOW)
    source=RUN/'workspaces'/who/'postmatch.md'
    events=[json.loads(line) for line in (RUN/f'postmatch-{who}.jsonl').read_text(encoding='utf-8').splitlines() if line.startswith('{')]
    try:usage=transport.completed_usage(who,events)
    except RuntimeError:usage=None
    # The CLI can finish its model turn and write the document, then exceed
    # the wrapper deadline while shutting down. Preserve both pieces of evidence.
    accepted=bool(usage and source.exists() and source.stat().st_size)
    save(RUN/f'postmatch-{who}-completion.json',{'returncode':p.returncode,'model_completed':bool(usage),'accepted':accepted,'usage':usage,'document_sha256':hashed(source) if accepted else None})
    if accepted:shutil.copy2(source,RUN/f'postmatch-{who}.md')
    return accepted

def main():
    global RUN,REF,STATE,ARGS,MODELS,HISTORY
    parser=argparse.ArgumentParser();parser.add_argument('--rounds',type=int,default=1)
    parser.add_argument('--players',nargs=2,choices=tuple(transport.CATALOG),default=['luna','sol'])
    parser.add_argument('--incumbent',choices=tuple(transport.CATALOG));parser.add_argument('--from-run')
    parser.add_argument('--continue-both',action='store_true',help='Continue both previous strategies, with fresh preparation every round')
    parser.add_argument('--prepare-seconds',type=int,default=1800)
    parser.add_argument('--no-isolation',action='store_true',help='本机直跑：不使用 WSL/bubblewrap，只靠赛前约定不读取对方工作区')
    args=parser.parse_args();ARGS=args;args.source_round=None
    if not 1<=args.rounds<=10:parser.error('rounds must be 1–10')
    if len(set(args.players))!=2:parser.error('Two different models required')
    if args.prepare_seconds!=0 and not 60<=args.prepare_seconds<=86400:parser.error('Preparation budget must be 0 (unlimited) or 60–86400 seconds')
    MODELS={w:transport.CATALOG[w] for w in args.players};transport.MODELS=MODELS
    transport.NO_ISOLATION=bool(args.no_isolation)
    transport.PROXY_PORT=8896  # 与 rts 错开，避免同时运行时代理端口冲突
    global NO_ISOLATION
    NO_ISOLATION=bool(args.no_isolation)
    if args.incumbent and (args.incumbent not in MODELS or not args.from_run):parser.error('Incumbent requires selected player and --from-run')
    if args.continue_both and (args.incumbent or not args.from_run):parser.error('--continue-both requires --from-run and cannot combine with --incumbent')
    if args.from_run:
        previous=pathlib.Path(args.from_run).resolve();args.from_run=str(previous)
        config=json.loads((previous/'config.json').read_text(encoding='utf-8'));args.source_round=config['rounds']
        if args.incumbent and config['models'].get(args.incumbent)!=MODELS[args.incumbent]:parser.error('Incumbent model mismatch')
        if args.continue_both and any(config['models'].get(w)!=MODELS[w] for w in MODELS):parser.error('Continuation model mismatch')
        if config['source_sha256']!=hashed(ROOT.parent/'simulation.js') or config['catalog_sha256']!=hashed(ROOT.parent/'catalog.js'):parser.error('Game rules changed from incumbent series')
        load_history(previous)
    CONTROL.mkdir(parents=True,exist_ok=True)
    lock=(CONTROL/'.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    RUN=CONTROL/('run-'+time.strftime('%Y%m%d-%H%M%S'));RUN.mkdir()
    budget_note=f'各最多 {args.prepare_seconds//60} 分钟准备' if args.prepare_seconds>0 else '准备时间不设上限'
    setup=(f'双方继承各自上一系列策略，继续各迭代 {args.rounds} 轮，每轮{budget_note}；双方可见相同历史公开回放' if args.continue_both else f'{LABELS[args.incumbent]} 沿用上一系列冻结策略，不额外修改；挑战者从零，{budget_note}；双方可见相同历史公开回放' if args.incumbent else f'双方从零开始，{budget_note}')+'；每轮交换出生点打两局；每0.25秒同步决策；' + ('本机直跑，赛前约定不读取对方工作区' if NO_ISOLATION else '策略代码隔离')
    STATE={'run':RUN.name,'phase':'准备比赛','models':MODELS,'labels':{w:LABELS[w] for w in MODELS},'reasoning_effort':'medium','round':1,'rounds':args.rounds,'games':[],'results':[],'ready':[],'setup_note':setup,'pid':os.getpid(),'completed':False}
    save(CONTROL/'active-run.json',{'path':str(RUN),'pid':os.getpid()})
    REF=transport.JsonProcess(['node',str(ROOT/'referee.js')],RUN/'referee.stderr.log')
    try:
        bootstrap();status('双方准备策略')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for iteration in range(1,args.rounds+1):
                status('双方准备策略' if iteration==1 else '双方复盘并改进',round=iteration,ready=[])
                futures={w:pool.submit(prepare,w,iteration) for w in MODELS};entries={w:f.result() for w,f in futures.items()}
                save(CONTROL/'engine-paths.json',{w:(RUN/f'round-{iteration}'/w).relative_to(ROOT).as_posix() for w in MODELS})
                save(RUN/f'isolation-engine-{iteration}.json',{'mode':'none'} if NO_ISOLATION else [probe(w,'engine') for w in MODELS])
                for number,order in enumerate([list(MODELS),list(reversed(MODELS))],1):
                    result=play(iteration,number,order,entries,pool)
                    for who in MODELS:shutil.copy2(RUN/(result['id']+'.json.gz'),RUN/'workspaces'/who/('public-'+result['id']+'.json.gz'))
                for who in MODELS:
                    save(RUN/'workspaces'/who/'public_results.json',HISTORY+STATE['results'])
                    frozen=RUN/f'round-{iteration}'/who
                    for name,h in json.loads((frozen/'manifest.json').read_text(encoding='utf-8')).items():
                        if hashed(frozen/name)!=h:raise RuntimeError('Frozen strategy changed: '+who+'/'+name)
            status('对局完成，核验回放')
            audit=json.loads(subprocess.check_output(['node',str(ROOT/'audit.js'),str(RUN)],text=True,encoding='utf-8',timeout=180))
            status('对局完成，双方撰写中文复盘',audit=audit)
            reviews={w:pool.submit(review,w) for w in MODELS}
            review_status={w:f.result() for w,f in reviews.items()}
        status('比赛完成',completed=True,review_status=review_status,audit={**audit,'isolation_probes_passed':True,'swapped_seats':True})
        subprocess.run(['python',str(ROOT/'report.py'),str(RUN)],check=True,creationflags=subprocess.CREATE_NO_WINDOW)
    except Exception as e:status('比赛中止，需要检查',error=str(e));raise
    finally:
        transport.stop_stream_proxy()
        if HOMES_TMP:shutil.rmtree(HOMES_TMP,ignore_errors=True)
        REF.close()

if __name__=='__main__':main()
