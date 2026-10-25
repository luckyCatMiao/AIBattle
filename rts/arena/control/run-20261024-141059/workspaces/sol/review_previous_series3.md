# Frontier RTS, current-series revision round 3

`entry.json` submits the persistent Node program `agent.js`. It reads JSON observations line by line and emits one JSON object with commands per line. Protected setup, rules, example, canary and replay files were not edited. No external engines, browsing or private opponent source were used.

## Specific replay lessons

The historical six games are from a different series. Current round 2 was split: `r2-g1` won west at 237.40 seconds; `r2-g2` lost east at 170.95 seconds. Full selected diagnostics, including exact frame times, are in `series3_replay_lessons.json`.

- `r2-g2`, 20 seconds: the home rifle `u11` was already dead. The enemy had four rifles in the southern corridor and its first tank `u15` at approximately (498,479). Our first tank `u16` was at (897,393) with 334 HP, heading north. At 30 seconds it had 178 HP; at 40 it had 34 HP at (733,279), while our second tank `u20` was at (768,462). This illustrates fragmented support across different approach routes. By 140 seconds we had no combat units, against five forward enemy tanks and a fresh sixth.
- `r2-g2`, 30 seconds: both southern nodes belonged to the enemy, despite our opening home rifle. At 120 seconds the enemy had four tanks (three full health); we had two tanks with 192/360 HP. The northern control advantage did not compensate for repeated army losses.
- Upgrade starvation from round 1 was improved, but timing still differed: `r2-g2` opponent level one at 29 seconds, us at 37; both level two at 61. In `r2-g1` we upgraded at 35/52, opponent at 37/76. I retained the revised upgrade rule rather than spend still more aggressively: faster upgrades performed worse in controlled comparisons.
- `r2-g1`, 100 seconds: three tanks gathered near north while enemy tanks were around the southeast node. Even the win exhibited objective-driven travel and late conversion of economic superiority into base pressure.

## Final strategy

Retain tank-first/four-worker production, one home rifle and three north rifles, early upgrades, adaptive counter production, reload movement, focus fire, safe mining and repair. Change the opening combat destination to the center (640,420) before 18 seconds when visible enemy tanks or queued tanks establish an armor opening. Otherwise retain the northern route. From 18 seconds onward the previous objective policy resumes. This alters the first tank approach and rally while rifles retain their explicit capture assignments.

This small conditional change addresses the observed separation without discarding successful economy and tactical behavior. An unconditional central route lost an east-seat raider-baseline test; conditioning on public armor information restored that matchup. The actual round-2 entry is preserved in `agent_series_r2.js`, and its review in `review_round2.md`.

## Tests and measured limits

All simulations use unchanged `rules.js` at 20 physics steps per second, choosing both actions from the same pre-command snapshot. Test adversaries are our own prior agents and self-authored policies, not opponent source.

- `revision3_sweep.js`, `revision3_tactics.js`, `revision3_combined.js`, `revision3_final_sweep.js`: tested southern rally, central rally duration/position, two home rifles, pure tanks, faster upgrades, tighter retreat, reload thresholds, separation and scouting orders. Southern rally and two home rifles were worse in the main comparisons. Final conditional route preserves the selected unconditional route's armor results.
- `series3_adaptive_test.json`: final entry beats the actual round-2 entry in both seats at 175.20/273.25 seconds. Against a self-authored southern-concentration sparring policy it wins west at 238.15 seconds but loses east at 160.00. This policy uses our own prior micro and a changed southern opening; it is not a reconstruction or counterfactual of the actual opponent.
- Final `node test.js`: 6/6 non-mirror wins against rifle/tank/raider production in swapped seats. Mirror diagnostic still favors east at 227.50 seconds.
- Final `node test_adversarial.js`: 6/6 wins against north-first tanks, direct raider rushes and our older split-opening agent; zero command errors.
- Final `node test_mixed_round3.js`: 4/4 wins against mixed armor and infantry support.
- Final `node test_series2.js`: 2/2 wins against our current-series round-1 entry at 184.65/198.75 seconds. Validation covers 1,702 playable observations across all ten public records, with zero rejected commands and at most seven commands. Each copied public state receives our commands and advances one second. This validates legality, not counterfactual wins.
- `series3_validation.json`: 1,802 timed calls including 100 calls on an 80-unit battlefield, mean 0.274 ms, maximum 7.043 ms. Persistent subprocess received ten public openings plus one terminal observation and returned eleven parseable responses, empty stderr, successful exit.

The final non-mirror suite totals 21 wins in 22 games including the two round-2-entry comparisons and southern sparring loss. These are correlated deterministic tests, not an estimate of actual match win probability.

## Remaining weaknesses and preserved notes

The southern-concentration east loss remains unresolved. Objective switches still scatter tanks later in the game, approximate HP support can overestimate effective firepower, and reload movement groups can distort individual destinations. A single home rifle remains vulnerable to concentrated infantry; a central opening delays northern tank support. Seat effects and adaptation by the real opponent remain material.

Preserve `agent_series_r2.js`, `review_round2.md`, `series3_*.js`, the revision scripts, replay lessons and experiment JSON. The central-routing comparison gives a narrow tested improvement against our prior entry; do not interpret the other many parameter trials as independent evidence. Prefer future changes driven by new tactical replay failures rather than more tuning on this fixed suite.
