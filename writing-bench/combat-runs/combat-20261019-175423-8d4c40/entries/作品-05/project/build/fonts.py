#!/usr/bin/env python3
"""Rebuild subsetted woff2 fonts from the source tree's used characters."""
import glob, os, sys
from fontTools.subset import main as subset

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chars = set()
for f in glob.glob(os.path.join(root, 'src', '**', '*'), recursive=True):
    if os.path.isfile(f) and f.endswith(('.js', '.html', '.css')):
        chars |= set(open(f, encoding='utf-8').read())
cjk = ''.join(sorted(c for c in chars if ord(c) > 127))
txt = ''.join(chr(c) for c in range(32, 127)) + cjk + '·—✦「」【】…％'
path = '/tmp/subset_chars.txt'
open(path, 'w', encoding='utf-8').write(txt)
for src, out in [('/tmp/fonts/NotoSerifSC.ttf', 'serif.woff2'),
                 ('/tmp/fonts/NotoSansSC.ttf', 'sans.woff2')]:
    if os.path.exists(src):
        subset(['--text-file=' + path, '--flavor=woff2',
                '--output-file=' + os.path.join(root, 'src', 'fonts', out), src])
print('chars:', len(cjk))
