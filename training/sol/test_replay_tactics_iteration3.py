"""Exact public-replay endpoint and fork checks, independent of engine scores."""
import contextlib,io,json
# Reuse the independent contiguous-run oracle, suppressing its report on import.
with contextlib.redirect_stdout(io.StringIO()):
 from analyze_iteration3 import wins,forks
r=json.load(open('public_replays.json'))
def board(gi,ply):
 b=[[0]*15 for _ in range(15)]
 for m in r[gi]['moves'][:ply]:b[m['y']][m['x']]=m['color']
 return b
assert len(r)==17
assert len({tuple((m['x'],m['y'],m['color']) for m in g['moves']) for g in r})==13
for gi,ply,p,expected in [(15,11,1,{(8,7)}),(15,13,1,{(12,10)}),
 (15,21,1,{(12,7)}),(15,24,2,{(9,4),(4,9)}),
 (16,17,1,{(6,2)}),(16,23,1,{(9,2),(4,7)})]:
 assert set(wins(board(gi,ply),p))==expected,(gi,ply)
for gi,ply,p,expected in [(15,23,2,{(8,5),(4,9)}),(16,22,1,{(9,2),(5,6)})]:
 assert {xy for xy,w in forks(board(gi,ply),p)}==expected
print('Replay deduplication, six exact winning-cell sets and two surviving-fork sets passed')
