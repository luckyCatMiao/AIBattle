#!/usr/bin/env python3
"""Kickoff/restart analysis for round-2 replays (read-only)."""
import gzip, json, glob, sys

def load(p):
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return json.load(f)

def owner_team(o):
    if not o: return None
    return 0 if o.startswith('t0') else (1 if o.startswith('t1') else None)

def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else 'matches/r2-g*.json.gz'
    outpath = sys.argv[2] if len(sys.argv) > 2 else 'work/r2_kickoffs.json'
    paths = sorted(glob.glob(pat), key=lambda s: int(s.split('-g')[-1].split('.')[0]))
    out=[]
    for p in paths:
        d=load(p); seats=d['seats']; our=seats.index('deepseek-g1')
        frames=d['frames']; ev=d['events']
        kos=[e for e in ev if e['type']=='kickoff']
        rows=[]
        for ko in kos:
            f0=ko['frame']; first=None; first_frame=None
            for fr in frames:
                if fr['frame'] < f0: continue
                if fr['frame'] > f0+400: break
                t=owner_team(fr['ball'].get('owner'))
                if t is not None:
                    first=t; first_frame=fr['frame']; first_xy=(round(fr['ball']['x'],2),round(fr['ball']['y'],2)); break
            # next goal after kickoff within 30s
            ng=None
            for e in ev:
                if e['type']=='goal' and e['frame']>=f0 and e['frame']<=f0+600:
                    ng=(e['team'], round(e['t'],2), e['scorer']); break
            # first kick by team
            fk=None
            for e in ev:
                if e['type']=='kick' and e['frame']>=f0 and e['frame']<=f0+600:
                    fk=(seats[e['team']], round(e['t'],2), e['unit'], round(e['x'],1), round(e['y'],1)); break
            rows.append({'ko_frame':f0,'ko_t':round(f0/20.0,2),
                         'first_owner':None if first is None else seats[first],
                         'first_owner_t':None if first_frame is None else round((first_frame-f0)/20.0,2),
                         'first_owner_xy':first_xy if first_frame else None,
                         'first_kick':fk,'next_goal':None if ng is None else {'team':seats[ng[0]],'t':ng[1],'scorer':ng[2]}})
        out.append({'id':d['id'],'teamSize':d['teamSize'],'seats':seats,'our_team':our,
                    'map_spawns':d['map'].get('spawns'),'kickoffs':rows})
    with open(outpath,'w',encoding='utf-8') as f:
        json.dump(out,f,ensure_ascii=False,indent=1)
    print('wrote',outpath)
    for g in out:
        print('\n',g['id'],'ts',g['teamSize'],'seats',g['seats'],'our',g['our_team'])
        for r in g['kickoffs']:
            print('  ',r)
    if out:
        print('\nspawns example',out[0]['map_spawns'])

if __name__=='__main__':
    main()
