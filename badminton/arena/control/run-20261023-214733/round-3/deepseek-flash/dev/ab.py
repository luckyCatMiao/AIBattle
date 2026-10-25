"""A/B harness: run two bundled agents as subprocesses on the local engine.

Usage: python dev/ab.py A.py B.py seed1 seed2 ...
Prints one line per (seed, seat) and an aggregate.  Instrumentation comes from
the engine itself (hits, jumps, stamina), so it is independent of the agent's
own logging.
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import engine_py as E


class Proc:
    def __init__(self, script, env=None):
        self.script = script
        envd = dict(os.environ)
        envd.update(env or {})
        self.p = subprocess.Popen([sys.executable, script], cwd=ROOT,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True,
                                  encoding="utf-8", bufsize=1, env=envd)
        self.mx = 0.0

    def act(self, obs):
        t0 = time.time()
        self.p.stdin.write(json.dumps(obs, ensure_ascii=False) + "\n")
        self.p.stdin.flush()
        line = self.p.stdout.readline()
        dt = time.time() - t0
        self.mx = max(self.mx, dt)
        if not line:
            raise RuntimeError("agent died")
        return [E.normalize_frame(f)[0] for f in json.loads(line)["inputs"]]

    def close(self):
        try:
            self.p.stdin.close()
            self.p.wait(timeout=5)
        except Exception:
            self.p.kill()


def parse_spec(spec):
    parts = spec.split("|")
    script = parts[0]
    env = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            env[k] = v
    return script, env


def run(a, b, seed, max_windows=4000, seat_a=0):
    g = E.Match(seed=seed)
    sa, ea = parse_spec(a)
    sb, eb = parse_spec(b)
    pa = Proc(sa, ea)
    pb = Proc(sb, eb)
    agents = [pa, pb] if seat_a == 0 else [pb, pa]
    stats = [dict(swings=0, hits=0, jumps=0, sprint=0, smax=0.0, smin=100.0,
                  st=0.0, contact_h=[], contact_sp=[], kinds={},
                  run=0, idle=0, dead=0, air=0) for _ in range(2)]
    prev = [dict(g.batsmen[0]), dict(g.batsmen[1])]
    w = 0
    t0 = time.time()
    while g.status == "playing" and w < max_windows:
        o0, o1 = g.view(0), g.view(1)
        w0 = agents[0].act(o0)
        w1 = agents[1].act(o1)
        for fi in range(10):
            if g.status != "playing":
                break
            g.batsmen[0]["held"] = w0[fi]
            g.batsmen[1]["held"] = w1[fi]
            g.step()
            for i in range(2):
                bs = g.batsmen[i]
                if prev[i]["swing"] == 0 and bs["swing"] > 0:
                    stats[i]["swings"] += 1
                if prev[i]["onGround"] and not bs["onGround"]:
                    stats[i]["jumps"] += 1
                if bs.get("sprinting"):
                    stats[i]["sprint"] += 1
                avx = abs(bs["vx"])
                if bs["onGround"]:
                    if bs.get("sprinting"):
                        pass
                    elif avx > 3.2:
                        stats[i]["run"] += 1
                    elif avx < 0.8:
                        stats[i]["idle"] += 1
                    else:
                        stats[i]["dead"] += 1
                else:
                    stats[i]["air"] += 1
                stats[i]["smin"] = min(stats[i]["smin"], bs["stamina"])
                stats[i]["smax"] = max(stats[i]["smax"], bs["stamina"])
                stats[i]["st"] += bs["stamina"] / 20.0 / 60.0  # stamina-seconds-ish
            prev = [dict(g.batsmen[0]), dict(g.batsmen[1])]
        w += 1
    pa.close()
    pb.close()
    # events
    server = 0
    serve_w = [0, 0]
    serve_n = [0, 0]
    rally_sum = 0
    per_agent = [dict(serve_n=0, serve_w=0, recv_n=0, recv_w=0, firsthit_kill=0),
                 dict(serve_n=0, serve_w=0, recv_n=0, recv_w=0, firsthit_kill=0)]
    last_hit_frame = [None, None]
    rally_hits = 0
    first_ret = [dict(n=0, win=0, kinds={}, sp=[], h=[], aced=0, aced_tot=0),
                 dict(n=0, win=0, kinds={}, sp=[], h=[], aced=0, aced_tot=0)]
    pending_serve = None
    first_hit_of_rally = None
    for e in g.events:
        if e["type"] == "serve":
            pending_serve = e["team"]
            first_hit_of_rally = None
        elif e["type"] == "hit":
            rally_hits += 1
            last_hit_frame[e["team"]] = e["frame"]
            if pending_serve is not None and first_hit_of_rally is None:
                first_hit_of_rally = e
        elif e["type"] == "point":
            recv = 1 - pending_serve if pending_serve is not None else None
            if recv is not None:
                fr = first_ret[recv]
                fr["aced_tot"] += 1
                fr["win"] += 1 if e["team"] == recv else 0
                if first_hit_of_rally is not None:
                    fr["n"] += 1
                    fr["kinds"][first_hit_of_rally.get("kind")] = \
                        fr["kinds"].get(first_hit_of_rally.get("kind"), 0) + 1
                    fr["sp"].append(first_hit_of_rally.get("speed"))
                    fr["h"].append(first_hit_of_rally.get("y"))
                else:
                    fr["aced"] += 1
            pending_serve = None
            first_hit_of_rally = None
    for e in g.events:
        if e["type"] == "hit":
            rally_hits += 1
            last_hit_frame[e["team"]] = e["frame"]
        if e["type"] == "point":
            serve_n[server] += 1
            serve_w[e["team"]] += 1 if e["team"] == server else 0
            rally_sum += e.get("rally", 0)
            for who in (0, 1):
                if who == server:
                    per_agent[who]["serve_n"] += 1
                    per_agent[who]["serve_w"] += 1 if e["team"] == who else 0
                else:
                    per_agent[who]["recv_n"] += 1
                    per_agent[who]["recv_w"] += 1 if e["team"] == who else 0
            server = e["team"]
            rally_hits = 0
        elif e["type"] == "hit":
            t = e["team"]
            stats[t]["hits"] += 1
            stats[t]["contact_h"].append(e.get("y"))
            stats[t]["contact_sp"].append(e.get("speed"))
            stats[t]["kinds"][e.get("kind")] = stats[t]["kinds"].get(e.get("kind"), 0) + 1
    return {
        "seed": seed, "seat_a": seat_a,
        "net": g.netHeight, "score": list(g.score),
        "a": g.score[seat_a], "b": g.score[1 - seat_a],
        "winner": g.winner, "frames": g.frame, "longest": g.longestRally,
        "rally_avg": round(rally_sum / max(1, len([e for e in g.events if e["type"] == "point"])), 1),
        "serve_n": serve_n, "serve_w": serve_w, "per_agent": per_agent,
        "first_ret": first_ret, "events": list(g.events),
        "stats": stats, "wall": round(time.time() - t0, 1),
        "maxdt": round(max(pa.mx, pb.mx), 3),
    }


def fmt(r):
    a, b = r["stats"][r["seat_a"]], r["stats"][1 - r["seat_a"]]
    pa, pb = r["per_agent"][r["seat_a"]], r["per_agent"][1 - r["seat_a"]]
    def med(v):
        v = [x for x in v if x is not None]
        return round(sum(v) / len(v), 2) if v else 0.0
    return ("seed=%d seat=%d net=%.2f score A:B=%d:%d rallyavg=%.1f longest=%d | "
            "A hits=%d/%d swings jumps=%d sprintf=%d cH=%.2f cSp=%.1f kinds=%s smin=%.1f srv=%d/%d rcv=%d/%d "
            "reg=%s | "
            "B hits=%d/%d swings jumps=%d sprintf=%d cH=%.2f cSp=%.1f kinds=%s smin=%.1f srv=%d/%d rcv=%d/%d "
            "reg=%s | %.1fs") % (
        r["seed"], r["seat_a"], r["net"], r["a"], r["b"], r["rally_avg"], r["longest"],
        a["hits"], a["swings"], a["jumps"], a["sprint"], med(a["contact_h"]), med(a["contact_sp"]),
        a["kinds"], a["smin"], pa["serve_w"], pa["serve_n"], pa["recv_w"], pa["recv_n"],
        (a["sprint"], a["run"], a["dead"], a["idle"], a["air"]),
        b["hits"], b["swings"], b["jumps"], b["sprint"], med(b["contact_h"]), med(b["contact_sp"]),
        b["kinds"], b["smin"], pb["serve_w"], pb["serve_n"], pb["recv_w"], pb["recv_n"],
        (b["sprint"], b["run"], b["dead"], b["idle"], b["air"]), r["wall"])


if __name__ == "__main__":
    a, b = sys.argv[1], sys.argv[2]
    seeds = [int(x) for x in sys.argv[3:]] or [7001, 7002, 7003]
    agg = [0, 0]
    global RESULTS
    RESULTS = []
    pa_t = dict(serve_n=0, serve_w=0, recv_n=0, recv_w=0)
    pb_t = dict(serve_n=0, serve_w=0, recv_n=0, recv_w=0)
    for s in seeds:
        for seat in (0, 1):
            r = run(a, b, s, seat_a=seat)
            RESULTS.append(r)
            agg[0] += r["a"]
            agg[1] += r["b"]
            for k in pa_t:
                pa_t[k] += r["per_agent"][seat][k]
                pb_t[k] += r["per_agent"][1 - seat][k]
            print(fmt(r))
    print("== TOTAL A:B = %d:%d  (A win rate %.2f)" % (agg[0], agg[1], agg[0] / max(1, sum(agg))))
    print("   A serve %d/%d (%.0f%%) recv %d/%d (%.0f%%) | B serve %d/%d (%.0f%%) recv %d/%d (%.0f%%)" % (
        pa_t["serve_w"], pa_t["serve_n"], 100 * pa_t["serve_w"] / max(1, pa_t["serve_n"]),
        pa_t["recv_w"], pa_t["recv_n"], 100 * pa_t["recv_w"] / max(1, pa_t["recv_n"]),
        pb_t["serve_w"], pb_t["serve_n"], 100 * pb_t["serve_w"] / max(1, pb_t["serve_n"]),
        pb_t["recv_w"], pb_t["recv_n"], 100 * pb_t["recv_w"] / max(1, pb_t["recv_n"])))
    # first-return (serve receive) quality
    fa = dict(n=0, win=0, aced=0, aced_tot=0, kinds={}, sp=[], h=[])
    fb = dict(n=0, win=0, aced=0, aced_tot=0, kinds={}, sp=[], h=[])
    for rr in RESULTS:
        for who, dst in ((rr["seat_a"], fa), (1 - rr["seat_a"], fb)):
            fr = rr["first_ret"][who]
            dst["n"] += fr["n"]
            dst["win"] += fr["win"]
            dst["aced"] += fr["aced"]
            dst["aced_tot"] += fr["aced_tot"]
            for k, v in fr["kinds"].items():
                dst["kinds"][k] = dst["kinds"].get(k, 0) + v
            dst["sp"].extend(fr["sp"])
            dst["h"].extend(fr["h"])
        for who, dst in ((rr["seat_a"], fa), (1 - rr["seat_a"], fb)):
            fr = rr["first_ret"][who]
            dst["n"] += fr["n"]
            dst["win"] += fr["win"]
            dst["aced"] += fr["aced"]
            dst["aced_tot"] += fr["aced_tot"]
            for k, v in fr["kinds"].items():
                dst["kinds"][k] = dst["kinds"].get(k, 0) + v
            dst["sp"].extend(fr["sp"])
            dst["h"].extend(fr["h"])

    def show(tag, d):
        sp = [x for x in d["sp"] if x is not None]
        hh = [x for x in d["h"] if x is not None]
        print("   %s first-return n=%d aced=%d/%d recv-win=%d/%d kinds=%s spd=%.1f h=%.2f" % (
            tag, d["n"], d["aced"], d["aced_tot"], d["win"], d["aced_tot"], d["kinds"],
            sum(sp) / max(1, len(sp)), sum(hh) / max(1, len(hh))))
    show("A", fa)
    show("B", fb)
