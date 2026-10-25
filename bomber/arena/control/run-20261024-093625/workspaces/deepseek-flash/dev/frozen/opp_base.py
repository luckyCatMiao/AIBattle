import os, sys, runpy
for k in list(os.environ):
    if k.startswith('AG_'): del os.environ[k]
sys.argv=[sys.argv[0]]
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)),'base.py'),run_name='__main__')
