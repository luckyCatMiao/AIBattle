#!/bin/bash
node duel_clone.js "$1" "$2" "$3" "$4" "$5" 2>/dev/null | python -c "import sys,json;d=json.load(sys.stdin);print(d['seat'],d['seed'],d['winner'],d['rounds'],round(d['myDmg']),round(d['oppDmg']))"
