import sys
sys.path.insert(0,'/workspace')
import policy, soccer_test as T

def run_set(params, label):
    rows=[]
    for name,opp in [('Simple',T.SimpleBot()),('Motion',T.MotionBot()),
                     ('Park',T.ParkBot()),('Kick',T.KickBot())]:
        for seat in (0,1):
            a=policy.Agent(params)
            s,_,_ = T.run_match(a,opp) if seat==0 else T.run_match(opp,a)
            ours,theirs=(s[0],s[1]) if seat==0 else (s[1],s[0])
            rows.append(('%s/%d'%(name,seat),ours,theirs))
    a,b=policy.Agent(params),policy.Agent(params)
    s,_,_=T.run_match(a,b); rows.append(('self',s[0],s[1]))
    w=sum(1 for _,o,t in rows if o>t); d=sum(1 for _,o,t in rows if o==t)
    l=sum(1 for _,o,t in rows if o<t)
    print('%-26s %dW%dD%dL  %d:%d  %s' % (label,w,d,l,
          sum(r[1] for r in rows),sum(r[2] for r in rows),
          ' '.join('%s:%d-%d'%r for r in rows)))
    return rows

if __name__=='__main__':
    for kd in (2.6, 4.0, 5.5, 7.0):
        run_set(dict(keeper_depth=kd), 'keeper_depth=%s'%kd)
