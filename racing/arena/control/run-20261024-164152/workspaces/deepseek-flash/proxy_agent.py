"""Proxy opponent at roughly Sol's measured pace (used only for local head-to-head tests)."""
import sys, os
sys.dont_write_bytecode = True
import agent

SCALE = float(os.environ.get('PROXY_SCALE', '0.80'))
agent.PARAMS.update({'av_dist': 0.0, 'vt_scale': agent.PARAMS['vt_scale']*SCALE,
                     'vmax': agent.PARAMS['vmax']*SCALE,
                     'cp_guard_dist': 8.0})
if __name__ == '__main__':
    agent.main()
