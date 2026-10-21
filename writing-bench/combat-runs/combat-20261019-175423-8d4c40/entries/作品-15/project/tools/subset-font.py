from pathlib import Path
import sys
sys.path.insert(0, '/tmp/rust-fonttools')
from fontTools import subset
root = Path('/workspace')
text = ''.join(p.read_text() for p in (root/'src').glob('*') if p.suffix in ('.html','.js','.css'))
chars = ''.join(sorted(set(c for c in text if ord(c) > 127)))
options = subset.Options()
options.flavor = 'woff2'
font = subset.load_font('/tmp/rust-font-download/NotoSansCJKsc-Regular.otf',options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=chars)
subsetter.subset(font)
subset.save_font(font,str(root/'assets/FoundryCJK.woff2'),options)
(root/'assets/FONT-LICENSE.txt').write_text(Path('/tmp/rust-font-download/LICENSE').read_text())
print('Subset glyphs:',len(chars),'bytes:',(root/'assets/FoundryCJK.woff2').stat().st_size)
