import io
p = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v17.py'
s = io.open(p, encoding='utf-8').read()

old = '''def move_dir(u, tx, ty, my_team, forbid_box=True):
    dx, dy = tx - u.x, ty - u.y
    d = hyp(dx, dy)
    if d < 0.12:
        return 'N'
    ux, uy = dx / d, dy / d
    best, bestv = 'N', -2.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        v = vx * ux + vy * uy
        if forbid_box:
            nx, ny = u.x + vx * SPD * DT * 1.5, u.y + vy * SPD * DT * 1.5
            if in_box(1 - my_team, nx, ny):
                v -= 1.5
        if v > bestv:
            bestv, best = v, name
    return best
'''
new = '''def move_dir(u, tx, ty, my_team, forbid_box=True):
    dx, dy = tx - u.x, ty - u.y
    d = hyp(dx, dy)
    if d < 0.12:
        return 'N'
    ux, uy = dx / d, dy / d
    bt = 1 - my_team
    best, bestv = 'N', -3.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        v = vx * ux + vy * uy
        if forbid_box:
            # look 4 frames ahead; a hard penalty keeps us out of the opponent box
            nx, ny = u.x + vx * SPD * DT * 4.0, u.y + vy * SPD * DT * 4.0
            if in_box(bt, nx, ny):
                v -= 3.0
            nx2, ny2 = u.x + vx * SPD * DT * 8.0, u.y + vy * SPD * DT * 8.0
            if in_box(bt, nx2, ny2):
                v -= 1.2
            # if currently hugging the edge, push away
            if in_box(bt, u.x + vx * SPD * DT * 6.0, u.y + vy * SPD * DT * 6.0):
                v -= 0.6
        if v > bestv:
            bestv, best = v, name
    if bestv < -2.0:
        # every direction enters the box: step away from the box centre
        b = PBOX2[bt]
        cx, cy = (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0
        ax, ay = u.x - cx, u.y - cy
        al = hyp(ax, ay) or 1.0
        best, bv = 'N', -9.0
        for name in DIR8:
            vx, vy = DIR_VEC[name]
            v = vx * ax / al + vy * ay / al
            if v > bv:
                bv, best = v, name
    return best
'''
assert old in s
s = s.replace(old, new)

# widen default safe_spot margin
s = s.replace('def safe_spot(my_team, x, y, margin=0.55):', 'def safe_spot(my_team, x, y, margin=0.75):')
io.open(p, 'w', encoding='utf-8').write(s)
print('patched v17')
