# Continuation series, revision 5 (final)

Submission: entry.json runs `node agent.js` as a persistent JSON-lines process. This continues our own revision-4 strategy, archived as continuation_r4.js; its review is preserved in review_continuation_r4.md. Read SETUP.md, RULES.md, rules.js and example.json, and analyzed the 20 public replay records with scripts. No external engines, private opponent source, or network resources were used.

## Concrete replay lessons

Both latest official games were losses: r4-g1 (Astra east) at 252.10 seconds, and r4-g2 (Astra west) at 186.40 seconds. The wider reload retreat from revision 4 did not cure bad pursuit decisions.

- r4-g2, 40 seconds: u15 has 128 HP at approximately (561,368). We explicitly order it to attack u20 at (762,495), about 238 pixels away, although tank-versus-tank firing reach is 174 pixels. u20 is retreating. Our damaged tank spends time chasing instead of firing and separates from support. At 46 seconds u15 has 61 HP at (661,411); it is dead by 48 seconds.
- r4-g2, 44 seconds: u19 is at (637,433), u16 at (838,390), and u20 at (803,499). Our controller switches both u19 and u15 to u20, extending their chase. At 50 seconds u19 has only 72 HP at (655,436), while reinforcement u21 is still at (492,451). The new controller uses attack-move toward the shared objective for both tanks at this frame instead of issuing these out-of-range focus locks.
- r4-g1, 50 seconds: u20 is at (750,301), while u22 is at (804,438). By 60 seconds u20 has only 34 HP at (773,284), separated from u22 and u24 around y=430–438. The north objective and long individual pursuit locks can pull tanks into different battles. This remains a formation weakness, but experiments show forced support moves are not an unqualified fix.
- r4-g1, 100 seconds: we finally own north and southeast, but by 150 seconds we have only one tank with 136 HP versus five enemy tanks. Capturing ground cannot compensate for repeated unfavorable exchanges.

## Selected change and strategy

Explicit focus-fire selection now considers enemy units only within current firing reach (`distance <= range + target radius`), replacing the previous extra 65-pixel pursuit allowance. When no unit qualifies, attack-move retains automatic nearby engagement and moves toward the shared objective. This is not a promise never to pursue: the simulation's attack-move still approaches nearby enemies. Base targeting retains its separate approach allowance.

Preserve tank production, four early workers, upgrades, threatened-worker withdrawal, capture scouts, reinforcement support outside combat, 200-pixel reload retreat, focus reservations, and repair. The change addresses a specific observed failure without replacing the tested economic policy.

Rejected alternatives include forcing nearby combat support at 110/160/210 pixels, health-based retreats, ally-distance target weighting, early north scouts, and holding outside firing range. Some won local matchups but were inconsistent on recorded positions. In particular, adding one early north scout to the selected change won four fresh tests but worsened several real-opening branches: r4-g2 from time 0 to 30 changed score margin from +10 with the selected change to -79 with the scout. The selected version also beat that scout variant in both seats. Avoid promoting an opening solely on synthetic-opponent results.

## Tests and evidence

- `continuation5_tests.txt`: 8,190 playing observations across both seats of all 20 public records; zero invalid commands and zero command-budget violations. Mean decision time 0.0183 ms, maximum 17.79 ms. Six complete simulations against local tank, raider, and focus/reload policies: six wins, zero errors.
- `continuation5_transport.txt`: the actual persistent process handled all 8,190 JSON lines, exit 0, empty stderr. Mean round trip 0.152 ms, p99 0.273 ms, maximum 15.93 ms including startup, comfortably inside the response deadline.
- `continuation5_finalbench.txt`: four wins, zero errors. Versus revision 4: west win at 220 seconds, east at 323. Versus our public-style proxy: west at 336, east at 185. The proxy is our own code, not the opponent's implementation.
- `robust_cont5.txt`: selected policy wins 8/10 additional games against our revisions 2 and 3 and three shortlisted new variants. These deterministic local games are correlated; they are not independent estimates of win probability.
- `branch_cont5.txt`: twelve 20-second branches starting at 30/45/60/75/130/150 seconds in each latest official game. Selected policy improves score margin in 10/12 versus revision 4. East 60→80 improves -49 to +22; west 30→50 improves -100 to +27; west 60→80 improves -167 to -34. Regressions are east 45→65 (+7 to -20) and west 150→170 (-1267 to -1351).
- `scenarios_cont5.txt`: eight full continuations from actual frames at 15/40/65/100 seconds against our adaptive local proxy. Selected policy wins 7/8 versus revision 4's 4/8. Both lose the west 100-second position.
- `opening_cont5.txt`: ten 30-second recorded-order branches from 0/5/10/15/20 seconds. Selected policy improves score margin in 8/10 versus revision 4. Fixed-order replay branches are diagnostic only: the enemy cannot adapt, and later production may change unit IDs.

## Remaining weaknesses and preserved notes

No claim of beating the actual opponent follows from these tests; the official revision-5 games have not run. The opening usually concedes north. Attack-move can still chase, low-health units may remain exposed, and local retreat does not coordinate a whole army. Formation support stops once enemies are nearby. Worker retreat can stall mining, and readiness/splash reservations are approximate. Late losing positions often remain unrecoverable.

Useful files: continuation_r4.js and review_continuation_r4.md are the prior baseline; tune_cont5.py, c5_*.js, bench_cont5*.txt, robust_cont5.js/.txt, replay_open5.js, opening_cont5.txt, branch_cont5.txt, and scenarios_cont5.txt preserve experiments. c5_pursuit0.js is the selected candidate before adding explanatory comments and making the range boundary inclusive; final fresh-game outcomes were rechecked after that edit. Start any future revision from new official exchanges and investigate collective retreat or pursuit prediction, rather than assuming extra capture pressure fixes combat losses.
