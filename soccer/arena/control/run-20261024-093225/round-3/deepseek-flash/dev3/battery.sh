#!/bin/bash
# 固定对手阵容，跑完整 12 种子 × 2 座位矩阵。用法: dev3/battery.sh [env...]
cd "$(dirname "$0")/.."
PYEXE="$(which python)"
ME="${ME:-agent.py}"
TOTAL_W=0; TOTAL_L=0; TOTAL_D=0; TOTAL_GF=0; TOTAL_GA=0
for opp in botSmart py:dev3/opps/search_def.py py:dev3/opps/search_pres.py py:dev3/opps/search_only.py py:dev3/opps/core_def.py py:dev3/opps/core_pres.py py:dev3/opps/core_out20.py; do
  out=$(env "$@" PYEXE="$PYEXE" node dev3/batch.js --me "$ME" --opp "$opp" \
    --sizes 0 --seeds 16,9,8,49,24,75,40,17,48,1,2,25 --swap both --jobs 12 2>&1 | tail -2)
  line=$(echo "$out" | head -1)
  echo "$line"
  read W L D GF GA < <(echo "$line" | sed -E 's/.*W([0-9]+) L([0-9]+) D([0-9]+).*进([0-9]+) 失([0-9]+).*/\1 \2 \3 \4 \5/')
  TOTAL_W=$((TOTAL_W+W)); TOTAL_L=$((TOTAL_L+L)); TOTAL_D=$((TOTAL_D+D)); TOTAL_GF=$((TOTAL_GF+GF)); TOTAL_GA=$((TOTAL_GA+GA))
done
T=$((TOTAL_W+TOTAL_L+TOTAL_D))
echo "=== TOTAL W$TOTAL_W L$TOTAL_L D$TOTAL_D  $(python -c "print(f'{100*$TOTAL_W/$T:.1f}%')" 2>/dev/null || echo) 进$TOTAL_GF 失$TOTAL_GA ==="
