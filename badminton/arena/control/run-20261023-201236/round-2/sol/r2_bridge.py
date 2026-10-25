import importlib
import json
import sys
name = sys.argv[1]
module = importlib.import_module(name)
for line in sys.stdin:
    obs = json.loads(line)
    print(json.dumps({'inputs': [[a] for a in module.decide(obs)]}), flush=True)
