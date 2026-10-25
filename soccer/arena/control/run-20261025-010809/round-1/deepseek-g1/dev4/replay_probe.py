import gzip,json,sys,subprocess,os
fn=sys.argv[1]; want=int(sys.argv[2]) if len(sys.argv)>2 else 5
d=json.load(gzip.open(fn,'rt',encoding='utf-8'))
myseat=d['seats'].index('deepseek-g1')
fr=d['frames']
shown=0
for f in fr:
    b=f['ball']; own=b.get('owner')
    if not own: continue
    team=int(own[1])
    if team!=myseat: continue
    if f['frame']<200: continue
    o=dict(f)
    o['yourTeam']=myseat
    o['status']='playing'
    o.pop('events',None); o.pop('winner',None)
    p=subprocess.run([sys.executable,'agent2.py'],input=json.dumps(o)+'\n',capture_output=True,text=True,timeout=30)
    if p.stderr.strip(): print('ERR',p.stderr[:300])
    out=json.loads(p.stdout)['inputs'][0]
    mine=[u for u in f['units'] if u['team']==myseat]
    carrier=[u for u in mine if u['index']==int(own.split('u')[1])][0]
    dirs=[x['dir'] for x in out]; kicks=[x['kick'] for x in out]
    print('f%4d ball(%5.1f,%4.1f) carrier#%d(%5.1f,%4.1f) opps=%s -> dirs=%s aim0=%s kick=%s'%(
        f['frame'],b['x'],b['y'],carrier['index'],carrier['x'],carrier['y'],
        [(u['index'],round(u['x'],1),round(u['y'],1)) for u in f['units'] if u['team']!=myseat and abs(u['x']-b['x'])<14 and abs(u['y']-b['y'])<14],
        ''.join(dirs),out[0]['aim'],any(kicks)))
    shown+=1
    if shown>=want: break
