#!/bin/bash
for seat in 0 1; do
  for seed in 31 32 33 34 35 36; do
    for mt in vex,kestrel,aegis kestrel,vex,aegis aegis,vex,kestrel; do
      for ot in kestrel,aegis,vex vex,kestrel,aegis aegis,vex,kestrel; do
        for opt in '{}' '{"defense":0.5,"aggression":0.9,"jit":10}'; do
          echo "$seat $seed $mt $ot $opt"
        done
      done
    done
  done
done
