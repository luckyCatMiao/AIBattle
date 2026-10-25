#!/bin/bash
MT="$3"; OT="$4"
node duel_clone.js "$1" "$2" "$3" "$4" "$5" 2>/dev/null | MT="$MT" OT="$OT" python -c "import sys,json,os;d=json.load(sys.stdin);print(d['seat'],d['seed'],os.environ['MT'],os.environ['OT'],d['winner'],d['rounds'],round(d['myDmg']),round(d['oppDmg']))"
