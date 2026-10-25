#!/usr/bin/env python3
import os
os.execvp('node', ['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'agent.js')])
