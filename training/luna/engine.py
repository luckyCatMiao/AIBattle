import json

N = 15
DIRS = ((1, 0), (0, 1), (1, 1), (1, -1))

def wins(board, x, y, p):
    board[y][x] = p
    for dx, dy in DIRS:
        n = 1
        for s in (-1, 1):
            X, Y = x + s*dx, y + s*dy
            while 0 <= X < N and 0 <= Y < N and board[Y][X] == p:
                n += 1; X += s*dx; Y += s*dy
        if n >= 5:
            board[y][x] = 0
            return True
    board[y][x] = 0
    return False

def candidates(board, radius=2):
    stones = [(x,y) for y in range(N) for x in range(N) if board[y][x]]
    if not stones: return [(7,7)]
    out = set()
    for x,y in stones:
        for X in range(max(0,x-radius), min(N,x+radius+1)):
            for Y in range(max(0,y-radius), min(N,y+radius+1)):
                if not board[Y][X]: out.add((X,Y))
    return sorted(out, key=lambda q: (abs(q[0]-7)+abs(q[1]-7), q[1], q[0]))

def winning_moves(board, p):
    return [(x,y) for y in range(N) for x in range(N) if not board[y][x] and wins(board,x,y,p)]

def line_score(board, p):
    # Five-cell windows reward both contiguous and broken, still-open shapes.
    vals = (0, 2, 18, 260, 12000, 10000000)
    total = 0
    for y in range(N):
        for x in range(N):
            for dx,dy in DIRS:
                ex,ey=x+4*dx,y+4*dy
                if not (0<=ex<N and 0<=ey<N): continue
                own=0; blocked=False
                for k in range(5):
                    v=board[y+k*dy][x+k*dx]
                    if v==p: own+=1
                    elif v and v!=p: blocked=True; break
                if blocked or not own: continue
                before=(x-dx,y-dy); after=(ex+dx,ey+dy)
                ends=int(0<=before[0]<N and 0<=before[1]<N and board[before[1]][before[0]]==0)+int(0<=after[0]<N and 0<=after[1]<N and board[after[1]][after[0]]==0)
                total += vals[own] * (1.0 if ends==2 else 0.65)
    return total

def choose(board, me):
    opp=3-me
    cs=candidates(board)
    ownwins=winning_moves(board,me)
    if ownwins: return ownwins[0]
    ow=winning_moves(board,opp)
    if len(ow)==1: return ow[0]

    # If the opponent has two distinct winning endpoints, a simple block loses.
    # Look for a counter-threat that creates at least two immediate wins.
    ranked=[]
    for x,y in cs:
        board[y][x]=me
        own_next=winning_moves(board,me)
        opp_next=winning_moves(board,opp)
        if len(opp_next):
            score=-10**15
        else:
            attack=line_score(board,me)
            defense=line_score(board,opp)
            score=attack + 1.08*defense - 0.12*(abs(x-7)+abs(y-7))
            if len(own_next)>=2: score += 10**12
            elif len(own_next)==1: score += 10**10
        board[y][x]=0
        ranked.append((score,x,y))
    # When no defensive move can survive, choose the best counterattack.
    if all(s <= -10**15 for s,_,_ in ranked):
        for i,(s,x,y) in enumerate(ranked):
            board[y][x]=me
            a=line_score(board,me); d=line_score(board,opp)
            board[y][x]=0
            ranked[i]=(a+1.08*d,x,y)
    _,x,y=max(ranked)
    return x,y

def main():
    import sys
    for line in sys.stdin:
        try:
            obj=json.loads(line); board=obj['board']; me=1 if obj['yourColor']=='black' else 2
            x,y=choose(board,me)
            print(json.dumps({'x':x,'y':y,'note':'threat-aware tactics'}),flush=True)
        except Exception:
            print(json.dumps({'x':7,'y':7,'note':'fallback'}),flush=True)

if __name__ == '__main__': main()
