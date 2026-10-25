#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""永远中立的陪练（用于单人回放/日志）。"""
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    print(json.dumps({"inputs": [[{"move": 0, "jump": False}] for _ in range(5)]}), flush=True)
