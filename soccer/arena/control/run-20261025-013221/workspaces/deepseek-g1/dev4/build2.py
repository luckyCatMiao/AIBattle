# -*- coding: utf-8 -*-
"""把 pysim.py + core2.py 合成单文件。用法: python dev4/build2.py [输出名]"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'dev2'))
from build import strip_module_header
HEAD = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""3V3 足球 · deepseek-g1 · 正式提交（单文件）。
pysim.py（simulation.js 的逐帧移植）+ core2.py 合并而成。
修改请改源文件后重新运行 dev4/build2.py。
"""
'''
def main():
    dstname = sys.argv[1] if len(sys.argv) > 1 else 'agent.py'
    a = strip_module_header(open(os.path.join(ROOT,'pysim.py'),encoding='utf-8').read())
    b = strip_module_header(open(os.path.join(ROOT,'core2.py'),encoding='utf-8').read())
    if 'pysim.' in b:
        b = b.replace('pysim.', '')
    for ln in b.split('\n'):
        if 'pysim' in ln and not ln.lstrip().startswith('#'):
            raise SystemExit('bare pysim ref: '+ln)
    body = HEAD + '\nimport sys\nimport json\nimport math\nimport os\n\n' + a + '\n\n\n' + b + '\n'
    dst = os.path.join(ROOT, dstname)
    open(dst,'w',encoding='utf-8',newline='\n').write(body)
    compile(body, dst, 'exec')
    print('wrote %s (%d lines)' % (dst, body.count('\n')+1))
if __name__ == '__main__':
    main()
