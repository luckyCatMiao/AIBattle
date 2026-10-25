#!/bin/bash
cd "D:/extraProj/AIBattle/racing/arena/control/run-20261024-164152/workspaces/deepseek-flash"
seed=$1; seat=$2
if [ "$seat" = "0" ]; then
  out=$(node mock_duel2.js $seed python agent.py -- python proxy_agent.py 2>/dev/null)
else
  out=$(node mock_duel2.js $seed python proxy_agent.py -- python agent.py 2>/dev/null)
fi
echo "$out" | python -c "
import sys,json
d=json.load(sys.stdin)
me=int('$seat'); o=1-me
c=d['cars'][me]
print('%d %d %s %s %d'%(d['seed'], me, c['finished'], c['finishTime'], len(d['collisions'])))
"
