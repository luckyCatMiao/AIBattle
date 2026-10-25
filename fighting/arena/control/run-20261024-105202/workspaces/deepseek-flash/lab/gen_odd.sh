#!/bin/bash
for seat in 0 1; do
  for seed in 71 72 73 74 75; do
    for ot in nyx,sable,torv torv,nyx,sable sable,kestrel,torv; do
      for opt in def=0.6,agg=0.8,jit=8 def=0.3,agg=1,jit=12; do
        echo "$seat $seed vex,kestrel,aegis $ot $opt"
      done
    done
  done
done
