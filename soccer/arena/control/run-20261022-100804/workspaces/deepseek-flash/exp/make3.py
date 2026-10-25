import pathlib
src = pathlib.Path('/workspace/agent.py').read_text()
out = pathlib.Path('/workspace/exp')
def rep(s, old, new):
    assert old in s, old
    return s.replace(old, new, 1)
def foesonly(s):
    return rep(s, "    others = [u for u in units if u['id'] != shooter_id]\n",
                  "    others = [u for u in units if u['id'] != shooter_id and u['team'] != team]\n")
v16 = foesonly(rep(src, "shot_clear = -0.05", "shot_clear = -0.20")); (out/'agent_v16_foes20.py').write_text(v16)
v17 = foesonly(src); (out/'agent_v17_foesonly005.py').write_text(v17)
v18 = rep(src, "shot_clear = -0.05", "shot_clear = -0.20"); (out/'agent_v18_loose20.py').write_text(v18)
print('ok')
