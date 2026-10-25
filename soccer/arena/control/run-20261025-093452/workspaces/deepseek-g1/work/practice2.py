"""Practice with a chosen agent file in an isolated temp workspace.

Usage: python work/practice2.py --agent agent_v2.py --games 6 --seed-base 5500
Mirrors practice.py but does not touch the official workspace entry.json.
"""
import pathlib, random, subprocess, sys, shutil, json

HERE = pathlib.Path(__file__).resolve().parent.parent
TRAIN = pathlib.Path('D:/extraProj/AIBattle/soccer/arena/train.py')
OPPONENT = pathlib.Path('D:/extraProj/AIBattle/soccer/arena/control/run-20261022-200519/round-2/sol')

argv = sys.argv[1:]
agent = 'agent.py'
if '--agent' in argv:
    i = argv.index('--agent')
    agent = argv[i + 1]
    del argv[i:i + 2]
ws = HERE / 'work' / ('ws_' + pathlib.Path(agent).stem)
ws.mkdir(parents=True, exist_ok=True)
shutil.copy(HERE / agent, ws / 'agent.py')
(ws / 'entry.json').write_text(json.dumps({"mode": "program", "command": ["python3", "agent.py"]}))
extra = list(argv)
if '--seed-base' not in extra:
    extra += ['--seed-base', str(random.randint(10000, 99999))]
cmd = [sys.executable, str(TRAIN), "--practice", "--no-isolation",
       "--players", "deepseek-g1", "sol",
       "--practice-player", "deepseek-g1",
       "--practice-workspace", str(ws),
       "--opponent", str(OPPONENT)] + extra
raise SystemExit(subprocess.run(cmd).returncode)
