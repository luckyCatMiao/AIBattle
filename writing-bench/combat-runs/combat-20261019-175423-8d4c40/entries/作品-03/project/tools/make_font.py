#!/usr/bin/env python3
"""Subset the bundled Noto Sans SC to every character used by the game sources.

Scans src/*.js, src/*.html and *.md so the offline UI font always covers the
text actually shipped in game.html.
"""
import glob
import os
import re
import sys
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CJK = re.compile(r"[　-〿㐀-䶿一-鿿＀-￯]")

PREAMBLE = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "，。！？：；、「」『』（）《》—…·×÷°▼▲◆●★☆～％＋－"
)


def collect() -> str:
    chars = set(PREAMBLE)
    paths = []
    for pat in ("src/*.js", "src/*.html", "src/*.css", "*.md"):
        paths.extend(glob.glob(os.path.join(ROOT, pat)))
    for path in paths:
        with open(path, "r", encoding="utf-8") as f:
            chars.update(CJK.findall(f.read()))
    return "".join(sorted(chars))


def main():
    text = collect()
    src = os.path.join(ROOT, "fonts", "noto700.ttf")
    out = os.path.join(ROOT, "fonts", "noto-ui.woff2")
    subset.main([
        src,
        "--text=" + text,
        "--flavor=woff2",
        "--output-file=" + out,
        "--layout-features=*",
        "--no-hinting",
        "--desubroutinize",
    ])
    print(out, os.path.getsize(out), "bytes,", len(text), "chars")


if __name__ == "__main__":
    main()
