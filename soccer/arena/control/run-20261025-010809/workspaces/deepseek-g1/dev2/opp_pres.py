import os, sys
os.environ['SOCCER_PRES'] = '1'
os.environ['SOCCER_D2'] = '1'
os.environ['SOCCER_SUPX'] = '0'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent_core
agent_core.main()
