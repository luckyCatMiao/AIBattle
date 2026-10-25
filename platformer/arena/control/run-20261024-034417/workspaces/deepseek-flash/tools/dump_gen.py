import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent
seed = int(sys.argv[1])
L = agent.generate_level(seed)
print(json.dumps(L))
