#!/bin/bash
# 用法: tools/battery.sh [agent]   输出每个对手/人数/座位的比分汇总
AG=${1:-"python3 /workspace/agent.py"}
for opp in baseline kickbot dribbler v0 park; do
  for n in 1 2 3 4 5 6; do
    timeout 300 node /workspace/tools/bench.js --seeds 1 --teamSize $n --sides both --par 2 \
      --agent "$AG" --opp "python3 /workspace/agents/$opp.py" 2>/dev/null \
      | grep -E "side=" | sed -E "s/seed=[0-9]+ n=([0-9]+) side=([ab]) ([0-9]+):([0-9]+).*/$opp \1 \2 \3 \4/" \
      | awk -v o=$opp -v n=$n '{print o"\tn="$n"\tside="$3"\t"$4":"$5}'
  done
done
