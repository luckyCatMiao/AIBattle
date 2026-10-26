#!/usr/bin/env python3
"""Run work/simtest.py against a chosen policy module (for A/B)."""
import importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)
path = sys.argv[1]
del sys.argv[1]

spec = importlib.util.spec_from_file_location('policy2', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
sys.modules['policy2'] = mod

sys.path.insert(0, HERE)
import simtest  # noqa: E402

simtest.main()
