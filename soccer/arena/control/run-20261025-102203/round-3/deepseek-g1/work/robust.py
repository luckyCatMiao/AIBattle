import gzip,json,glob,subprocess,sys,time,os
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
run=sys.argv[1]
obs_list=[]
fmt=None
for p in sorted(glob.glob(os.path.join(run,'r1-g*.json.gz')), key=lambda x:int(os.path.basename(x).split('-g')[-1].split('.')[0])):
    d=json.load(gzip.open(p,'rt',encoding='utf-8'))
    me=d['seats'].index('deepseek-g1'); f=d['unitsFormat']; n=d['teamSize']
    for fr in d['frames'][::37]:
        if fr['status']!='playing': continue
        units=[]
        for arr in fr['units']:
            u=dict(zip(f,arr))
            units.append({'id':u['id'],'team':u['team'],'index':u['index'],'x':u['x'],'y':u['y'],
                          'facing':{'x':u['fx'],'y':u['fy']},'hasBall':bool(u['hasBall']),
                          'keeper':bool(u['keeper']),'inOwnBox':bool(u['inOwnBox']),
                          'kickCd':u['kickCd'],'controlLock':u['controlLock'],
                          'goals':u['goals'],'kicks':u['kicks'],'touches':u['touches']})
        obs={'id':d['id'],'seed':d['seed'],'frame':fr['frame'],'status':'playing','yourTeam':me,
             'score':fr['score'],'half':fr['half'],'timeLeft':fr.get('timeLeft',60),
             'golden':False,'teamSize':n,'units':units,'ball':fr['ball'],
             'freeze':fr.get('freeze',0),'map':{'width':44,'height':26,'tiles':[],'goals':{},
             'spawns':[[],[]],'penaltyBoxes':{}},'rules':{'teamSize':6},'events':[],
             'stats':[{'kicks':0,'possession':0,'fouls':0},{'kicks':0,'possession':0,'fouls':0}]}
        obs_list.append(obs)
print('observations',len(obs_list),'sizes',sorted(set(o['teamSize'] for o in obs_list)))
inp='\n'.join(json.dumps(o) for o in obs_list)+'\n'
t0=time.time()
r=subprocess.run([sys.executable,'-I','agent.py'],input=inp,text=True,capture_output=True,cwd=WS,timeout=300)
dt=time.time()-t0
print('exit',r.returncode,'wall %.1fs'%dt,'per-call %.3fs'%(dt/len(obs_list)))
print('stderr',r.stderr[:300])
lines=r.stdout.strip().split('\n')
print('lines',len(lines))
bad=0
for i,line in enumerate(lines):
    o=json.loads(line)
    frames=o['inputs']
    n=obs_list[i]['teamSize']
    if len(frames)!=20 or any(len(fr)!=n for fr in frames): bad+=1
    for fr in frames:
        for u in fr:
            assert u['dir'] in ('N','U','D','L','R','UL','UR','DL','DR'), u
            if u['aim'] is not None:
                assert isinstance(u['aim'],(int,float)) and 0<=u['aim']<360, u
print('bad format lines',bad)
