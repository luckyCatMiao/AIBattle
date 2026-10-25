# -*- coding: utf-8 -*-
"""冻结的搜索型对手（= 第2轮提交版本的 agent_core + 1 窗口 rollout）。"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
os.environ['SOCCER_TRUST'] = '0.6'
os.environ['SOCCER_PRES'] = '0'
os.environ['SOCCER_D2'] = '0'
os.environ['SOCCER_SUPX'] = '1'
os.environ['SOCCER_FB'] = '2'
os.environ['SOCCER_SEARCH'] = '0'
os.environ['SOCCER_ONEPASS'] = '0'
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import os_frozen
os_frozen.main()
