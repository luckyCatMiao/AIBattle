"""Contest entry point: reads one observation per line, writes one input window per line."""
import os
import sys
import json
import time
import signal

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from soccer import world_from_obs
from planner import Brain2

NEUTRAL_FRAME = None

PLAN_TIMEOUT = 2.5  # seconds; well under the 5 s protocol limit


class PlanTimeout(Exception):
    pass


def _on_alarm(signum, frame):
    raise PlanTimeout()


def timed_plan(brain, w, seconds=PLAN_TIMEOUT):
    """Run brain.plan under a wall-clock alarm so a pathological state can
    never blow the per-window deadline."""
    old = signal.signal(signal.SIGALRM, _on_alarm)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        return brain.plan(w)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old)


def neutral(n):
    return [{'dir': 'N', 'aim': None, 'kick': False} for _ in range(n)]


def main():
    brain = None
    brain_team = None
    last_n = 3
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        t0 = time.time()
        try:
            obs = json.loads(line)
            if not isinstance(obs, dict):
                raise ValueError('not an object')
        except Exception:
            sys.stdout.write(json.dumps({'inputs': [neutral(last_n) for _ in range(20)]},
                                        separators=(',', ':')) + '\n')
            sys.stdout.flush()
            continue
        n = int(obs.get('teamSize') or last_n)
        last_n = n
        team = int(obs.get('yourTeam') or 0)
        w = None
        try:
            if brain is None or brain_team != team:
                brain = Brain2(team)
                brain_team = team
            w = world_from_obs(obs)
            if hasattr(brain, 'apply_history'):
                brain.apply_history(obs, w)
            frames = timed_plan(brain, w)
            # validate shape / values
            if len(frames) != 20:
                raise ValueError('bad frame count')
            clean = []
            for fr in frames:
                if len(fr) != n:
                    raise ValueError('bad unit count')
                row = []
                for inp in fr:
                    d = inp.get('dir') or 'N'
                    aim = inp.get('aim')
                    if aim is not None:
                        aim = float(aim) % 360.0
                    row.append({'dir': d, 'aim': aim, 'kick': bool(inp.get('kick'))})
                clean.append(row)
            out = {'inputs': clean}
        except Exception as e:
            sys.stderr.write('plan error: %r\n' % (e,))
            sys.stderr.flush()
            out = None
            if w is not None and brain is not None:
                try:
                    fb = brain._fallback_frame(w)
                    if len(fb) == n:
                        out = {'inputs': [[dict(x) for x in fb] for _ in range(20)]}
                except Exception:
                    out = None
            if out is None:
                out = {'inputs': [neutral(n) for _ in range(20)]}
        dt = time.time() - t0
        if dt > 2.0:
            sys.stderr.write('slow plan %.2fs size %d\n' % (dt, n))
            sys.stderr.flush()
        sys.stdout.write(json.dumps(out, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
