"""Dump point/hit events for one A/B match (dev only)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import ab

script = sys.argv[1] if len(sys.argv) > 1 else "agent.py"
opp = sys.argv[2] if len(sys.argv) > 2 else "dev/agent_v2.py"
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 7001
seat = int(sys.argv[4]) if len(sys.argv) > 4 else 0
r = ab.run(script, opp, seed, seat_a=seat)
g = r["_g"] if "_g" in r else None
# re-run cheaply? ab doesn't return g; print the event log captured there
for e in r.get("events", []):
    print(e)
