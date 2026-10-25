# -*- coding: utf-8 -*-
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
os.environ['SOCCER_TRUST'] = '0.6'
os.environ['SOCCER_OUTLET'] = '20'
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
import ac_frozen
ac_frozen.main()
