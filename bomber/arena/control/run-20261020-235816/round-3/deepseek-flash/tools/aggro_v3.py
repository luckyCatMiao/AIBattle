import importlib.util, os
_spec = importlib.util.spec_from_file_location(
    'agent_v3_base', os.path.join(os.path.dirname(__file__), 'agent_v3.py'))
_m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m)


class Agent(_m.Agent):
    def __init__(self):
        super().__init__(always_aggro=True, hunt_start=0.0)
