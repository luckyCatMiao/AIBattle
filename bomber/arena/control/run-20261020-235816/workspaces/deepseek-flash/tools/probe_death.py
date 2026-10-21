import sys, json
sys.path.insert(0,'/workspace')
import engine
from tools.bench import make_obs, load_agent

def run(Apath,Bpath,seed,target_round,target_fr):
    A=load_agent(Apath); B=load_agent(Bpath)
    g=engine.Game(['A','B'],seed=seed); a=A(); b=B()
    for wi in range(2000):
        if g.status!='playing': break
        if g.round>target_round: break
        ws=[]; obs=[]
        for o in range(2):
            bot=a if o==0 else b
            oo=make_obs(g,o); obs.append(oo)
            w=bot.decide(oo); ins=w.get('inputs') or []
            norm=[{'dir':'N','btn':None}]*20
            for i in range(min(20,len(ins))): norm[i]=ins[i]
            ws.append(norm)
        if g.round==target_round and target_fr-20 <= g.roundFrames <= target_fr+20:
            o=obs[1]
            print('=== w',wi,'fr',g.roundFrames,'Bpos',(g.fighters[1].x,g.fighters[1].y),
                  'note',b.info.get('note'),'alive',g.fighters[1].alive)
            print('bombs',[(x['owner'],x['x'],x['y'],x['fuse'],x['blast']) for x in o['bombs']])
            print('blasts',[(x['x'],x['y'],x['frames']) for x in o['blasts']])
            print('inputs',[u['dir']+('B' if u['btn'] else '') for u in ws[1]])
            bx,by=g.fighters[1].x,g.fighters[1].y
            for y in range(max(0,by-3),min(17,by+4)):
                row=''
                for x in range(max(0,bx-4),min(19,bx+5)):
                    t=g.tiles[y*19+x]
                    row+=('B' if (x,y)==(bx,by) else 'E' if (x,y)==(g.fighters[0].x,g.fighters[0].y)
                          else '#' if t==1 else '%' if t==2 else '.')
                print('%2d '%y+row)
        g.advance_window(ws)
        if g.roundLog: break

if __name__=='__main__':
    run(sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5]))
