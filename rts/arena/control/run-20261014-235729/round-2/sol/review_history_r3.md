# Frontier RTS revision round 3

The final entry is `{"mode":"program","command":["node","agent.js"]}`. The persistent Node process reads one observation per line and emits one command object per line. It uses standard libraries and the supplied unchanged simulator. No opponent source, browsing, downloads, or engines were used.

## Specific public replay lessons

Round 2 again won both seats: `r2-g1` west finished at 137.1 seconds and `r2-g2` east at 136.1. The opponent's public opening changed to tank then raider. Preserve armor production, northern opening, focus fire, reload movement and repairs, but fix these concrete mistakes:

- `r2-g1` at 25 seconds: capture raider `u17` stood at approximately (505,501), 110 HP, while enemy tank `u16` was at (674,478). Our raider held on the outpost and was dead by 31 seconds. Friendly tank `u15` was far north, at (600,272), so its inclusion in a 250-pixel local support estimate overstated useful help. The nearby southern node remained neutral at 30 seconds. `r2-g2` at 25 seconds similarly shows `u18` at (703,485) attacking enemy tank `u15` at (598,478), pursuing away from the intended capture. It died by 29 seconds and our nearby node was still neutral at 41 seconds.
- Capture raiders now use plain movement to an assigned node in tank-only encounters. When a tank approaches within its shooting range plus the raider radius plus 65 pixels, the raider moves 145 pixels directly away. This overrides target pursuit while the capture assignment remains active. Encounters containing rifles or raiders use the ordinary combat logic; an initial broader exemption caused an east-seat rush loss in testing.
- `r2-g1` at 61 seconds held 495 credits and three tanks but level-zero weapons. First upgrade was at 73 seconds; second at 97. `r2-g2` also first upgraded at 73 and second at 109. The four/six combat-unit gates still poorly represented an armor army. Upgrade eligibility now uses living army purchase value, 420/720 credits, while retaining the existing cash reserve for production. Three living tanks can qualify for level one; five can qualify for level two.
- Both games lost their initial rifles; east's first tank was down to 108 HP at 35 seconds and dead by 41. Opening exchanges and local force estimation remain weaknesses. This revision does not claim that every early loss is solved.

## Final strategy

Train tank then raider, send the initial rifles north and the raider toward the nearest southern node. Maintain four workers near local ore and three afterward, choose safer mining routes, primarily produce tanks, capture unattended nodes with mobile detachments, upgrade, and repair. Preserve the previous strength-based base assault and tank reload movement. Assign shots using range, counter damage, splash opportunities and estimated already committed damage.

Counter production now starts adding rifle support when at least two enemy raiders exist and they outnumber our rifles under the production ratio. The previous condition waited for more than two raiders even with zero rifles. Testing a one-raider trigger damaged armor/support and previous-agent results; that variant was rejected. Ten commands remain a strict shared budget.

## Tests and measurements

All battle tests use the authoritative unchanged `rules.js` at 20 Hz with both decisions derived from the same pre-command state once per simulated second. Synthetic opponents are self-authored tests, not private opponent code.

Final tests:

- `node test.js`: six wins in six non-mirror battles against rifle, tank and raider armies, both seats. Finishes: rifles 110.90/108.35 seconds, tanks 133.85/146.60, raiders 132.50/156.35. Identical mirror games favor east at 271.10 seconds; this is a seat diagnostic.
- `node test_adversarial.js`: six wins in six against north-first tanks, direct raider rushes and our oldest split-opening program. Finishes: north tanks 135.85/189.15, rushes 120.95/129.70, split opening 133.25/124.25. No rejected commands.
- `node test_round3.js`: beat the actual submitted round-2 program in both seats, 185.60/251.80 seconds. Validated commands on all 579 playable public snapshots across all four records, applying each response to a copied authoritative state and advancing it one second. Zero errors; at most seven commands. Snapshot checks establish legality, not counterfactual wins against the actual competitor.
- The same script measured 679 calls including 100 decisions on an 80-unit stress battlefield. Mean 0.728 ms, maximum 9.257 ms. Battle-suite calls average approximately 0.03 ms and peak under 5 ms. These are local Node measurements, comfortably below the one-second target.
- Persistent subprocess protocol: five input observations spanning four openings and a finished game produced exactly five parseable responses, empty stderr and successful exit.
- `node test_mixed_round3.js`: three wins in four against two independently authored north-first mixed armies with earlier upgrades. The tank/tank/raider production cycle wins against us in the west seat at 139.80 seconds; we win east at 195.40. Tank/rifle/rifle support loses against us at 236.80/150.95. The round-2 program also lost the west armor case (160.50), so this is a persistent weakness, not evidence of broad invulnerability. Overall final non-mirror suite: 17 wins in 18, including both previous-entry battles.

The five-way exploration in `sweep_round3.json` separately compared old, upgrade-only, capture-only, combined and tighter-reload variants. Broad capture avoidance lost to rushes; tighter reload movement had no consistent advantage. Final code retains the original reload threshold. Tests drove the restricted tank-only capture rule and the two-raider production trigger.

## Weaknesses and preserved material

Local weighted HP overestimates support from units too far away to shoot. A mobile counter can isolate armor, particularly west against the tested mixed armor army. Reload movements suspend firing and target prediction approximates only the next decision interval. Capture evasion can oscillate and delay occupation. Opening infantry losses, ten-command congestion, depleted mining routes and mirror seat sensitivity remain unresolved. The opponent can adapt beyond the tested cases.

`agent_round2.js` and `review_round2.md` preserve the actual previous submission. `agent_round1.js` and `review_round1.md` preserve round 1. `candidate_r3_safe.js` preserves the restricted capture/value-upgrade version before the final counter-production change. `candidate_r3_two.js` matches the final tested logic. `sweep_round3.js` and its JSON preserve initial experiments; `test_round3.js`, `test_mixed_round3.js` and the existing test scripts reproduce final checks. Test result JSON files contain outcomes and timing measurements. All protected input files remain unchanged.
