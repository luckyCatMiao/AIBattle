"""Racing line (fold-guarded) + curvature + speed profile."""
import math


def wrap(a):
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a


def signed_curvature(pts, step=3):
    n = len(pts)
    out = [0.0] * n
    for i in range(n):
        a = pts[(i - step) % n]
        b = pts[i]
        c = pts[(i + step) % n]
        abx, aby = b[0] - a[0], b[1] - a[1]
        bcx, bcy = c[0] - b[0], c[1] - b[1]
        cross = abx * bcy - aby * bcx
        la = math.hypot(abx, aby)
        lb = math.hypot(bcx, bcy)
        lc = math.hypot(c[0] - a[0], c[1] - a[1])
        out[i] = 2 * cross / (la * lb * lc + 1e-9)
    return out


class Line:
    def __init__(self, track, margin=1.0, lam=0.3, iters=300, resample=1.0):
        pts = [(p[0], p[1]) for p in track.points]
        n0 = len(pts)
        # dense resample of the centreline at ~resample spacing
        cum0 = [0.0]
        for i in range(n0):
            a, b = pts[i], pts[(i + 1) % n0]
            cum0.append(cum0[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        total0 = cum0[-1]
        m = max(32, int(round(total0 / resample)))
        P = []
        j = 0
        for k in range(m):
            s = total0 * k / m
            while j + 1 < len(cum0) - 1 and cum0[j + 1] < s:
                j += 1
            a, b = pts[j], pts[(j + 1) % n0]
            seg = cum0[j + 1] - cum0[j] or 1.0
            t = (s - cum0[j]) / seg
            P.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        n = len(P)
        self.track = track
        # normals and centreline curvature
        N = []
        for i in range(n):
            ax = P[(i + 1) % n][0] - P[(i - 1) % n][0]
            ay = P[(i + 1) % n][1] - P[(i - 1) % n][1]
            l = math.hypot(ax, ay) or 1.0
            N.append((-ay / l, ax / l))
        kc = signed_curvature(P, max(1, int(round(2.0 / resample))))
        lim = max(0.2, track.halfWidth - margin)
        lo = [-lim] * n
        hi = [lim] * n
        for i in range(n):
            if kc[i] > 1e-4:
                # turning toward +N; inward offset limited to 0.7*R
                hi[i] = min(lim, 0.7 / kc[i])
            elif kc[i] < -1e-4:
                lo[i] = max(-lim, 0.7 / kc[i])
        d = [0.0] * n
        qx = [P[i][0] for i in range(n)]
        qy = [P[i][1] for i in range(n)]
        for _ in range(iters):
            for i in range(n):
                jn = (i - 1) % n
                kn = (i + 1) % n
                tx = qx[i] + lam * ((qx[jn] + qx[kn]) * 0.5 - qx[i])
                ty = qy[i] + lam * ((qy[jn] + qy[kn]) * 0.5 - qy[i])
                dd = (tx - P[i][0]) * N[i][0] + (ty - P[i][1]) * N[i][1]
                if dd > hi[i]:
                    dd = hi[i]
                if dd < lo[i]:
                    dd = lo[i]
                d[i] = dd
                qx[i] = P[i][0] + dd * N[i][0]
                qy[i] = P[i][1] + dd * N[i][1]
        # light smoothing of the offsets to avoid kinks
        for _ in range(20):
            d = [(d[(i - 1) % n] + 2 * d[i] + d[(i + 1) % n]) / 4 for i in range(n)]
            for i in range(n):
                d[i] = min(hi[i], max(lo[i], d[i]))
        for i in range(n):
            qx[i] = P[i][0] + d[i] * N[i][0]
            qy[i] = P[i][1] + d[i] * N[i][1]
        self.x, self.y, self.d = qx, qy, d
        cum = [0.0]
        for i in range(1, n + 1):
            a, b = (qx[i - 1], qy[i - 1]), (qx[i % n], qy[i % n])
            cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        self.cum = cum
        self.length = cum[-1]
        self.n = n
        k = signed_curvature(list(zip(qx, qy)), max(1, int(round(2.0 / resample))))
        self.kappa = [abs(v) for v in k]
        # smooth curvature
        w = 2
        self.kappa = [sum(self.kappa[(i + t) % n] for t in range(-w, w + 1)) / (2 * w + 1) for i in range(n)]

    def nearest_index(self, x, y, hint=None):
        n = self.n
        if hint is None:
            rng = range(n)
        else:
            rng = [((hint + k) % n) for k in range(-25, 26)]
        best, bd = 0, 1e18
        for i in rng:
            dx, dy = self.x[i] - x, self.y[i] - y
            dd = dx * dx + dy * dy
            if dd < bd:
                bd, best = dd, i
        return best

    def project(self, x, y, hint=None):
        n = self.n
        best_s, best_d2, best_i = 0.0, 1e18, 0
        rng = range(n) if hint is None else [((hint + k) % n) for k in range(-25, 26)]
        for i in rng:
            ax, ay = self.x[i], self.y[i]
            bx, by = self.x[(i + 1) % n], self.y[(i + 1) % n]
            vx, vy = bx - ax, by - ay
            l2 = vx * vx + vy * vy or 1.0
            t = ((x - ax) * vx + (y - ay) * vy) / l2
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            px, py = ax + vx * t, ay + vy * t
            d2 = (x - px) ** 2 + (y - py) ** 2
            if d2 < best_d2:
                best_d2 = d2
                best_i = i
                best_s = self.cum[i] + t * math.sqrt(l2)
        i = best_i
        ax, ay = self.x[i], self.y[i]
        bx, by = self.x[(i + 1) % n], self.y[(i + 1) % n]
        vx, vy = bx - ax, by - ay
        l = math.hypot(vx, vy) or 1.0
        tang = (vx / l, vy / l)
        nx, ny = -tang[1], tang[0]
        off = (x - ax) * nx + (y - ay) * ny
        return best_s % self.length, best_i, off, tang

    def point_at_s(self, s):
        s %= self.length
        lo, hi = 0, self.n
        while lo + 1 < hi:
            mid = (lo + hi) >> 1
            if self.cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        i = lo
        seg = self.cum[i + 1] - self.cum[i] or 1.0
        t = (s - self.cum[i]) / seg
        a = (self.x[i], self.y[i])
        b = (self.x[(i + 1) % self.n], self.y[(i + 1) % self.n])
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def index_at_s(self, s):
        s %= self.length
        lo, hi = 0, self.n
        while lo + 1 < hi:
            mid = (lo + hi) >> 1
            if self.cum[mid] <= s:
                lo = mid
            else:
                hi = mid
        return lo

    def kappa_at_s(self, s):
        i = self.index_at_s(s)
        seg = self.cum[i + 1] - self.cum[i] or 1.0
        t = (s - self.cum[i]) / seg
        return self.kappa[i] * (1 - t) + self.kappa[(i + 1) % self.n] * t

    def max_kappa_between(self, s0, s1, step=0.8):
        s = s0
        m = 0.0
        while s < s1:
            v = self.kappa_at_s(s)
            if v > m:
                m = v
            s += step
        return m
