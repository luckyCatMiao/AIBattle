import os, sys, runpy
for k in list(os.environ):
    if k.startswith('AG_'): del os.environ[k]
os.environ['AG_NOLEAK']='0'
sys.argv=[sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)),'v11.py'),run_name='__main__')
