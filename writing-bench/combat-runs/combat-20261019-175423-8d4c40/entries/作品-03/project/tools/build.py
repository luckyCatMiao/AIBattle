#!/usr/bin/env python3
"""Build /workspace/game.html from the multi-file sources in /workspace/src."""
import base64
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
FONTS = os.path.join(ROOT, "fonts")

SCRIPTS = [
    "engine.js",
    "pose.js",
    "player.js",
    "enemies.js",
    "world.js",
    "game.js",
]


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    html = read(os.path.join(SRC, "index.html"))
    css = read(os.path.join(SRC, "style.css"))
    font_path = os.path.join(FONTS, "noto-ui.woff2")
    with open(font_path, "rb") as f:
        font_b64 = base64.b64encode(f.read()).decode("ascii")

    css = css.replace("__FONT__", font_b64)

    js_parts = []
    for name in SCRIPTS:
        body = read(os.path.join(SRC, name))
        js_parts.append("/* ---- " + name + " ---- */\n" + body.strip() + "\n")
    js = "(function(){\n'use strict';\n" + "\n".join(js_parts) + "\n})();\n"

    out = html.replace("/*__STYLE__*/", css).replace("/*__GAME__*/", js)
    # safety: ensure no leftover template markers
    leftovers = re.findall(r"__[A-Z]+__", out)
    if leftovers:
        print("WARNING leftover markers:", leftovers, file=sys.stderr)

    dst = os.path.join(ROOT, "game.html")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(out)

    size = os.path.getsize(dst)
    print("wrote", dst, size, "bytes", "(js", len(js), "chars )")


if __name__ == "__main__":
    main()
