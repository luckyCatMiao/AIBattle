# Frontier RTS continuation, revision round 2 of 5

entry.json runs persistent Node agent.js. This revision continues our own previous entry, preserved as incumbent_revision2.js; its notes are review_revision1.md. The setup, rules, example, canary and public replay files remain unchanged. Only public observations and our own retained programs were used; no browsing, downloads or opponent source access.

## Strategy and selected change

Preserve tank-first opening, a fourth worker, one home-outpost rifle and three north rifles, conditional central rally, early damage upgrades, focus fire, 70-pixel reload retreats, short explicit pursuit allowance, worker safety and base repairs.

Remove automatic raider production against tank-heavy armies. Serial production time is the binding resource when outpost income produces a large credit surplus. A tank counter on paper is not enough: our raiders have 94 range versus tank range 160, do not use the tank reload-retreat policy, and can idle on an already controlled objective while the armored front loses support. Continue producing tanks in those situations. The existing rifle response to enemy raiders remains active. Raider control code remains available for experimental variants but the submitted policy does not train raiders.

## Specific latest replay lessons

Both new public games were wins: r1-g1 west at 287.30 seconds and r1-g2 east at 350.30 seconds. Those wins still exposed exploitable mistakes. Selected snapshots and public command windows are in revision2_lessons.json.

- r1-g1: raiders queued at 153 and 165 seconds. At 180 seconds tanks u41/u43 had 192/338 HP near (706,507)/(697,475), while raider u45 was holding at (658,281). At 190 seconds raiders u45/u46 both held near north at full HP, while only one tank remained. At 200 seconds the raiders still held north and the lone new tank u48 was at (467,333). The production queue had spent 16 serial seconds on units that did not support this exchange.
- r1-g2: raiders queued at 165 and 177 seconds. At 180 seconds the queue contained two raiders, with 4.15 seconds remaining on the first. At 190 seconds raider u47 had only 38 HP at (555,482). At 200 seconds the combat force was tank u45 with 203 HP and raider u48 with 105 HP, both retreating, versus three enemy tanks. u48 was absent by 210 seconds. Another raider was nevertheless queued at 205 seconds. We lost all three outposts by 240 seconds and workers were threatened near the base.
- r1-g2 at 160 seconds: u37 had only 24 HP near (541,408), while u35/u39 held near (628,272)/(657,274) and reinforcement u41 was at (865,345). At 180 seconds, u41/u43 were over 120 pixels apart and u45 was almost 300 pixels behind u43. This supports investigating support estimates and retreat grouping, but the tested cohesion changes were less consistent than preserving armor production.

These are observed failures, not proof that a particular alternative would win the recorded games. Removed raider queues address the concrete reinforcement gap; stronger claims require new matches.

## Tests and response time

All simulations use unmodified rules.js, both actions chosen from the same pre-command state, 20 physics steps per second, and both seats. Opponents are our own retained entries or self-authored sparring policies.

- revision2_sweep.js / revision2_sweep.json compare seven candidates: tighter support, individual retreats, removing raider production, nearby enemy objectives, and combinations. The selected no-raider candidate won 6/6 against incumbent_revision2, revision1_longcohesion and series3_southpure. Individual retreats won 3/6; tighter support 4/6; combined tighter support/individual retreats 5/6; mild support 5/6; nearby-enemy objectives 4/6; individual retreats/no-raiders 5/6. No command errors.
- Selected candidate beat incumbent in both seats at 237.05/214.50 seconds, stronger-cohesion at 177.80/276.60 seconds, and southern armor at 208.65/290.50 seconds.
- test.js: 6/6 wins against rifle, tank and raider production. The mirror favored west at 242.05 seconds, showing seat asymmetry. Results preserved in revision2_standard.json and .log.
- test_adversarial.js: 6/6 against north-first tanks, direct raider rush and our older split-opening agent. Results in revision2_adversarial.json and .log.
- test_mixed_round3.js: 4/4 against mixed armor and tank/rifle support, results in revision2_mixed.json and .log.
- test_series2.js: 2/2 against our older current-series opening. Selected policy was also called on all 2,724 playable historical and new public snapshots; commands were applied to independent copies and advanced one second. Zero errors, maximum six commands. This checks legality on realistic states, not counterfactual replay wins.
- revision2_validation.json: 2,824 timed calls, including 100 calls on an 80-unit battlefield. Mean 0.157 ms, maximum 4.614 ms. Persistent stdin/stdout test returned 15 parseable responses covering all fourteen public openings plus a terminal observation, with empty stderr and successful exit. Normal games also returned legal commands with response maxima under 5 ms.

Total selected tests: 24/24 non-mirror wins across the six sweep matches and eighteen final validation matches. These deterministic, correlated tests do not establish a probability against the adapting opponent.

## Remaining weaknesses and next revision

Production is now tank-heavy, making disciplined enemy raider micro a relevant threat even though the rifle counter remains. Removing raiders also removes their fast uncontested capture utility. HP-based support estimates remain crude; grouped retreat destinations add formation offsets; changing objectives can separate reinforcements. The east public game demonstrated these problems even with a win. Large credit reserves reflect the serial factory bottleneck and do not by themselves justify more workers or deeper queues.

For the next revision, inspect whether uninterrupted tanks actually preserve the forward line in both new games, then revisit cohesion or individual retreats only with new evidence. Retain incumbent_revision2.js, review_revision1.md, revision2_lessons.json, all revision2 candidate files, sweep script/results and validation artifacts. The .pure candidate differs from submitted agent.js only by using an unreachable raider condition; submitted code removes that condition explicitly.
