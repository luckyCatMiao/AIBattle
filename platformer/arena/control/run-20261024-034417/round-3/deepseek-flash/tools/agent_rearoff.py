import os, runpy
os.environ['PF_REAR'] = '0'
here = os.path.dirname(os.path.abspath(__file__))
runpy.run_path(os.path.join(here, '..', 'agent.py'), run_name='__main__')
