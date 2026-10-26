# -*- coding: utf-8 -*-
"""冻结的搜索型对手（压迫+双人协防变体）。"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
os.environ['SOCCER_TRUST'] = '0.6'
os.environ['SOCCER_PRES'] = '1'
os.environ['SOCCER_D2'] = '1'
os.environ['SOCCER_SUPX'] = '0'
os.environ['SOCCER_FB'] = '2'
os.environ['SOCCER_SEARCH'] = '0'
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import os_frozen
os_frozen.main()
