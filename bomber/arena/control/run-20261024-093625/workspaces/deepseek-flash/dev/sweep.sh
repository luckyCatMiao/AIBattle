#!/bin/bash
# usage: dev/sweep.sh <seed> <count> <opp> "cfg1" "cfg2" ...
SEED=$1; COUNT=$2; OPP=$3; shift 3
rm -f /tmp/sw_*.txt
i=0
for cfg in "$@"; do
  i=$((i+1))
  ( env $cfg node dev/parab.js --count $COUNT --seed $SEED --procs 6 --a "python agent.py" --b "$OPP" > /tmp/sw_$i.txt 2>&1 ) &
done
wait
i=0
for cfg in "$@"; do
  i=$((i+1))
  echo "RESULT [$cfg] :: $(grep -E '^matches|^rounds' /tmp/sw_$i.txt | tr '\n' ' ')"
done
