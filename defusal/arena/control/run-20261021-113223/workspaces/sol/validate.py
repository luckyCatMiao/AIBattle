import json,subprocess,time,math
from selftest import Engine
from agent import Agent

checks=[]
def run_scenario(name,units,bomb=None,seat=0,max_windows=110):
    e=Engine();r=e.ask({'op':'new','seed':13});r=e.ask({'op':'scenario','units':units,'bomb':bomb or {}});a=Agent();start_round=r['views'][seat]['round'];n=0
    while r['views'][seat]['round']==start_round and r['status']=='playing' and n<max_windows:
        v=r['views'][seat];actions=[{'inputs':[[{'dir':'N','aim':'U'} for _ in range(5)] for _ in range(20)]} for _ in range(2)]
        actions[seat]=a.act(v);r=e.ask({'op':'step','actions':actions});n+=1
    e.close()
    result={'name':name,'windows':n,'round':r['log'][0] if r['log'] else None}
    checks.append(result)
    return result

# Opponents remain alive far away, so objective resolution cannot be replaced by an elimination win.
attack_units=[{'id':'t0u'+str(i),'x':9.5+i*.1,'y':7.5} for i in range(5)]+[{'id':'t1u'+str(i),'x':37.5,'y':21.5} for i in range(5)]
r=run_scenario('plant_and_explode',attack_units)
assert r['round']['winnerTeam']==0 and r['round']['reason']=='炸弹爆炸'
for kit in (False,True):
    units=[{'id':'t1u'+str(i),'x':9.5+i*.05,'y':7.5,'kit':kit} for i in range(5)]+[{'id':'t0u'+str(i),'x':37.5,'y':21.5} for i in range(5)]
    r=run_scenario('defuse_kit_'+str(kit),units,{'state':'planted','x':9.5,'y':7.5,'timer':40,'carrier':None,'site':'A'},seat=1)
    assert r['round']['winnerTeam']==1 and r['round']['reason']=='拆除炸弹'
    assert r['windows']==(3 if kit else 6)
units=[{'id':'t0u'+str(i),'x':9.5+i*.1,'y':9.5} for i in range(5)]+[{'id':'t1u'+str(i),'x':37.5,'y':21.5} for i in range(5)]
r=run_scenario('pickup_plant_explode',units,{'state':'dropped','carrier':None,'x':9.5,'y':8.5})
assert r['round']['winnerTeam']==0 and r['round']['reason']=='炸弹爆炸'

# Exercise the actual submitted persistent stdin/stdout process through complete matches.
protocol=[]
for seat in (0,1):
    e=Engine();r=e.ask({'op':'new','seed':29});p=subprocess.Popen(['python3','/workspace/agent.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    other=Agent('right');windows=0;worst=0
    while r['status']=='playing' and windows<700:
        v=r['views'][seat];st=time.perf_counter();p.stdin.write(json.dumps(v)+'\n');p.stdin.flush();answer=json.loads(p.stdout.readline());worst=max(worst,time.perf_counter()-st)
        if v['phase']=='live':
            assert len(answer['inputs'])==20
            assert all(len(row)==5 for row in answer['inputs'])
        actions=[None,None];actions[seat]=answer;actions[1-seat]=other.act(r['views'][1-seat]);r=e.ask({'op':'buy' if v['phase']=='buy' else 'step','actions':actions});windows+=1
    p.stdin.close();p.wait(timeout=2);err=p.stderr.read();assert p.returncode==0 and not err,err
    assert r['status']=='finished'
    e.close();protocol.append({'seat':seat,'wins':r['wins'],'windows':windows,'max_response':worst,'stderr':err})
with open('/workspace/validation_results.json','w') as f:json.dump({'scenarios':checks,'protocol':protocol},f,indent=2)
print(json.dumps({'scenario_results':[(r['name'],r['windows'],r['round']['reason']) for r in checks],'protocol':protocol},ensure_ascii=False,indent=2))
