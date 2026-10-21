"""Optional font rebuilding. Invoke with python3 -I and explicit tool/source paths."""
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from fontTools import subset
root = Path(__file__).resolve().parent
text = (root/'src/game.js').read_text() + (root/'src/shell.html').read_text() + (root/'src/skills.js').read_text()
chars = ''.join(sorted(set(c for c in text if ord(c) >= 0x2E80)))
options = subset.Options()
options.flavor = 'woff2'
font = subset.load_font(sys.argv[2], options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=chars)
subsetter.subset(font)
subset.save_font(font, str(root/'src/ui-zh.woff2'), options)
print('Embedded UI subset:', len(chars), 'characters')
