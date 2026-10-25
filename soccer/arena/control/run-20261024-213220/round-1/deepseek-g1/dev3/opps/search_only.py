# -*- coding: utf-8 -*-
"""冻结的 agent_core + 开启 26 帧 rollout 搜索（不叠加 opp_search 的双边 rollout）。"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
os.environ['SOCCER_TRUST'] = '0.6'
os.environ['SOCCER_SEARCH'] = '1'
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
import ac_frozen
ac_frozen.main()
