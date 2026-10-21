# Continuation series, revision 4

entry.json runs node agent.js, selected c4_kite200.js. Prior submission and review are preserved in continuation_r3.js and review_continuation_r3.md. Read SETUP.md, RULES.md, rules.js and example.json; parsed public_replays.json with scripts, focusing on the two new games. No opponent source or external engine was accessed.

## Official replay diagnosis

Both new games were losses: r3-g1 (Astra east) at 197.05 seconds and r3-g2 (Astra west) at 225.85. The previous reinforcement rule did not solve the tactical disadvantage.

- r3-g1 at 30: our u16 is already at (726,381), while fresh u20 remains at (1061,458). At 40, u16 has 128 HP at (693,409); u20 has 360 HP at (737,351) and is attack-moving to north (665,250). Enemy tanks have 567 combined HP. The support rule disengages once enemies are within 260, so reinforcements still pursue a separate objective during combat.
- r3-g1 at 36: comparing decisions on the actual frame, the new controller orders u16 to withdraw to approximately (739,386); the prior controller issues no move. Waiting until the closest enemy is within 175 ignores how far a tank can advance during the one-second interval between observations.
- r3-g1 at 60: our u22 has 110 HP and u24 has 360, while the opponent has three tanks with 734 total HP. At 70 our u24 has fallen to 80 HP while a new tank is still behind it. We are feeding successive tanks into stronger local groups.
- r3-g2 at 40: our u15 has 96 HP at (667,433), while u19 has 360 HP at (631,471); enemy tanks total 552 HP. By 50 u15 is dead, u19 has 120 HP at (659,468), and u21 is still around (507,487). At 70 u21 has 82 HP and retreats while u23 has 130 HP and pursues u22. Tactical decisions remain poorly synchronized.
- r3-g2 at 24: the new controller withdraws reloading u15 toward (512,424), whereas the old controller issues no move. At 60 we already lead upgrades 2–1 but trail two tanks to four; buying upgrades sooner is not the primary missing fix.

## Changes

Preserve production, protected workers, reachable-target preference, focus fire, ready-shot exception, outpost scouts, and reinforcement support. Expand the reload retreat trigger from 175 to 200 pixels, retaining the 38-pixel movement and cooldown threshold of 0.65 seconds. Also expand the overwhelmed-unit withdrawal trigger from 190 to 200 pixels. This starts evasive action before an approaching enemy reaches firing range during the next observation interval. It does not claim to predict enemy orders.

Shortening retreat moves to 13 or 20 pixels lost all eight fresh games across those variants. Tested staging at home until 30/40/50 seconds, early north scouts, closer support, stricter pursuit selection, earlier numerical retreat, and reload radius/threshold combinations. Most combinations regressed. Files tune_cont4.py and tune_cont4b.py retain the experiments; bench_cont4*.txt retain results. Changes to both distance thresholds in c4_kite200.js are intentional in the selected submission; c4_kite200only.js isolates the reload change for comparison.

## Validation

- Selected fresh-game benchmark: four wins, zero errors. Versus continuation_r3, west/east wins at 278/355 seconds; versus our synthetic public_style_proxy, wins at 300/273 seconds. This proxy is our own existing program, not the real opponent.
- branch_cont4b.txt: twelve 20-second continuations against recorded enemy commands, from 30/45/60/75/130/150 seconds in each latest game. Versus the prior controller, selected score margin improves in five, ties three, and worsens four. East 30→50 improves from -126 to -81, west 30→50 from -97 to -87, west 130→150 from -752 to -719. East 150→170 worsens from -905 to -955. These fixed-order branches are diagnostic only: enemy behavior cannot adapt and spawned IDs can diverge.
- scenarios_cont4.txt: eight full continuations against the local north-pressure proxy at 15/40/65/100 seconds. Selected entry wins 2/8 versus prior entry 1/8, adding recovery from west 40 seconds. Both remain unable to recover most disadvantaged positions. The 190-pixel variant also wins 2/8 but recovers a different state.
- continuation4_tests.txt: 7,310 playing replay observations, both seats across all 18 public games, zero invalid commands and zero budget violations. Mean decision time 0.0228 ms, maximum 32.66 ms. Six complete simulations against local tank, raider and focus/reload controllers: six wins, zero errors.
- continuation4_transport.txt: actual persistent node process handled 7,310 JSON lines, clean stderr and exit 0; mean round trip 0.169 ms, p99 0.331 ms, maximum 16.50 ms including startup. Well within the process deadline.

## Remaining weaknesses and next revision

The strongest unresolved problem is army concentration during contact: reinforcement support stops once any enemy is within 260, even when that enemy is irrelevant to the main battle. Low-HP units and reinforcements still fight separate battles; readiness and splash reservations remain approximate. The opening still concedes north, and worker safety can stall mining once the home mine is exhausted. Broader retreats can surrender ground and delay captures; branch regressions demonstrate this tradeoff. Do not infer real-opponent wins from synthetic benchmarks. Start the next revision with new official results, inspect early reload decisions and support transitions, and retain these files as regression baselines.
