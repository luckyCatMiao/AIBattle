import json

N = 15
DIRS = ((1, 0), (0, 1), (1, 1), (1, -1))

def wins(board, x, y, p):
    board[y][x] = p
    won = False
    for dx, dy in DIRS:
        n = 1
        for sign in (-1, 1):
            X, Y = x + sign*dx, y + sign*dy
            while 0 <= X < N and 0 <= Y < N and board[Y][X] == p:
                n += 1; X += sign*dx; Y += sign*dy
        if n >= 5:
            won = True; break
    board[y][x] = 0
    return won

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
    # Evaluate every five-cell segment; gaps count as playable extensions.
    vals = (0, 1, 12, 180, 5000, 10000000)
    total = 0
    for y in range(N):
        for x in range(N):
            for dx,dy in DIRS:
                ex,ey=x+4*dx,y+4*dy
                if not (0<=ex<N and 0<=ey<N): continue
                own=empty=0
                for k in range(5):
                    v=board[y+k*dy][x+k*dx]
                    if v==p: own+=1
                    elif v==0: empty+=1
                    else: break
                else:
                    # Discount a single closed end where a sixth square exists.
                    before=(x-dx,y-dy); after=(ex+dx,ey+dy)
                    open_ends=int(0<=before[0]<N and 0<=before[1]<N and board[before[1]][before[0]]==0)+int(0<=after[0]<N and 0<=after[1]<N and board[after[1]][after[0]]==0)
                    total += vals[own] * (1.0 if open_ends==2 else 0.72)
    return total

def choose(board, me):
    opp=3-me
    ownwins=winning_moves(board,me)
    if ownwins: return ownwins[0]
    ow=winning_moves(board,opp)
    if ow: return ow[0]
    cs=candidates(board)
    ranked=[]
    for x,y in cs:
        board[y][x]=me
        # Never allow an immediate opponent win if a safe alternative exists.
        if winning_moves(board,opp):
            score=-10**12
        else:
            attack=line_score(board,me)
            defense=line_score(board,opp)
            score=attack + 1.12*defense - 0.15*(abs(x-7)+abs(y-7))
        board[y][x]=0
        ranked.append((score,x,y))
    _,x,y=max(ranked)
    return x,y

def main():
    import sys
    for line in sys.stdin:
        try:
            obj=json.loads(line); board=obj['board']; me=1 if obj['yourColor']=='black' else 2
            x,y=choose(board,me)
            print(json.dumps({'x':x,'y':y,'note':'pattern tactics'}),flush=True)
        except Exception:
            print(json.dumps({'x':7,'y':7,'note':'fallback'}),flush=True)

if __name__ == '__main__': main()
