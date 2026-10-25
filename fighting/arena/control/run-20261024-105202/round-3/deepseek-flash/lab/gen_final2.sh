#!/bin/bash
for seat in 0 1; do
  for seed in 41 42 43 44 45 46 47 48 49 50; do
    for opt in def=0,agg=1,jit=4 def=0.6,agg=0.8,jit=8 def=0.9,agg=0.5,jit=10 def=0.3,agg=1,jit=12; do
      echo "$seat $seed vex,kestrel,aegis kestrel,aegis,vex $opt"
    done
  done
done
