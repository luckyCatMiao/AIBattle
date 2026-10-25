#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Insert generated markdown tables into review_template.md and write review.md."""
import os
import re

HERE = os.path.dirname(__file__)
WS = os.path.abspath(os.path.join(HERE, '..', '..'))
tables = open(os.path.join(HERE, 'tables.md'), encoding='utf-8').read()
parts = re.split(r'^### ([A-E])\. ', tables, flags=re.M)
sections = {}
for i in range(1, len(parts), 2):
    key = parts[i]
    body = parts[i + 1].lstrip('\n')
    if key in ('A', 'B'):
        sections[key] = '#### ' + key + '. ' + body.strip()
    else:
        # C/D/E already have numbered section headings in the template.
        title = {'C': '### 6.1 我方进球日志（17 球）',
                 'D': '### 6.2 对方进球日志（32 球）',
                 'E': '### 6.3 犯规分布'}[key]
        body_lines = body.splitlines()
        sections[key] = title + '\n\n' + '\n'.join(body_lines[1:]).strip()

template = open(os.path.join(HERE, 'review_template.md'), encoding='utf-8').read()
for key in ('A', 'B', 'C', 'D', 'E'):
    template = template.replace('{{TABLE_' + key + '}}', sections[key])
out = os.path.join(WS, 'review.md')
open(out, 'w', encoding='utf-8').write(template)
print('wrote', out, len(template), 'chars')
