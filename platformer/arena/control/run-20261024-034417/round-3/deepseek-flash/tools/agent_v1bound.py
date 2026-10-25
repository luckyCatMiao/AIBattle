import os, runpy
here = os.path.dirname(os.path.abspath(__file__))
runpy.run_path(os.path.join(here, '..', 'agent.py'), run_name='__main__')
