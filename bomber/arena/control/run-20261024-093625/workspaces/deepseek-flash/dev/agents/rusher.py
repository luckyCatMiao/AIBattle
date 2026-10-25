#!/usr/bin/env python3
# 纯冲锋型参考对手：几乎不 farm，一路朝对手推进并贴脸放弹。
import os, sys, runpy
os.environ['AG_H1T'] = '200'
os.environ['AG_H2T'] = '200'
os.environ['AG_H1A'] = '30'
os.environ['AG_H2A'] = '30'
os.environ['AG_TOWARD'] = '0'
os.environ['AG_H1'] = '1'
os.environ['AG_H2'] = '1'
sys.argv = [sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'agent.py'), run_name='__main__')
