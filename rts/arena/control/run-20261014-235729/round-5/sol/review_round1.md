# Frontier RTS round 1

Submission: `entry.json` runs `node agent.js`, a persistent JSONL process. No external packages, network, engines, or opponent source. It imports the unchanged public simulator's unit statistics. All strategy is authored here.

## Strategy

Opening: queue tank then raider with the initial 260 credits. All four initial rifles race north. Main armor reinforces north for the first 35 seconds; the first raider takes the nearest southern outpost. Then prioritize our nearby outpost, north, and the remaining enemy outpost. Detached non-tank units capture safe unattended objectives. Reinforcements rally behind the selected objective.

Build four workers while the home mine has ore, otherwise maintain three. Sustain mostly tanks, add rifles against raiders and limited raiders against tank-heavy opposition. Buy damage upgrades after sufficient army growth, repair damaged bases when available, and reroute or withdraw workers threatened near mines. Economy and production respect serial queues and population limits.

Within combat, group commands by target, favor targets already in range, low remaining shot counts, type counters, and tank splash opportunities. Retreat locally overwhelmed groups toward reinforcements or base protection. Attack the enemy base only with a large force advantage or a vulnerable base. All responses stay within ten commands.

## Public replay lessons

`public_replays.json` is `[]`. There are no public game IDs or times to diagnose in round 1; no opponent conclusions are inferred. The following are local tests, not organizer battle records.

The first version split its starting rifles two north/two south and opened worker/tank/worker. In local-tank-0 at 31 seconds, the opponent held north and its nearby outpost. By 91 seconds it controlled all three; our units were gone by 121 seconds, and our base fell at 178.95. The east-seat equivalent fell at 157.95. Concentrating rifles north, making armor first, and using a raider for the near outpost corrected those failures against the same baseline.

A second refinement prevents the main rally from prematurely abandoning north as soon as it is captured. This reduced the west-seat tank-baseline finish from 387.6 to 268.35 seconds. A five-worker variant lost both tank-baseline seats and both north-first-tank seats; reverted because its production delay outweighed the additional mining.

## Final validation

`node test.js` uses the actual unmodified 20 Hz simulation, simultaneous pre-command snapshots, and one decision per second. Final agent beat simple rifle, tank, and raider armies in both seats: six wins. Tank games finished at 268.35 and 290.55 seconds. Two mirror runs deterministically favored west at 418.25 seconds; these runs are seat diagnostics, not two independent wins.

`node test_adversarial.js` adds north-first tank armies, direct raider base rushes, and the earlier self-authored version. Won both seats against the first two, and west against the earlier version; lost east to the earlier version at 351.8 seconds. Thus 11/12 wins against these non-mirror scripted test cases. These opponents are limited synthetic probes, not evidence about the real competitor.

Final recorded decision timings: standard suite 2,236 calls, mean 0.0168 ms, max 4.57 ms; adversarial suite 1,680 calls, mean 0.0202 ms, max 4.06 ms. Both suites had zero rejected commands. Also tested 100 calls on an 80-unit battlefield with valid command handling at the population cap. A separate subprocess check sent two compact JSON observations to one persistent process and obtained exactly two parseable, valid responses with no stderr, including east-seat commands. The pretty-printed example must be compacted onto one line to match the JSONL transport.

## Remaining weaknesses and next-round notes

In local-previous-1, north changed from ours to the west player's by 121 seconds; at 211 seconds we had four units versus eight and eventually lost at 351.8. Investigate reinforcement cohesion, targeting, and post-home-mine income when real replays arrive. Current local-power estimates use weighted HP rather than a full combat forecast; they ignore cooldown timing and counter-specific DPS. Retreat moves sacrifice firing while moving. Focus groups can overkill, and ten-command contention may delay distant reinforcements. No explicit tank kiting or splash-spacing micro. Worker safety routing may be conservative after mines deplete. Mirror seat asymmetry merits replay inspection.

Preserved `agent_v1.js` (failed split opening), `agent_v2.js` (concentrated opening before north rally fix), and `agent_v3.js` (same strategy as final, before rejected extra-worker experiment). Final results and 30-second local histories are in `test_results.json` and `test_adversarial.json`; `test_standard.json` preserves an intermediate benchmark. Next revision should use actual public game IDs/timestamps and avoid overfitting these simple opponents.
