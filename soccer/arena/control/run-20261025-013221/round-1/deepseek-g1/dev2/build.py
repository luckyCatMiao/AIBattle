# -*- coding: utf-8 -*-
"""把 pysim.py + agent_core.py 合成单文件 agent.py（提交产物必须自成一体）。

用法: python dev2/build.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HEAD = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""3V3 足球 · deepseek-v4.1-flash · 正式提交（单文件）。
本文件由 pysim.py（官方 simulation.js 的逐帧精确移植）+ agent_core.py 合并而成。
修改请改源文件后重新运行 dev2/build.py。
"""
'''


def strip_module_header(src):
    """去掉模块级 docstring 与 'import pysim / from pysim import ...'。"""
    lines = src.split('\n')
    out = []
    i = 0
    # 跳过开头的注释/编码行
    while i < len(lines) and (lines[i].startswith('#') or lines[i].strip() == ''):
        i += 1
    # 跳过模块 docstring
    if i < len(lines) and (lines[i].lstrip().startswith('"""') or lines[i].lstrip().startswith("'''")):
        q = lines[i].lstrip()[:3]
        if lines[i].count(q) >= 2 and len(lines[i].strip()) > 3:
            i += 1
        else:
            i += 1
            while i < len(lines) and q not in lines[i]:
                i += 1
            i += 1
    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if s == 'import pysim' or s.startswith('from pysim import') or s == 'import sys' or s == 'import os':
            # 保留 sys/os 在合并文件里无所谓；这里统一去掉，HEAD 后面会补
            if s.startswith('from pysim import'):
                # 多行 import 可能用括号展开
                while i < len(lines) and ')' not in lines[i]:
                    i += 1
            i += 1
            continue
        out.append(ln)
        i += 1
    return '\n'.join(out)


def main():
    pysim_src = open(os.path.join(ROOT, 'pysim.py'), encoding='utf-8').read()
    core_src = open(os.path.join(ROOT, 'agent_core.py'), encoding='utf-8').read()
    a = strip_module_header(pysim_src)
    b = strip_module_header(core_src)
    if 'pysim.' in b:
        b = b.replace('pysim.', '')
    for ln in b.split('\n'):
        if 'pysim' in ln and not ln.lstrip().startswith('#'):
            raise SystemExit('unexpected bare pysim reference: ' + ln)
    body = HEAD + '\nimport sys\nimport json\nimport math\nimport os\n\n' + a + '\n\n\n' + b + '\n'
    dst = os.path.join(ROOT, 'agent.py')
    open(dst, 'w', encoding='utf-8', newline='\n').write(body)
    # 语法检查
    compile(body, dst, 'exec')
    print('wrote %s (%d lines, %d bytes)' % (dst, body.count('\n') + 1, len(body.encode('utf-8'))))


if __name__ == '__main__':
    main()
