import json
import sys
import agent

style = sys.argv[1]
if style == 'baseline':
    import baseline as agent
elif style == 'defensive':
    import defensive_v1 as agent
if style == 'round1':
    import round1 as agent
elif style.startswith('home'):
    agent.HOME = float(style[4:])
if style == 'lift':
    agent.KINDS = (-1,)
    agent.JUMP_AGES = (-1,)
elif style == 'ground':
    agent.JUMP_AGES = (-1,)
for line in sys.stdin:
    obs = json.loads(line)
    actions = agent.decide(obs)
    print(json.dumps({'inputs': [[a] for a in actions]}), flush=True)
