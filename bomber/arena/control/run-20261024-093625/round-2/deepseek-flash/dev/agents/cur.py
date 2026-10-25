#!/usr/bin/env python3
# 当前提交配置的包装（显式清掉所有 AG_*，保证与继承环境无关）
import os, sys, runpy
for k in list(os.environ):
    if k.startswith('AG_'):
        del os.environ[k]
sys.argv = [sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'agent.py'), run_name='__main__')
