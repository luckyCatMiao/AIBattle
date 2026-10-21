import json,sys,collections
d=json.load(open('/workspace/public_replays.json'))
for r in d:
  if sys.argv[1] not in r['id']: continue
  print('==',r['id'],r['seats'],'winner',r['winner'],r['duration'])
  for side in (0,1):
    trains=collections.Counter(); seq=[]
    other=collections.Counter()
    for dec in r['decisions']:
      for c in dec['commands'][side]:
        if c['type']=='train': trains[c['unit']]+=1; seq.append((int(dec['now']),c['unit'][0]))
        elif c['type'] in('upgrade','repair'): seq.append((int(dec['now']),c['type']))
        other[c['type']]+=1
    print(r['seats'][side],dict(trains),dict(other))
    print('  ',seq[:40])
  for f in r['frames'][::30]:
    s=[]
    for p in (0,1):
      cnt=collections.Counter(u['type'] for u in f['units'] if u['owner']==p)
      s.append(f"{r['seats'][p]} b{int(f['bases'][p]['hp'])} cr{int(f['players'][p]['credits'])} {dict(cnt)} sc{f['players'][p]['score']}")
    print(int(f['now']),' | '.join(s),[n['owner'] for n in f['nodes']])
