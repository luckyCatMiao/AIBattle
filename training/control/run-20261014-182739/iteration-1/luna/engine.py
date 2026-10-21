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
    return list(out)

def winning_moves(board, p):
    return [(x,y) for y in range(N) for x in range(N) if not board[y][x] and wins(board,x,y,p)]

def shape_score(board, p):
    # Score contiguous runs by their length and number of open ends.
    total = 0
    seen = set()
    for y in range(N):
      for x in range(N):
       if board[y][x] != p: continue
       for dx,dy in DIRS:
        if (x-dx,y-dy) in seen: continue
        if 0 <= x-dx < N and 0 <= y-dy < N and board[y-dy][x-dx] == p: continue
        n=1; X=x+dx; Y=y+dy
        while 0<=X<N and 0<=Y<N and board[Y][X]==p: n+=1; X+=dx; Y+=dy
        ends=int(0<=x-dx<N and 0<=y-dy<N and board[y-dy][x-dx]==0)+int(0<=X<N and 0<=Y<N and board[Y][X]==0)
        if n>=5: total+=100000000
        elif n==4: total += (180000 if ends==2 else 40000 if ends==1 else 0)
        elif n==3: total += (9000 if ends==2 else 1000 if ends==1 else 0)
        elif n==2: total += (350 if ends==2 else 70 if ends==1 else 0)
        seen.add((x,y))
    return total

def choose(board, me):
    opp=3-me
    cs=candidates(board)
    ownwins=[q for q in cs if wins(board,*q,me)]
    if ownwins: return max(ownwins,key=lambda q:shape_score_after(board,q,me,opp))
    ow=winning_moves(board,opp)
    if ow: return ow[0]

    best=None; bestv=-10**30
    for x,y in cs:
        board[y][x]=me
        # Detect opponent's direct wins board-wide, including outside local move list.
        replies=winning_moves(board,opp)
        if replies:
            v=-10**12
        else:
            attack=shape_score(board,me)
            defense=shape_score(board,opp)
            # Opponent forcing move that creates a four with a winning continuation.
            force=0
            for a,b in candidates(board):
                board[b][a]=opp
                if winning_moves(board,opp): force=max(force,1)
                board[b][a]=0
                if force: break
            v=attack + defense*1.18 - force*500000 + 0.2*(14-(abs(x-7)+abs(y-7)))
        board[y][x]=0
        if v>bestv: bestv=v; best=(x,y)
    return best or cs[0]

def shape_score_after(board,q,p,opp):
    x,y=q; board[y][x]=p; v=shape_score(board,p)-shape_score(board,opp); board[y][x]=0
    return v

def main():
    for line in __import__('sys').stdin:
        try:
            obj=json.loads(line); board=obj['board']; me=1 if obj['yourColor']=='black' else 2
            x,y=choose(board,me)
            print(json.dumps({'x':x,'y':y,'note':'tactical search'}),flush=True)
        except Exception:
            print(json.dumps({'x':7,'y':7,'note':'fallback'}),flush=True)

if __name__ == '__main__': main()
