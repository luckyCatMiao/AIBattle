# -*- coding: utf-8 -*-
"""冻结的第2轮基础策略（无 rollout 搜索）。"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
os.environ['SOCCER_TRUST'] = '0.6'
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import ac_frozen
ac_frozen.main()
