#!/bin/bash
# usage: dev3/run.sh <opp> [env assignments...]
cd "$(dirname "$0")/.."
OPP="$1"; shift
env "$@" PYEXE="$(which python)" node dev3/batch.js --me "${ME:-agent.py}" --opp "$OPP" \
  --sizes 0 --seeds 16,9,8,49,24,75,40,17,48,1,2,25 --swap both --jobs 12 2>&1 | tail -3
