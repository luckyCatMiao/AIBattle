#!/bin/bash
for seat in 0 1; do
  for seed in 61 62 63 64 65; do
    for mt in vex,kestrel,aegis kestrel,vex,aegis aegis,vex,kestrel; do
      for ot in kestrel,aegis,vex vex,kestrel,aegis aegis,vex,kestrel; do
        for opt in def=0.6,agg=0.8,jit=8 def=0.3,agg=1,jit=12; do
          echo "$seat $seed $mt $ot $opt"
        done
      done
    done
  done
done
