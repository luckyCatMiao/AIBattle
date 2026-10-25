import os, runpy, sys
# 用法: python -I tools/wrap_agent.py PF_SUPPORT=1 [其它 KEY=VAL ...]
here = os.path.dirname(os.path.abspath(__file__))
for a in sys.argv[1:]:
    if '=' in a:
        k, v = a.split('=', 1)
        os.environ[k] = v
sys.argv = [os.path.join(here, '..', 'agent.py')]
runpy.run_path(sys.argv[0], run_name='__main__')
