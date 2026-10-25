import json, os
_HERE = os.path.dirname(os.path.abspath(__file__))
def get_meta():
    with open(os.path.join(_HERE, 'meta.json')) as f:
        return json.load(f)
