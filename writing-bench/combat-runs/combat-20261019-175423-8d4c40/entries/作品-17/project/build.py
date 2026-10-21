#!/usr/bin/env python3
"""将 src/ 下的 JS 源码按序合并进 template.html，产出独立 game.html"""
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
OUT = ROOT / 'game.html'

ORDER = [
    '00-util.js',
    '01-audio.js',
    '02-input.js',
    '03-fx.js',
    '04-rig.js',
    '05-player.js',
    '06-enemies.js',
    '07-game.js',
]

def build():
    template = (SRC / 'template.html').read_text(encoding='utf-8')
    parts = []
    for name in ORDER:
        code = (SRC / name).read_text(encoding='utf-8')
        parts.append(f'/* ===== {name} ===== */\n{code}')
    bundle = '\n\n'.join(parts)
    html = template.replace('//__GAME_CODE__', bundle)
    OUT.write_text(html, encoding='utf-8')
    print(f'built {OUT} ({len(html) / 1024:.1f} KB)')

if __name__ == '__main__':
    build()
