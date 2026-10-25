#!/usr/bin/env python3
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.execvp('node', ['node', 'agent.js'])
