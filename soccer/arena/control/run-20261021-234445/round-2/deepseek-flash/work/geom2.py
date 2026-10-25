import sys, math
sys.path.insert(0,'/workspace'); sys.path.insert(0,'/workspace/work')
from geom import run_shot

print("Wing shots: shooter beside/behind box, keeper at various positions")
for shooter in [(38,5.6),(40,5.6),(42,5.6),(36,5.6),(38,4.5),(40,4.5),(34,5.6),(38,20.4),(40,20.4)]:
    for keeper in [(41,13),(41,11),(41,15),(39,13),(41,10.8),(41,15.2)]:
        tgt = 11.0 if shooter[1]<13 else 15.0
        out,f,fo=run_shot(shooter,keeper,[],tgt,keeper_mode='still')
        print(f'shooter {shooter} keeper {keeper} tgt {tgt}: {out}@{f}')
    print()
