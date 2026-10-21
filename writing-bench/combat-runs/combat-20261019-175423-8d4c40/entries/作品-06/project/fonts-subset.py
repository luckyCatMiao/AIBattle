#!/usr/bin/env python3
"""
Subset the Noto Sans/Serif SC variable fonts down to the glyphs this game uses
and emit base64 @font-face blocks. Keeps game.html fully offline with correct
Chinese text on any machine, without a 40 MB font payload.
"""
import base64, io, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
FONTS = os.path.join(ROOT, 'fonts')
OUT = os.path.join(ROOT, 'build', 'fonts.css')

sys.path.insert(0, '/tmp/pylibs')
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

def collect_chars():
    chars = set()
    # everything a player might ever need: latin, digits, punctuation, CJK in sources
    for base in ('src',):
        for dirpath, _, names in os.walk(os.path.join(ROOT, base)):
            for n in names:
                if n.endswith(('.js', '.html', '.css', '.md')):
                    with open(os.path.join(dirpath, n), encoding='utf-8') as f:
                        chars.update(f.read())
    return chars

def build(font_path, family, weight_axis, chars, keep_all_ascii=True):
    f = TTFont(font_path)
    opts = Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables += ['DSIG']
    opts.no_subset_tables += ['FFTM']
    # variable font: keep only the weight axis, pin nothing (browsers interpolate)
    if 'fvar' in f:
        axes = {a.axisTag: a for a in f['fvar'].axes}
        if weight_axis in axes:
            for tag in list(axes):
                if tag != weight_axis:
                    opts.layout_features = opts.layout_features
    ss = Subsetter(options=opts)
    unicodes = {ord(c) for c in chars}
    if keep_all_ascii:
        unicodes |= set(range(0x20, 0x7f))
    unicodes |= set(range(0x3000, 0x3040))  # CJK punctuation
    unicodes |= set(range(0xff01, 0xff61))  # fullwidth forms
    unicodes |= {0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026, 0x00b7}
    ss.populate(unicodes=unicodes)
    ss.subset(f)
    buf = io.BytesIO()
    f.save(buf)
    data = buf.getvalue()
    b64 = base64.b64encode(data).decode('ascii')
    return b64, len(data)

def main():
    chars = collect_chars()
    cjk = [c for c in chars if ord(c) > 0x2e80]
    print(f'collected {len(chars)} chars, {len(cjk)} CJK')
    css = []
    for fname, family, weight in [
        ('NotoSansSC.ttf', 'RB Sans', 'wght'),
        ('NotoSerifSC.ttf', 'RB Serif', 'wght'),
    ]:
        b64, size = build(os.path.join(FONTS, fname), family, weight, chars)
        print(f'  {family}: {size/1024:.0f} KB')
        css.append(
            "@font-face{font-family:'%s';src:url(data:font/woff2;base64,%s) format('woff2');"
            "font-weight:100 900;font-display:block;font-style:normal}"
            % (family, b64)
        )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(css) + '\n')
    print('wrote', OUT, f'{os.path.getsize(OUT)/1024:.0f} KB')

if __name__ == '__main__':
    main()
