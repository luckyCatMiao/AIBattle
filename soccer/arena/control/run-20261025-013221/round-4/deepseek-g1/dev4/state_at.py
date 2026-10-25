import gzip,json,sys,math
fn=sys.argv[1]; want=float(sys.argv[2])
d=json.load(gzip.open(fn,'rt',encoding='utf-8'))
my=d['seats'].index('deepseek-g1')
fr=d['frames']
f=None
for x in fr:
    if x['frame']==int(want*20): f=x; break
if f is None: raise SystemExit('frame not found')
o=dict(f); o['yourTeam']=my; o['status']='playing'; o.pop('events',None); o.pop('winner',None)
json.dump(o,open('dev4/_s.json','w'))
print('myseat',my,'ball',f['ball'])
print('mine ', ' '.join('#%d(%.1f,%.1f)'%(u['index'],u['x'],u['y']) for u in f['units'] if u['team']==my))
print('opp  ', ' '.join('#%d(%.1f,%.1f)'%(u['index'],u['x'],u['y']) for u in f['units'] if u['team']!=my))
