#!/bin/bash
for cfg in "99999 99999" "180 99999" "99999 450" "300 600" "180 500" "99999 600"; do
  set -- $cfg
  echo -n "RESPECT=$1 HP=$2 : "
  RESPECT_FRAMES=$1 RESPECT_HP=$2 PY=python CONC=8 node bench2.js agent.py vex,kestrel,aegis 1 2>&1 | tail -1
done
