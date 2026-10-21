# Frontier RTS revision round 2

`entry.json` runs `node agent.js`. This is a persistent JSONL program using only Node standard libraries and the supplied, unchanged simulator. The opponent source was neither available nor accessed. No browsing, external engines, or downloads were used.

## Public replay diagnosis

Both round-1 games were wins: `r1-g1`, west, ended at 151.6 seconds; `r1-g2`, east, ended at 151.4 seconds. These results support keeping the tank-first opening and concentrated initial northern infantry, but reveal several concrete mistakes:

- In `r1-g1` at 80 seconds we owned all three outposts, had five tanks and 744 credits, yet level zero weapons. At 120 seconds there were 1,144 credits, eight tanks, and only level one weapons. `r1-g2` similarly had 656 credits and five tanks at 80 seconds without an upgrade. Both games bought their first upgrade at 97 seconds and never bought the second. The old seven/thirteen-unit upgrade gates were inappropriate for expensive armor. Now upgrade gates are four/six combat units, with sufficient credits reserved to maintain production.
- In both games at 100 seconds, seven tanks remained clustered near north against only one enemy rifle. At 120 seconds eight tanks still waited. The ten-unit base-assault requirement deferred the attack until the rally change at 133 seconds despite an overwhelming advantage. The new alternative requires four tanks in the forward force and forward HP exceeding twice the entire enemy army HP plus 1,050. This checks troops already within 650 of the enemy base rather than counting only distant reinforcements. The original conservative large-army condition remains available.
- `r1-g1` lost the capture raider `u19` at 49 seconds, after it advanced to approximately (918,464) at 48 seconds. `r1-g2` lost its capture raider at 44 seconds, near (553,417) in the preceding frame. A raider now withdraws from nearby countering rifles if no tank is within 200 pixels.
- The initial rifles were all lost by 38 seconds in `r1-g1` and by 32 seconds in `r1-g2`, despite eventual victory. East's early exchange was particularly costly. This remains an opening weakness; the new reload movement primarily improves the subsequent armor battles rather than claiming to solve all initial infantry losses.

## Final strategy and changes

Keep the opening: tank then raider, four initial rifles north, raider to the nearby southern outpost. Maintain four workers while local ore remains and three afterward. Capture safe unattended objectives with non-tank detachments, primarily produce armor, add rifles against raiders and a limited raider complement against tanks, repair the base, and protect mining routes.

Retain favorable target selection and local retreat checks. Improve focus fire by processing units in shot-readiness order, estimating damage already assigned to a target, and penalizing targets expected to die from those shots. Include weapon upgrades in damage estimates. This is a one-second approximation, not a complete battle solver.

Tanks now move about 34 pixels away from a nearby non-raider ranged threat when more than 1.05 seconds remain on their reload. On the next decision they can resume targeting. This uses otherwise idle reload time to make slower enemies spend time closing distance. It is disabled during a committed base attack and near our base. Movement is grouped into nearby destination cells to conserve commands. All economy, tactical and movement orders share the ten-command limit.

## Experiments and validation

The actual unmodified simulator runs at 20 Hz in every battle test, with both actions chosen from pre-command snapshots once per simulated second.

The economy/assault/raider-protection revision won 11 of 12 existing non-mirror cases, but still lost east against our early split-opening bot at 351.8 seconds. Focus-fire changes fixed that loss at 348.95 seconds but introduced an east loss to north-first tanks at 433.85 seconds. A small focus-penalty sweep showed sensitivity to targeting order; its output is exploratory and does not establish broad superiority. Reload movement then fixed both failures and markedly shortened tank battles. Keep the final tested version rather than the intermediate targeting variant.

Final results:

- `node test.js`: six of six wins against basic rifle, tank and raider armies in both seats. Tank finishes: 139.85/146.00 seconds. Rifle finishes: 114.30/108.40; raider finishes: 141.45/155.50. Two identical mirror simulations favor west at 264.35 seconds; they are seat diagnostics, not independent wins.
- `node test_adversarial.js`: six of six wins against north-first tanks, direct raider rushes, and our earliest split-opening bot. North-first tank finishes: 174.40/154.30; split-opening bot: 144.95/150.75.
- `node test_round2.js`: beat the actual submitted round-1 agent in both seats at 179.40/167.65 seconds. Validated commands on all 304 playable public replay observations using copied authoritative states, then advanced each copy for one second. Zero rejected commands; maximum five commands on these public observations. These snapshot checks establish legality, not counterfactual full-game wins against the actual competitor.
- Tested 100 decisions on an 80-unit battlefield. Across replay and stress observations, 404 calls averaged 1.238 ms and peaked at 6.387 ms. Standard and adversarial battle suites peaked at 4.094/3.985 ms, with zero rejected commands.
- A real persistent subprocess received two opening observations with opposite seats plus a finished-game observation. It emitted exactly three parseable JSON objects, no stderr, and exited successfully.

Thus 14/14 non-mirror synthetic battle wins, including our previous submitted program. The opponent may revise its strategy substantially; none of these synthetic bots is private opponent code or an exact reconstruction.

## Remaining weaknesses and next revision

Weighted HP remains the strategic force estimate; counters, cooldowns and base defense are only partially represented. Reload moves temporarily prevent shooting and can lose efficiency through formation offsets. Focus prediction omits splash damage and future enemy movement. Ten-command congestion can delay retreats or new arrivals in larger fights. Initial rifles still tend to pursue into exposed positions. Mining after local exhaustion remains conservative, and late-game map control could use more deliberate flank attacks. Deterministic mirror west advantage persists.

Preserved `agent_round1.js` and `review_round1.md` contain the actual previous submission and notes. `agent_r2_economy.js` and `agent_r2_focus90.js` preserve useful intermediate variants; `agent_r2_focus.js` includes an exploratory counter-production threshold. `test_results.json`, `test_adversarial.json`, and `test_round2.json` contain final results; `sweep_round2.js` preserves the exploratory experiment. The generated `candidate_r2.js` is not the entry. Next round, inspect the new public games before assuming the opponent continues producing mostly rifles, and assess initial infantry losses, reload movement, and post-depletion mining at concrete timestamps.
