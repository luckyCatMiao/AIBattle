import json,time,urllib.request,os
TOKEN='REDACTED_OLD_MATCH_TOKEN'
BASE='http://127.0.0.1:8787'
LOG=r'C:\Users\Admin\Desktop\AIBattle\players\luna\moves.log'
DIRS=[(1,0),(0,1),(1,1),(1,-1)]
def req(path,body=None):
    data=None if body is None else json.dumps(body).encode()
    r=urllib.request.Request(BASE+path,data=data,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(r,timeout=15))
def windows():
    for y in range(15):
      for x in range(15):
       for dx,dy in DIRS:
        ex,ey=x+4*dx,y+4*dy
        if 0<=ex<15 and 0<=ey<15: yield [(x+i*dx,y+i*dy) for i in range(5)]
def score(board, me):
    opp=3-me; a=o=0
    weights={1:2,2:15,3:180,4:12000,5:100000000}
    for w in windows():
      vals=[board[y][x] for x,y in w]; m=vals.count(me); z=vals.count(opp)
      if not z and m: a+=weights[m]
      elif not m and z: o+=weights[z]
    return a+o*1.12
def choose(board,me):
    occupied=[(x,y) for y in range(15) for x in range(15) if board[y][x]]
    if not occupied: return 7,7
    cand=set()
    for x,y in occupied:
      for dx in range(-2,3):
       for dy in range(-2,3):
        X,Y=x+dx,y+dy
        if 0<=X<15 and 0<=Y<15 and not board[Y][X]: cand.add((X,Y))
    # Win now or prevent opponent's immediate win, then maximize tactical position score.
    def wins(x,y,p):
      board[y][x]=p
      ok=False
      for dx,dy in DIRS:
       n=1
       for s in (-1,1):
        X,Y=x+dx*s,y+dy*s
        while 0<=X<15 and 0<=Y<15 and board[Y][X]==p: n+=1; X+=dx*s; Y+=dy*s
       if n>=5: ok=True; break
      board[y][x]=0
      return ok
    for x,y in cand:
      if wins(x,y,me): return x,y
    threats=[(x,y) for x,y in cand if wins(x,y,3-me)]
    if threats:
      # prioritize blocking the strongest multi-line opportunity
      cand=set(threats)
    best=None; bestv=float("-inf")
    for x,y in cand:
      board[y][x]=me
      v=score(board,me)
      # Opponent's strongest immediate follow-up; heavily penalize allowing a win.
      replies=[(X,Y) for X,Y in cand if (X,Y)!=(x,y) and board[Y][X]==0]
      for X,Y in replies:
       if wins(X,Y,3-me): v-=200000000
      board[y][x]=0
      # centrality resolves ties toward flexible positions
      v-=0.01*((x-7)**2+(y-7)**2)
      if v>bestv: bestv=v; best=(x,y)
    return best
while True:
  try:
    s=req('/api/agent/state')
    if s.get('seriesStatus')=='finished':
      with open(LOG,'a') as f:f.write('FINISHED '+json.dumps(s.get('standings'))+'\n')
      break
    if not s.get('yourTurn'):
      time.sleep(.65); continue
    x,y=choose(s['board'],1 if s['yourColor']=='black' else 2)
    out=req('/api/move',{'matchId':s['matchId'],'ply':s['ply'],'x':x,'y':y,'note':'tactical'})
    with open(LOG,'a') as f:f.write(json.dumps({'round':s['round'],'color':s['yourColor'],'ply':s['ply'],'at':chr(65+x)+str(y+1),'result':out.get('status')})+'\n')
  except Exception as e:
    with open(LOG,'a') as f:f.write('ERROR '+repr(e)+'\n')
    time.sleep(1)


