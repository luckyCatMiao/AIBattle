"""Speed controller: curvature speed profile + drift-charge pursuit.

Tuning history: parameter set produced by a parallel (1+1) search over 16 random
tracks (see review.md).  The controller is deliberately simple and closed-loop on
the *velocity* heading so it stays stable inside a 20-frame window.
"""
import math
import os
import sys

_DBG = bool(os.environ.get('DRV_DEBUG'))


def wrap(a):
    while a > math.pi:
        a -= 2.0*math.pi
    while a < -math.pi:
        a += 2.0*math.pi
    return a


V_TABLE = [(3.0, 12.0), (5.0, 15.6), (7.9, 20.2), (10.8, 23.5), (13.6, 27.2),
           (16.3, 28.8), (22.6, 31.8), (28.5, 34.3), (43.2, 41.7), (60.0, 44.0),
           (1e9, 48.0)]


def v_for_radius(R, scale=1.0):
    if R <= 0:
        return 48.0*scale
    prev = V_TABLE[0]
    if R <= prev[0]:
        return prev[1]*scale
    for R2, v2 in V_TABLE[1:]:
        if R <= R2:
            t = (R-prev[0])/(R2-prev[0])
            return (prev[1]+(v2-prev[1])*t)*scale
        prev = (R2, v2)
    return 48.0*scale


class Driver:
    def __init__(self, line, P, checkpoints=None):
        self.line = line
        self.P = P
        self._hint = None
        self.prof = self.build_profile(P)
        self.cp = checkpoints or []
        self.half = getattr(line, 'halfWidth', 3.4)
        # arc position of every checkpoint on the racing line
        self.cp_s = []
        for c in self.cp:
            best, bd = 0, 1e18
            for i in range(line.n):
                dx = line.x[i]-c[0]
                dy = line.y[i]-c[1]
                d = dx*dx+dy*dy
                if d < bd:
                    bd, best = d, i
            self.cp_s.append(line.cum[best] % line.length)

    def build_profile(self, P):
        line = self.line
        n = line.n
        ds = line.length/n
        v = [min(P['vmax'], v_for_radius(1.0/max(line.kappa[i], 1e-6), P['vscale']))
             for i in range(n)]
        dec = P['decel']
        for _ in range(3):
            for i in range(n-1, -1, -1):
                j = (i+1) % n
                lim = math.sqrt(max(0.0, v[j]*v[j] + 2.0*dec*ds))
                if v[i] > lim:
                    v[i] = lim
        return v

    def act(self, car, frame, opp=None):
        line = self.line
        P = self.P
        s, idx, off, tang = line.project(car.x, car.y, hint=self._hint)
        self._hint = idx
        v = math.hypot(car.vx, car.vy)
        L = P['la_base'] + P['la_v']*v
        tx, ty = line.point_at_s(s+L)
        # checkpoint capture guard: never miss a gate (a miss costs a full lap).
        # Predict where the car will cross the gate's arc position assuming the
        # current lateral tracking error persists, and steer at the gate if that
        # prediction falls near or outside the capture radius.
        if self.cp_s:
            k = car.nextCp if 0 <= car.nextCp < len(self.cp_s) else 0
            cps = self.cp_s[k]
            dcp = (cps - s) % line.length
            cx, cy, crad = self.cp[k]
            # lateral tracking error relative to the racing line
            err = off
            icp = line.index_at_s(cps)
            tanx = line.x[(icp+1) % line.n] - line.x[icp]
            tany = line.y[(icp+1) % line.n] - line.y[icp]
            ln = math.hypot(tanx, tany) or 1.0
            pnx, pny = -tany/ln, tanx/ln
            px = line.x[icp] + pnx*err - cx
            py = line.y[icp] + pny*err - cy
            pred = math.hypot(px, py)
            slack = crad - pred                      # >0 means safe
            gd = max(0.001, P.get('cp_guard_dist', 8.0))
            if _DBG:
                sys.stderr.write('cpdbg f=%d k=%d s=%.1f cps=%.1f dcp=%.1f off=%.2f pred=%.2f slack=%.2f\n' % (
                    frame, k, s, cps, dcp, off, pred, slack))
            if dcp < gd or slack < P.get('cp_guard_slack', 0.9):
                w = P.get('cp_guard_w', 0.35)*(1.0 - min(dcp, gd)/gd)
                if slack < 0.9:
                    w = max(w, min(1.0, 0.55 + 2.0*(0.9-slack)))
                if dcp < 30.0:
                    tx = tx*(1.0-w) + cx*w
                    ty = ty*(1.0-w) + cy*w
        # --- traffic: pick a passing lane when catching a slower car ----------
        ease_off = False
        if opp is not None:
            os_, oidx, ooff, otan = line.project(opp[0], opp[1], hint=idx)
            darc = (os_ - s) % line.length
            adv = P.get('av_dist', 17.0)
            if -1.5 < darc < adv:
                nx2, ny2 = -otan[1], otan[0]
                room = self.half - P.get('av_margin', 0.85)
                side = 1.0 if ooff <= 0.0 else -1.0
                target = max(-room, min(room, ooff + side*P.get('av_lat', 2.3)))
                w = 1.0 - max(0.0, darc)/adv
                lane = (target - off)*w
                tx += nx2*lane
                ty += ny2*lane
            # directly behind a slower car with no room: coast instead of hitting it
            if 0.0 < darc < P.get('av_slow_dist', 4.0) and \
                    abs(ooff - off) < P.get('av_slow_lat', 1.2):
                cl = (car.vx-opp[2])*tang[0] + (car.vy-opp[3])*tang[1]
                if cl > 4.0:
                    ease_off = True
        des = math.atan2(ty-car.y, tx-car.x)
        vang = math.atan2(car.vy, car.vx) if v > 0.4 else car.angle
        e = wrap(des-vang)
        slip_t = max(-P['slip_max'], min(P['slip_max'], P['slip_gain']*e))
        head_t = vang + slip_t
        steer = max(-1.0, min(1.0, P['steer_gain']*wrap(head_t-car.angle)))
        slip = wrap(car.angle-vang)
        if abs(steer) < P['weave_on'] and v > P['weave_vmin']:
            ph = (frame // P['weave_half']) % 2
            steer = P['weave_amp'] if ph == 0 else -P['weave_amp']
            drifting = (frame % P['weave_pulse']) != 0
        else:
            drifting = abs(slip) < P['drift_slip'] and v > 5.0 and abs(steer) > 0.16
        i = line.index_at_s(s + P['prof_ahead'])
        vt = min(P['vmax'], self.prof[i])*P['vt_scale']
        throttle = 1.0 if v < vt else -1.0
        if ease_off:
            throttle = 0.0
        boost = (not ease_off) and car.boostEnergy > P['boost_min'] and v < vt + P['boost_slack']
        return throttle, steer, drifting, boost
