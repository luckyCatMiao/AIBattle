import os, sys
os.environ['SOCCER_TRUST'] = '1.0'
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent_core
agent_core.main()
