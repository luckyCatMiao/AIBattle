"""Cross-check the Python engine against the untouched simulation.js source
(copied to dev/simref/ only to patch its two undefined exports) for several
seeds, i.e. several random net heights."""
import io
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

import engine_py as E
from xcheck import gen_inputs

KEYS = ("frame", "phase", "score", "server", "serveLeft", "pointLeft", "rally",
        "longestRally", "timeLeft", "status", "winner")


def run_py(spec):
    g = E.Match(seed=spec["seed"], match_id="xcheck")
    snaps = []
    for win in spec["windows"]:
        if g.status != "playing":
            break
        E.advance_window(g, [[E.normalize_frame(f) for f in win[0]],
                             [E.normalize_frame(f) for f in win[1]]])
        snaps.append(g.view(0))
    return snaps, g.netHeight


def main():
    seeds = [7011, 7021, 7041, 8005]
    base = gen_inputs()
    total_bad = 0
    for seed in seeds:
        spec = {"seed": seed, "windows": base["windows"]}
        inp = os.path.join(HERE, "simref", "inputs_%d.json" % seed)
        ref_out = os.path.join(HERE, "simref", "ref_%d.json" % seed)
        with io.open(inp, "w", encoding="utf-8") as f:
            json.dump(spec, f)
        subprocess.run(["node", os.path.join(HERE, "simref", "run_ref.js"), inp, ref_out],
                       check=True, stdout=subprocess.DEVNULL)
        with io.open(ref_out, encoding="utf-8") as f:
            ref = json.load(f)["snapshots"]
        snaps, py_net = run_py(spec)
        js_net = ref[0]["court"]["netHeight"] if ref else None
        bad = 0
        for i in range(min(len(ref), len(snaps))):
            a, b = ref[i], snaps[i]
            for key in KEYS:
                if a.get(key) != b.get(key):
                    bad += 1
                    if bad <= 5:
                        print("seed", seed, "win", i, key, "js", a.get(key), "py", b.get(key))
            for j in range(2):
                pa, pb = a["batsmen"][j], b["batsmen"][j]
                for key in ("x", "y", "vx", "vy", "onGround", "swing", "swingElapsed",
                            "swingType", "swingCd", "stamina", "charge", "hits"):
                    if pa.get(key) != pb.get(key):
                        bad += 1
                        if bad <= 5:
                            print("seed", seed, "win", i, "p", j, key,
                                  "js", pa.get(key), "py", pb.get(key))
            sa, sb = a["shuttle"], b["shuttle"]
            for key in ("x", "y", "vx", "vy", "alive", "lastTeam"):
                if sa.get(key) != sb.get(key):
                    bad += 1
                    if bad <= 5:
                        print("seed", seed, "win", i, "shuttle", key,
                              "js", sa.get(key), "py", sb.get(key))
        print("seed %d net js=%s py=%s windows=%d mismatches=%d" % (
            seed, js_net, py_net, min(len(ref), len(snaps)), bad))
        total_bad += bad
    print("TOTAL mismatches:", total_bad)


if __name__ == "__main__":
    main()
