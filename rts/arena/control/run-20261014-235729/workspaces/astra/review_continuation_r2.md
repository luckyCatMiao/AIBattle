# Continuation series, revision 2

Submission: entry.json runs node agent.js (selected c2_combo_near.js). continuation_r1.js preserves the previous submitted controller; review_continuation_r1.md preserves its notes. Read SETUP.md, RULES.md, complete rules.js and example.json; summarized all 14 public records with scripts, then inspected the latest two in detail. No opponent source or external engines were accessed.

## Actual replay lessons

Both latest games were losses: r1-g1 (Astra east) at 287.30 seconds, r1-g2 (Astra west) at 350.30. The earlier historical wins did not survive the opponent's adaptation. At 20 seconds the opponent owns north and its home point in both new games. We preserve all four rifles initially, but concede income. Tested changing the opening to north or shortening/lengthening the home hold; these were inconsistent across seats, so retain 20 seconds for this submission.

1. Pursuit and weak concentration: r1-g1 at 45 seconds, our u16 at (687,388), 88 HP, and u20 at (663,347), 216 HP, both target u19 at (526,454). Their ranges to that target exceed tank firing distance. The other opposing tank u15 remains active at (557,482). At 55 our u20 has only 24 HP; by 65 both original tanks are gone. In r1-g2 at 55, our u21 pursues u20 while u22 also threatens the area. Existing low-HP focus can prefer a distant target over a shot available immediately. Add a 220-point penalty to targets outside actual firing range, retaining low-HP and splash preferences among reachable targets.

2. Retreat can suppress ready fire: r1-g1 at 65, our u24 (816,422), 248 HP, has been ready for 1.4 seconds but is moving toward (1020,420), while opponent u21 is near (658,500). Its range is just outside firing distance at that snapshot; the old controller keeps prioritizing retreat even when subsequent movement brings targets within range. Now a ready weapon with an in-range selected target fires instead of obeying the general outnumbered-retreat branch. Reload withdrawal remains intact. This is a tactical tradeoff: staying to fire can cost a vulnerable tank.

3. Upgrade lag: at 55 in r1-g1 the opponent is level 2 and we are level 1; we remain level 1 at 65. In r1-g2 the opponent is level 2 at 65 while we are level 1. Simply moving upgrade checks earlier did not alter local outcomes. Instead stop prepaying the second queued tank once three tanks are fielded and level 2 is unfinished. Maintain first-slot production, allowing spare income to fund upgrades.

4. Fatal mining exposure: r1-g2 at 145, our home mine is empty and u1/u2/u17 are gathering toward distant m3. u2 and u17 are near (508,511)/(520,520), each 25 HP, with opposing tanks nearby. By 160 we have no workers. In r1-g1 at 165, workers u8/u10 near (833,535)/(823,543) are already damaged while gathering m3; by 180 all four workers are dead. A mine-distance penalty alone did not protect workers or their routes. Withdraw workers behind the base if an enemy combat unit is within 220 of them or within 210 of their chosen mine. Resume gathering when safe. This can sacrifice income but prevents repeatedly feeding workers into enemy fire.

## Strategy retained

Tank-first opening, fourth worker, tank production, two damage upgrades, base repair, opportunistic rifle captures, bounded capture formation, focus fire, reload movement and superiority-based base assaults. Capture offsets stay inside radius 65 before collision displacement. New changes are the four specific adjustments above. Experimental files are not the submitted entry.

## Validation

- bench_combo.txt: selected controller beats continuation_r1.js in both seats (322/335 seconds) and incumbent.js in both seats (277/294), zero rejected commands. Those are our own older controllers.
- bench_combo_proxy.txt: against a locally authored approximation of visible north-pressure behavior, west loses at 347 and east wins at 258. This proxy uses our own controller with north opening/rally and a conditional raider; it is not the opponent source or an exact reconstruction. Selection is not robust across every test.
- replay_combo.txt: twelve 20-second branches from latest official frames at 30,45,60,75,130,150. Enemy issued commands are replayed from the public record, invalid references skipped. Selected variant improves score margin in eight, ties in two, worsens in two versus previous entry. At r1-g1 150→170 score deficit changes from 718 to 453 and weighted surviving HP deficit from 584 to 90. At r1-g2 130→150 score deficit improves from 568 to 383. These fixed-order branches cannot model an adapting opponent, and spawned IDs can diverge; treat them as diagnostics, not match predictions.
- continuation2_tests.txt: 5,448 playing observations across all 14 records and both seats passed rules.command validation with zero rejected commands and no command-budget violations. Mean decision 0.0176 ms, max 5.12 ms. Six complete games against locally authored tank pressure, raider pressure, and focus/reload policies: six wins, zero errors.
- continuation2_scenarios.txt: 24 full continuations from six latest Astra records at 15/40/65/100 seconds, replacing the opponent with local focus/reload policy: 24 wins, zero errors.
- continuation2_transport.txt: actual persistent stdin/stdout process, 5,448 JSON responses, <=10 commands each, clean stderr, exit 0. Mean round-trip 0.162 ms, p99 0.288 ms, max 20.61 ms including startup. Far below 1-second target.

## Next revision

Inspect actual new official matches before trusting local win rates. North remains conceded early. Tanks can still split between points or overcommit when firing before retreat. Worker retreat has no route planner and may leave all workers idle if every mine is contested. Damage reservations do not accurately account for readiness or counters. Low-priority unit commands can be starved when many tanks need individual micro. The chosen combination's loss to the west-seat north-pressure proxy is a concrete remaining weakness. Keep continuation_r1.js and the benchmark/branch scripts for comparison; public_style_proxy.js is our own synthetic policy, never private opponent code.
