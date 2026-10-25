#!/bin/bash
# 生成团队/座位组合
for seat in 0 1; do
  for seed in 21 22 23 24; do
    for mt in vex,kestrel,aegis vex,aegis,kestrel kestrel,vex,aegis kestrel,aegis,vex aegis,vex,kestrel aegis,kestrel,vex; do
      for ot in kestrel,aegis,vex vex,kestrel,aegis aegis,vex,kestrel; do
        echo "$seat $seed $mt $ot"
      done
    done
  done
done
