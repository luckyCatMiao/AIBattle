#!/bin/bash
for pd in 0 2 4; do
  echo -n "POKE_DELAY=$pd : "
  POKE_DELAY=$pd PY=python CONC=8 node bench2.js agent.py vex,kestrel,aegis 1 2>&1 | tail -1
done
for t in vex,kestrel,aegis kestrel,aegis,vex vex,aegis,kestrel; do
  echo -n "team $t : "
  PY=python CONC=8 node bench2.js agent.py $t 1 2>&1 | tail -1
done
