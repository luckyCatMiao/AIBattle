from pathlib import Path
source = Path('round2_start.py').read_text(encoding='utf-8')
# Compare stamina-aware shot costs and a stricter minimum contact margin.
for name, text in {
    'round2_economy': source.replace("score -= (p0['stamina'] - p['stamina']) * .14", "score -= (p0['stamina'] - p['stamina']) * (.14 + .30 * max(0, 65 - p0['stamina']) / 65)"),
    'round2_margin2': source.replace('margin * 3 - frame * .045', 'margin * 8 - frame * .045'),
    'round2_dense2': source.replace('(2, 4, 6)):', '(2, 3, 4, 5, 6)):'),
}.items():
    Path(name + '.py').write_text(text, encoding='utf-8')
