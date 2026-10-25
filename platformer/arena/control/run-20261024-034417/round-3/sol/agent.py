"""Persistent stdin/stdout bridge to the local JavaScript physics planner."""
import os
import subprocess
import sys


def main():
    core = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'agent_core.js')
    child = subprocess.Popen(['node', core], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, bufsize=0)
    try:
        for line in sys.stdin.buffer:
            child.stdin.write(line)
            child.stdin.flush()
            result = child.stdout.readline()
            if not result:
                raise RuntimeError('planner exited')
            sys.stdout.buffer.write(result)
            sys.stdout.buffer.flush()
    finally:
        child.terminate()


if __name__ == '__main__':
    main()
