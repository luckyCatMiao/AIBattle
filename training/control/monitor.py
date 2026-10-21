import json, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
active=json.loads((root/'active-run.json').read_text(encoding='utf-8'))
run=pathlib.Path(active['path'])
state=json.loads((root/'status.json').read_text(encoding='utf-8'))
print(json.dumps({k:state[k] for k in ('at','event','iteration','cycles','player','game','ply','error') if k in state},ensure_ascii=False))
for who in active.get('players',['luna','sol']):
    files=sorted(run.glob(f'iteration-*-{who}.jsonl'),key=lambda p:p.stat().st_mtime)
    if not files: continue
    events=[]
    for line in files[-1].read_text(encoding='utf-8').splitlines():
        try: events.append(json.loads(line))
        except ValueError: pass
    messages=[e['item']['text'] for e in events if e.get('item',{}).get('type')=='agent_message']
    commands=[e['item'].get('command','')[:100] for e in events if e.get('type')=='item.started' and e.get('item',{}).get('type')=='command_execution']
    print(json.dumps({'player':who,'log':files[-1].name,'last_message':messages[-1:] and messages[-1][:500],
                      'last_commands':commands[-2:],'events':len(events)},ensure_ascii=False))
