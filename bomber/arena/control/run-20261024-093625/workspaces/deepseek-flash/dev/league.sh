#!/bin/bash
# usage: dev/league.sh <seed> <count> "opp1,opp2,..." "cfg1" "cfg2" ...
SEED=$1; COUNT=$2; OPPS=$3; shift 3
rm -f /tmp/lg_*.txt
i=0
for cfg in "$@"; do
  IFS=',' read -ra OA <<< "$OPPS"
  j=0
  for opp in "${OA[@]}"; do
    i=$((i+1)); j=$((j+1))
    ( env $cfg node dev/parab.js --count $COUNT --seed $SEED --procs 5 --a "python agent.py" --b "$opp" > /tmp/lg_$i.txt 2>&1 ) &
  done
done
wait
i=0
for cfg in "$@"; do
  IFS=',' read -ra OA <<< "$OPPS"
  for opp in "${OA[@]}"; do
    i=$((i+1))
    M=$(grep -E '^match W' /tmp/lg_$i.txt | sed 's/.*=//;s/%.*//')
    R=$(grep -E '^rounds' /tmp/lg_$i.txt | sed 's/.*round W\/.W+L.=//;s/%.*//')
    echo "RESULT m=$M r=$R  [$cfg] vs $(basename $opp)"
  done
done
