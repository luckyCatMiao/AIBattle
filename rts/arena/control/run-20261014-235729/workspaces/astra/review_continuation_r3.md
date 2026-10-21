# Continuation series, revision 3

Submission: entry.json runs node agent.js. Selected c3_support.js. Previous submitted controller and notes are preserved in continuation_r2.js and review_continuation_r2.md. Read SETUP.md, RULES.md, rules.js, example.json; summarized all 16 public games programmatically and inspected latest tank states. No external engines or private opponent source used.

## Public replay lessons

Latest official results: r2-g1, Astra east, won at 229.35 seconds; r2-g2, Astra west, lost at 276.85. Previous fixes helped, but the west opening still gives the opponent north and its home point at 20 seconds. We have only our home point. At 60 seconds in the west game we actually lead upgrades 2–1, so upgrade delay is no longer the primary explanation for that loss.

Concrete reinforcement and pursuit failures in r2-g2:
- At 55 seconds, u19 is at (520,419), 72 HP, and u21 at (587,478), 312 HP. Both target u22 near (664,322). Meanwhile fresh u23 at (297,457) has an attackMove objective (741,545), southeast of the actual fight. The objective selector sends reinforcements toward a different point rather than toward surviving tanks.
- At 60 seconds, u19 has 24 HP at (545,440), ready to shoot but attack-moving toward (741,465); u21 at (628,442) continues attacking u22. u23 is still at (479,493). At 65 u19 is gone, u21 has only 72 HP, and u23 remains full HP at (632,477). By 75 the two older tanks and u23 are gone. The army trades in separate waves instead of bringing reinforcement HP into the fight promptly.
- At 80 seconds, u25 is alone at (600,301), 192 HP, while u27 at (337,407) travels north. The enemy has three tanks to our two. At 140 we are down to one tank versus three, despite having mined 2180 versus 2100. This supports a tactical concentration diagnosis rather than a simple economic one.

The winning r2-g1 cautions against wholesale changes: at 80 seconds our east army has four tanks versus two, and at 180 all four workers survive while the opponent has no units. Preserve worker protection, reachable-target preference, and ready-fire handling from revision 2.

## Submitted change and retained strategy

When a tank has no enemy combat unit within 260 and has no capture mission, find the nearest friendly tank that is closer to the enemy base. If separated by more than 120 pixels, move toward that tank rather than the independently selected outpost. Existing formation offsets and attackMove behavior remain active, and combat micro takes priority as soon as an enemy is close. This is a lightweight reinforcement support rule; it does not guarantee a unified formation.

Retain tank-first production, fourth worker, damage upgrades, protected mining, base repair, inexpensive scout captures, focus fire, reload withdrawal, and superiority-based assaults. Tried alternate reload thresholds/ranges, north opening/rally, target-distance weighting, pursuit holds, support distances, and combinations. Retain only support: combinations did not consistently improve it.

## Tests and evidence

- bench_cont3.txt: selected support controller won both seats versus continuation_r2.js (248/263 seconds) and both seats versus public_style_proxy.js (360/238), zero command errors. The proxy is our own old synthetic north-pressure controller, not opponent source. The reload-only 0.9 variant also won these four games, but was less convincing in public-state branches. bench_cont3b.txt records rejected combinations and alternative support distances.
- branch_cont3.txt: twelve 20-second branches from actual latest frames at 30,45,60,75,130,150 seconds, using recorded enemy orders. Support improves score margin in seven, ties two, worsens three versus previous entry. Specifically r2-g2 30→50 improves from -58 to +37; 45→65 from +28 to +119; 60→80 from -84 to -51; 130→150 from -385 to -365. Its other two west branches tie. Conversely east branches starting at 30,60,150 worsen. Fixed enemy orders are diagnostic only: no adaptation, and spawn IDs can diverge.
- continuation3_tests.txt: 6462 playing observations spanning all 16 records and both seats, zero invalid commands and no command-budget violations. Mean decide time 0.0211 ms, maximum 28.52 ms. Six complete simulations against local tank, raider, and focus/reload controllers: six wins, zero errors.
- continuation3_transport.txt: actual persistent stdin/stdout process handled 6462 lines, valid JSON and at most ten commands each, clean stderr, exit 0. Mean round trip 0.161 ms, p99 0.282 ms, maximum 16.37 ms including startup.
- continuation3_scenarios.txt: 24 full continuations from six recent Astra records at 15/40/65/100 seconds against the local focus/reload opponent: 24 wins, no errors.
- continuation3_proxy_scenarios.txt: stronger north-pressure proxy substituted into eight latest-game states. Selected controller wins 5/8 versus previous entry's 6/8. It repairs the west 15-second continuation but loses east 15/40-second continuations that the old controller won. Both lose the west 100-second continuation. This is a concrete robustness limitation, not evidence of universal superiority. Selection favors improvements to the actual west replay branches and the four fresh-game wins, while retaining this regression for next-round review.

## Next revision notes

Inspect new official outcomes first. Support can chase a forward tank that ought to retreat and uses distance to the enemy base as a rough front direction. It only activates with no enemy inside 260, so it cannot reunite tanks already skirmishing. North remains conceded early; low-HP tanks can still pursue or change objectives at bad times. Worker safety can idle miners after the home mine runs dry. Damage reservations omit precise readiness/counters, and individual micro can starve lower-priority commands. Test results are deterministic and correlated; the synthetic proxy is only a stress test. Preserve benchmark scripts, branch logs, and prior controllers for future comparisons.
