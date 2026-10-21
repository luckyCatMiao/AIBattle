import sys
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent

A = load_agent('/workspace/tools/agent_pre_safe.py')()
B = load_agent('/workspace/tools/agent_pre_safe.py')()
g = engine.Game(['A', 'B'], seed=22)
while g.status == 'playing':
    rnd = g.round; fr = g.roundFrames
    res = []
    for o in range(2):
        bot = A if o == 0 else B
        r = bot.decide(make_obs(g, o))
        res.append((r, dict(bot.info)))
    if rnd == 2 and 1080 <= fr <= 1165:
        print('DECISION frame', fr, 'roundFrames', g.roundFrames)
        for o, (r, info) in enumerate(res):
            ins = r.get('inputs') or []
            print('  P%d note=%s ms=%s mt=%s bs=%s cur=%s dirs=%s' % (
                o, r.get('note'), info.get('ms'), info.get('mt'), info.get('bs'),
                info.get('cur'), ''.join(('B' if u.get('btn') else u.get('dir')) for u in ins[:8])))
    ws = []
    for o in range(2):
        ins = res[o][0].get('inputs') or []
        norm = [dict(x) for x in ([{'dir':'N','btn':None}]*20)]
        for i in range(min(20, len(ins))): norm[i] = ins[i]
        ws.append(norm)
    if rnd == 2 and 1100 <= fr <= 1180:
        evi = len(g.events)
        for i in range(20):
            if g.status != 'playing': break
            for o, f in enumerate(g.fighters):
                if f.alive: g.push_input(f, ws[o][i])
            g.step()
            for ev in g.events[evi:]:
                if ev['type'] == 'death':
                    print('   DEATH at frame', ev['frame'], 'owner', ev['owner'], 'by', ev.get('blastOwner'))
            evi = len(g.events)
        continue
    g.advance_window(ws)
print('log', g.roundLog)
