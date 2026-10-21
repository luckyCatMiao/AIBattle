#!/usr/bin/env python3
"""Persistent line protocol; delegate numerical planning to our local JS program."""
import os
from pathlib import Path
os.execvp('node', ['node', str(Path(__file__).with_name('agent.js'))])
