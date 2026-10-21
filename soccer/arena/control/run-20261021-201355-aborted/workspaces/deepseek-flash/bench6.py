import sys
sys.path.insert(0,'/workspace')
from bench4 import run_set
for label,params in [
    ('block7 shot-0.4', dict(block_lead=7.0, shot_bias=-0.4)),
    ('block7 shot-0.6', dict(block_lead=7.0, shot_bias=-0.6)),
]:
    run_set(params, label)
