#!/bin/bash
# 只跑 6 个有代表性的对手，用于快速迭代。用法: ME=... dev3/quick.sh [env...]
cd "$(dirname "$0")/.."
PYEXE="$(which python)"
ME="${ME:-agent.py}"
ENVARGS=("$@")
TW=0; TL=0; TD=0; TGF=0; TGA=0
for opp in botSmart py:dev3/opps/search_def.py py:dev3/opps/search_pres.py py:dev3/opps/search_only.py py:dev3/opps/core_def.py py:dev3/opps/core_pres.py; do
  out=$(env "${ENVARGS[@]}" PYEXE="$PYEXE" node dev3/batch.js --me "$ME" --opp "$opp" \
    --sizes 0 --seeds 16,9,8,49,24,75,40,17,48,1,2,25 --swap both --jobs 12 2>&1)
  s=$(echo "$out" | grep '^SUMMARY' | head -1)
  echo "$opp  $s"
  words=($s)
  TW=$((TW+${words[1]})); TL=$((TL+${words[2]})); TD=$((TD+${words[3]}))
  TGF=$((TGF+${words[4]})); TGA=$((TGA+${words[5]}))
done
T=$((TW+TL+TD))
echo "=== QUICK W$TW L$TL D$TD  $(python -c "print(f'{100*$TW/$T:.1f}%')") 进$TGF 失$TGA ==="
