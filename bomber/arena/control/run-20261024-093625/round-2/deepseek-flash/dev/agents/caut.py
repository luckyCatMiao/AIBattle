#!/usr/bin/env python3
# 保守型参考对手：贴脸惩罚很重、更晚开打。
import os, sys, runpy
os.environ['AG_ADJ'] = '20'
os.environ['AG_H1T'] = '30'
os.environ['AG_H2T'] = '20'
os.environ['AG_ESC'] = '0.6'
sys.argv = [sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'agent.py'), run_name='__main__')
