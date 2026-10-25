import sys, json
for line in sys.stdin:
    if not line.strip(): continue
    sys.stdout.write(json.dumps({"inputs": [[{"throttle":0,"steer":0,"drift":False,"boost":False}] for _ in range(20)]}) + "\n")
    sys.stdout.flush()
