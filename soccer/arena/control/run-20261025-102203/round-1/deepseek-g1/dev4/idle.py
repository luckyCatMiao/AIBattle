import sys, json
for line in sys.stdin:
    o=json.loads(line); n=o['teamSize']
    print(json.dumps({"inputs":[[{"dir":"N","aim":None,"kick":False}]*n for _ in range(20)]}),flush=True)
