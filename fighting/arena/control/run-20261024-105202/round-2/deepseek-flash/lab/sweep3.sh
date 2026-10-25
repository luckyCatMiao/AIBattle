#!/bin/bash
for t in vex,kestrel,aegis kestrel,vex,aegis kestrel,aegis,vex vex,aegis,kestrel aegis,vex,kestrel; do
  echo -n "$t : "
  PY=python CONC=8 node bench2.js agent.py $t 1 2>&1 | tail -1
done
