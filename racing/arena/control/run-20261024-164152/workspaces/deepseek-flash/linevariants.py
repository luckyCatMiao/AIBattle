import math
from planner import Line, signed_curvature

class BlendLine(Line):
    """wide=0 -> laplacian short line; wide=1 -> outward minimum-curvature line."""
    def __init__(self, track, wide=0.5, margin=1.0):
        super().__init__(track, margin=margin)
        pts = [(p[0], p[1]) for p in track.points]
        # resample centreline at 1.0 (same as parent does internally)
        n0=len(pts); cum0=[0.0]
        for i in range(n0):
            a,b=pts[i],pts[(i+1)%n0]; cum0.append(cum0[-1]+math.hypot(b[0]-a[0],b[1]-a[1]))
        total=cum0[-1]; m=int(round(total)); P=[]; j=0
        for k in range(m):
            s=total*k/m
            while j+1<len(cum0)-1 and cum0[j+1]<s: j+=1
            a,b=pts[j],pts[(j+1)%n0]; seg=cum0[j+1]-cum0[j] or 1.0; t=(s-cum0[j])/seg
            P.append((a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t))
        n=len(P)
        N=[]
        for i in range(n):
            ax=P[(i+1)%n][0]-P[(i-1)%n][0]; ay=P[(i+1)%n][1]-P[(i-1)%n][1]
            l=math.hypot(ax,ay) or 1.0; N.append((-ay/l,ax/l))
        kc=signed_curvature(P,3)
        lim=track.halfWidth-margin
        dw=[0.0]*n
        for i in range(n):
            k=kc[i]
            if abs(k)>0.004:
                dw[i]=-math.copysign(lim*min(1.0,abs(k)/0.06),k)
        for _ in range(40):
            dw=[(dw[(i-2)%n]+dw[(i-1)%n]+2*dw[i]+dw[(i+1)%n]+dw[(i+2)%n])/6 for i in range(n)]
            for i in range(n): dw[i]=max(-lim,min(lim,dw[i]))
        # parent's line is sampled at 1.0 too; blend offsets (parent d is per its own n)
        assert self.n == n, (self.n, n)
        d=[(1-wide)*self.d[i] + wide*dw[i] for i in range(n)]
        for i in range(n): d[i]=max(-lim,min(lim,d[i]))
        for _ in range(15):
            d=[(d[(i-1)%n]+2*d[i]+d[(i+1)%n])/4 for i in range(n)]
            for i in range(n): d[i]=max(-lim,min(lim,d[i]))
        qx=[P[i][0]+d[i]*N[i][0] for i in range(n)]
        qy=[P[i][1]+d[i]*N[i][1] for i in range(n)]
        self.x,self.y,self.d=qx,qy,d
        cum=[0.0]
        for i in range(1,n+1):
            a,b=(qx[i-1],qy[i-1]),(qx[i%n],qy[i%n]); cum.append(cum[-1]+math.hypot(b[0]-a[0],b[1]-a[1]))
        self.cum=cum; self.length=cum[-1]
        k=signed_curvature(list(zip(qx,qy)),2)
        self.kappa=[abs(v) for v in k]
        w=2
        self.kappa=[sum(self.kappa[(i+t)%n] for t in range(-w,w+1))/(2*w+1) for i in range(n)]


class HairpinLine(Line):
    """Laplacian short line, pushed outward where its own curvature is high."""
    def __init__(self, track, k0=0.12, k1=0.26, margin=1.0):
        super().__init__(track, margin=margin)
        wide = BlendLine(track, wide=1.0, margin=margin)
        assert wide.n == self.n
        n = self.n
        lim = track.halfWidth - margin
        d = [0.0] * n
        for i in range(n):
            k = self.kappa[i]
            w = 0.0 if k <= k0 else min(1.0, (k - k0) / max(1e-6, k1 - k0))
            d[i] = (1 - w) * self.d[i] + w * wide.d[i]
        for _ in range(20):
            d = [(d[(i - 1) % n] + 2 * d[i] + d[(i + 1) % n]) / 4 for i in range(n)]
            for i in range(n):
                d[i] = max(-lim, min(lim, d[i]))
        # recompute positions from the resampled centreline used by Line: reuse wide's frame
        # wide.x/y are P + wide.d*N; recover P,N from two known lines
        P = []
        N = []
        for i in range(n):
            # blend of base and wide positions is valid because both share P,N
            px = (self.x[i] - self.d[i] * 0)  # placeholder
        # simpler: positions = P + d*N where P,N recovered from wide and base
        for i in range(n):
            if abs(wide.d[i] - self.d[i]) > 1e-9:
                nx = (wide.x[i] - self.x[i]) / (wide.d[i] - self.d[i])
                ny = (wide.y[i] - self.y[i]) / (wide.d[i] - self.d[i])
            else:
                nx, ny = 0.0, 0.0
            P.append((self.x[i] - self.d[i] * nx, self.y[i] - self.d[i] * ny))
            N.append((nx, ny))
        qx = [P[i][0] + d[i] * N[i][0] for i in range(n)]
        qy = [P[i][1] + d[i] * N[i][1] for i in range(n)]
        self.x, self.y, self.d = qx, qy, d
        cum = [0.0]
        for i in range(1, n + 1):
            a, b = (qx[i - 1], qy[i - 1]), (qx[i % n], qy[i % n])
            cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        self.cum = cum
        self.length = cum[-1]
        k = signed_curvature(list(zip(qx, qy)), 2)
        self.kappa = [abs(v) for v in k]
        w = 2
        self.kappa = [sum(self.kappa[(i + t) % n] for t in range(-w, w + 1)) / (2 * w + 1) for i in range(n)]
