#!/bin/bash
echo "=== FIXED BOTS (6 teams x 2 seats = 12 per opponent) ==="
PY=python CONC=8 node bench2.js agent.py vex,kestrel,aegis 1 2>&1
echo "=== RANDOMIZED OPPONENTS (25 seeds x 6 teams x 2 seats = 300) ==="
PY=python CONC=8 node randbench.js agent.py vex,kestrel,aegis 25 2>&1 | tail -2
echo "=== SEAT SPLIT (all opponents incl. mirror) ==="
PY=python CONC=8 node seatbench.js agent.py vex,kestrel,aegis 2>&1 | tail -1
echo "=== ROBUSTNESS ==="
PY=python python -I robust.py 2>&1 | tail -1
