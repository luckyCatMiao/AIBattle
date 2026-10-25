#!/bin/bash
cd "D:/extraProj/AIBattle/racing/arena/control/run-20261024-164152/workspaces/deepseek-flash"
for s in "$@"; do
  out=$(node mock_referee.js "$s" python agent.py 2>/dev/null)
  echo "$out" | python -c "
import sys,json
d=json.load(sys.stdin)
m=d['me']
print('seed %-6d fin=%s t=%s bestLap=%s off=%s maxMs=%s err=%s'%(d['seed'],m['finished'],m['finishTime'],m['bestLap'],m.get('offRoadPct','-'),d['maxMs'],'?'))
"
done
