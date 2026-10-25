import json, io, sys
name=sys.argv[1]; seat=int(sys.argv[2])
d=json.load(io.open('tools/r3/%s.json'%name,encoding='utf-8'))
out=io.open('tools/r3/%s_seat%d_obs.jsonl'%(name,seat),'w',encoding='utf-8')
for w in d['windows']:
    fr=d['frames'][w['frame']]
    obs=dict(fr)
    obs['yourPlayer']=seat
    obs['track']=d['track']
    obs['rules']=d['rules']
    out.write(json.dumps(obs)+'\n')
out.close()
print('wrote',len(d['windows']))
