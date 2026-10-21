# Frontier RTS: current series, revision 3 of 3

Submitted entry.json runs `node agent.js`. This continues our own incumbent, archived as incumbent_series_r3.js. The preceding review is preserved as review_before_series_r3.md. Read SETUP.md, RULES.md, rules.js and example.json; analyzed the 26 public records with scripts. No opponent source, external engines or browsing were used. Protected files were not modified.

## Final strategy and change

Retain tank-first production, four workers while local ore remains, split opening captures, adaptive rifles against raiders, upgrades, repairs, safe mining, 140-pixel allied support estimation, focus fire and outward reload retreats. Capture income finances sustained armor production. Push the enemy base only with a substantial advantage; otherwise win by control and attrition.

One small change: when a unit's assigned outpost is already owned, issue stop if its order is not already hold. Previously this branch simply continued, leaving an old move or attack order running. Danger retreats, reload movement and immediate attacks are evaluated earlier and retain priority. This primarily affects opening rifles; it prevents a completed objective assignment from accidentally preserving unrelated movement. It does not force the unit to remain inside the capture circle.

## Specific public replay lessons

Current-series r2-g1 was a win at 219.05 seconds; r2-g2 was a win at 169.80 seconds (exact durations in public records are authoritative). Wins still contained avoidable movement and losses.

- r2-g1 at 14 seconds: rifle u4 had 110 HP at (447.62,492.34), with an old retreat move toward (249.57,455.51). Its assigned western outpost was already ours. The old objective branch kept that retreat running: by 15 seconds it reached (384.70,480.64), and by 35 seconds it was holding near our base. The new branch stops it at its current safe position. A one-second counterfactual using the actual simultaneous enemy orders confirms identical 110 HP and a hold order at (447.62,492.34). This is a movement correction, not a claim that the full historical game would have improved.
- r2-g2 at 25 seconds: u12 and u13 retained retreat orders toward the southern home objective even though their assigned northern objective was already ours. u12 at (708.45,363.43), 97 HP, moved to (738.46,419.96) over the next second under the old policy. The revised branch holds position with the same HP in the one-second check. Immediate danger and targeting checks still precede this branch. Details are in series_r3_lessons.json and series_r3_counterfactual.json.
- r2-g2 at 63–67 seconds: tank u16 was ordered north using attackMove but pursued enemies westward through the order's 205-pixel aggression radius. At 63 seconds it had 264 HP near (527,514); at 65 seconds it had 196.8 HP near (492,540); at 67 seconds it had 28.8 HP near (481,569), and was gone at 68 seconds. Reload separation also pulled it south, away from reinforcements. Tested ordinary move for destinations that increase distance from nearby enemies. This addresses a real failure mode, but broad and conditional versions did worse against our archived opponents, so none were submitted.
- r2-g1 around 55–75 seconds and r2-g2 around 60–90 seconds: the army rotated north after capturing the enemy-side southern outpost, allowing recapture and subsequent reversal. Central, pressure-based and southern holding objectives did not improve the selection suite. The final policy preserves this weakness rather than changing staging without supporting results.
- r2-g1 lost its last starting rifle by 50 seconds; r2-g2 by 45 seconds. Explicit rifle withdrawal from tanks saved exposure in principle but weakened the broader match results. Retain the established opening rather than assume saving individual rifles improves the game.

## Tests and selection

All local games use unmodified rules.js, simultaneous pre-command snapshots, twenty physics steps per decision, both seats and the command budget. Opponents are our own archived entries, self-authored variations and simple baselines. These deterministic, correlated tests are selection evidence, not a forecast against the adapting unseen opponent.

- series_r3_sweep.json: nine candidates, six games each. Incumbent control 3/6; rifle screening 3/6; southern anchor 3/6; central staging 2/6; pressure objective 3/6; earlier reload 0/6; stronger focus 3/6; tighter threat range 2/6; wider support 1/6.
- series_r3_micro.json: directional move 3/6; move plus earlier reload 0/6; move plus focus 3/6; higher move priority 3/6; replacing ordinary objective travel with move globally 0/6. Rejected the global replacement.
- series_r3_compare.json: twelve additional games per candidate. Control, anchor and pressure each 11/12; rifle screening 8/12; directional move and move plus focus each 9/12.
- series_r3_refine.json: owned-only movement 2/6; homeward-only movement 1/6; late movement 3/6; tanks-only movement 3/6; owned tanks-only movement 2/6; selected completed-assignment stop 4/6; stronger overkill penalty 3/6.
- series_r3_finalists.json: selected stop 11/12; late movement and tanks-only movement each 9/12. On the common 18-game set, selected stop won 15/18, control 14/18. The selected entry beat our current incumbent in both seats, but lost west against weighted retreat, east against earlier reload, and west against smaller ally spacing. This is a modest change, not dominance.
- series_r3_standard.json: 6/6 against rifle, tank and raider baselines. Mirror favored east at 245.45 seconds; large seat sensitivity persists.
- series_r3_adversarial.json: 6/6 against northern armor, direct raider rush and our older split strategy.
- series_r3_validation.json: 2/2 against our older series entry; all 5,844 playable public observations independently evaluated, commands applied and simulation advanced one second. Zero command errors, maximum eight commands. This checks legality and robustness, not historical counterfactual win rates.
- series_r3_counterfactual.json: two one-second branches with actual historical enemy commands verify the intended stale-order correction.

## Protocol and response time

Node syntax check passed. The persistent process returned 36 valid JSON responses for public openings, example.json, midgame and terminal observations, with empty stderr. Across 5,944 timed calls, including 100 on an 80-unit battlefield, mean computation was 0.104 ms and maximum 15.104 ms. Full-game baseline tests also had zero command errors. entry.json follows the program protocol.

## Remaining weaknesses and preserved notes

The completed-assignment hold can leave a rifle outside its outpost circle and relinquish a useful repositioning order. The safety checks mitigate this but do not prove optimal positioning. General disengagement still uses attackMove in some cases where it can pursue the wrong enemy. Individual reload retreats can separate a damaged tank from support and compete for command slots. HP-based support estimates omit firing geometry and arrival time. Objective changes can reverse the whole army; holding tanks cluster; conservative base-rush thresholds can prolong won positions.

Preserve incumbent_series_r3.js, review_before_series_r3.md, sr3_* candidates, series_r3_* scripts/results and earlier notes. A future revision should address retreat direction together with support and firing opportunities, and compare both seats against diverse strategies. The current small sample does not justify a wholesale rewrite of an entry that won all four current-series public games.
