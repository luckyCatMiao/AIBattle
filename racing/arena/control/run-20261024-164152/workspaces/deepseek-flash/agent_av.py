"""Test-only wrapper: apply AV_* environment overrides to agent.PARAMS then run."""
import os
import sys

sys.dont_write_bytecode = True
import agent

for _k, _v in os.environ.items():
    if _k.startswith('AV_'):
        try:
            agent.PARAMS[_k[3:].lower()] = float(_v)
        except ValueError:
            pass

if __name__ == '__main__':
    agent.main()
