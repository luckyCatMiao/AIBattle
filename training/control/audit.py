"""Independently replay completed training games and summarize recorded results."""
import collections, hashlib, json, pathlib, statistics

TRAIN=pathlib.Path(__file__).resolve().parents[1]
RUN=pathlib.Path(json.loads((TRAIN/'active-run.json').read_text(encoding='utf-8'))['path'])
config=json.loads((RUN/'config.json').read_text(encoding='utf-8')) if (RUN/'config.json').exists() else {
    'players':[{'id':'luna','name':'GPT-6 Luna','model':'gpt-6-luna'},{'id':'sol','name':'GPT-6.1 Sol','model':'gpt-6.1-sol'}]}

def won(board,color):
    # Enumerate every complete five-cell window independently of the referee's last-move walk.
    return any(all(0<=x+i*dx<15 and 0<=y+i*dy<15 and board[y+i*dy][x+i*dx]==color
                   for i in range(5))
               for y in range(15) for x in range(15) for dx,dy in ((1,0),(0,1),(1,1),(1,-1)))

def verify(game):
    board=[[0]*15 for _ in range(15)]
    winner=None
    for i,move in enumerate(game['moves']):
        assert not winner, 'move after win'
        color=1+i%2; x,y=move['x'],move['y']
        assert type(x) is int and type(y) is int and 0<=x<15 and 0<=y<15
        assert board[y][x]==0
        assert move['ply']==i+1 and move['color']==color
        player=game['black' if color==1 else 'white']
        assert move['playerId']==player['id']
        assert move['coordinate']==chr(65+x)+str(y+1)
        board[y][x]=color
        if won(board,color): winner=player['id']
    assert board==game['board'] and winner==game['winner'] and game['status']=='finished'
    assert winner or len(game['moves'])==225
    return {'id':game['id'],'plies':len(game['moves']),
            'winner': next((game[c]['name'] for c in ('black','white') if game[c]['id']==winner),None),
            'black':game['black']['name'],'white':game['white']['name'],
            'sequence':' '.join(m['coordinate'] for m in game['moves'])}

games=[]; rows=[]
for path in sorted(RUN.glob('games-*.json')):
    iteration=int(path.stem.split('-')[-1])
    verified=[verify(game) for game in json.loads(path.read_text(encoding='utf-8'))]
    timings=json.loads((RUN/f'timings-{iteration}.json').read_text(encoding='utf-8'))
    for game in verified: game['iteration']=iteration
    games.extend(verified)
    wins={p['id']:sum((g['winner'] or '').startswith(p['name']+' · ') for g in verified) for p in config['players']}
    rows.append({'iteration':iteration,'wins':wins,'draws':sum(g['winner'] is None for g in verified),
                 'plies':[g['plies'] for g in verified],
                 'max_move_seconds':round(max(t['seconds'] for t in timings),3),
                 'moves_over_5_seconds':sum(t['seconds']>5 for t in timings)})

snapshot_checks=[]
for path in RUN.glob('iteration-*/*/manifest.json'):
    expected=json.loads(path.read_text(encoding='utf-8'))
    for relative,digest in expected.items():
        assert hashlib.sha256((path.parent/relative).read_bytes()).hexdigest()==digest
    snapshot_checks.append(str(path.parent.relative_to(RUN)))
audit={'run':str(RUN),'players':config['players'],'verified_games':games,'rounds':rows,
       'distinct_sequences':len(set(g['sequence'] for g in games)),
       'unchanged_snapshots':snapshot_checks}
(RUN/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'verified_games':len(games),'distinct_sequences':audit['distinct_sequences'],'rounds':rows},ensure_ascii=False))
