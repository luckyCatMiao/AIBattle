#!/bin/bash
for seat in 0 1; do
  for seed in 41 42 43 44 45 46 47 48 49 50; do
    for opt in '{}' '{"defense":0.6,"aggression":0.8,"jit":8}' '{"defense":0.9,"aggression":0.5,"jit":10}' '{"defense":0.3,"aggression":1.0,"jit":12}'; do
      echo "$seat $seed vex,kestrel,aegis kestrel,aegis,vex $opt"
    done
  done
done
