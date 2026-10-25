#!/usr/bin/env python3
# 攻击型参考对手：同一套代码，追击权重拉满、更早开打。
import os, sys, runpy
os.environ['AG_H1T'] = '200'
os.environ['AG_H2T'] = '200'
os.environ['AG_H1'] = '2'
os.environ['AG_H1A'] = '2'
os.environ['AG_TOWARD'] = '1.2'
sys.argv = [sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'agent.py'), run_name='__main__')
