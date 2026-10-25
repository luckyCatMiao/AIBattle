#!/usr/bin/env python3
# 加法奖励 4
import os, sys, runpy
for k in list(os.environ):
    if k.startswith('AG_'):
        del os.environ[k]
os.environ['AG_H1A'] = '4'
sys.argv = [sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'agent.py'), run_name='__main__')
