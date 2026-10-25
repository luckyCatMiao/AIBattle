import subprocess, json, sys, time
def one(seed,n,ia,ib,va='-',vb='-',swap=0):
    out=subprocess.run(['node','/workspace/work/r3/run_match.js',str(seed),str(n),ia,ib,va,vb,'400',str(swap)],
                       capture_output=True,text=True,timeout=600)
    line=out.stdout.strip().split('\n')[-1]
    try: return json.loads(line)
    except Exception as e: return {'error':line[:300]}
def main():
    import argparse
    ap=argparse.ArgumentParser()
    ap.add_argument('--variants',default='-')  # comma list for A
    ap.add_argument('--opp',default='agent')
    ap.add_argument('--oppvar',default='-')
    ap.add_argument('--ns',default='1,2,3,4,5,6')
    ap.add_argument('--seeds',default='1,2')
    a=ap.parse_args()
    ns=[int(x) for x in a.ns.split(',')]
    seeds=[int(x) for x in a.seeds.split(',')]
    for va in a.variants.split('|'):
        print('### variant',va,'vs',a.opp)
        tot=0;gf=0;ga=0
        for n in ns:
            for seed in seeds:
              for swap in (0,1):
                d=one(seed,n,'agent',a.opp,va,a.oppvar,swap)
                if 'error' in d: print('  ERR',n,seed,d['error'][:150]); continue
                gf+=d['A']['score'];ga+=d['B']['score'];tot+=1
                extra = ''
                for tag in ('stderrA', 'stderrB'):
                    v = (d.get(tag) or '').strip()
                    if v:
                        extra += ' | %s=%s' % (tag, v.replace(chr(10), ' / ')[:160])
                print(f'  n={n} seed={seed} ko={seed%2} swap={swap} A {d["A"]["score"]}:{d["B"]["score"]} | A kicks {d["A"]["kicks"]} shots {d["A"]["shots"]} saves {d["A"]["saves"]} fouls {d["A"]["fouls"]} | B kicks {d["B"]["kicks"]} shots {d["B"]["shots"]} saves {d["B"]["saves"]} fouls {d["B"]["fouls"]}{extra}')
        print(f'### TOTAL variant {va}: games {tot} GF {gf} GA {ga}')
main()
