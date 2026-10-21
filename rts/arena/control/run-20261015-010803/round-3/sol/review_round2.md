# Frontier RTS: new-series revision round 2

Submission: `entry.json` launches the persistent standard-library Node program `agent.js`. It reads one JSON observation per line and writes exactly one JSON command object per line. All protected inputs are unchanged. No browsing, downloads, engines or private opponent source were used.

## Concrete replay lessons

The six `history-` games belong to the previous series; the relevant new games are `r1-g1` (Sol west, win at 216.30 seconds) and `r1-g2` (Sol east, loss at 236.80 seconds). The prior submitted code is preserved as `agent_series_r1.js`; the inherited historical review is `review_history_r3.md`.

1. Upgrade starvation was the largest actionable error. In `r1-g2` at 60 seconds we had 481 credits, level zero, and only one surviving tank with about 293 HP. The opponent had level two and three tanks. We first upgraded at 69 seconds and never bought the second upgrade. At 120 seconds we still had level one and 712 credits. Requiring 420/720 credits of surviving army value meant attrition blocked the improvement needed to stop attrition. In the winning `r1-g1`, upgrades were still late at 49 and 105 seconds.
2. Both games at 20 seconds show our northern ownership but enemy ownership of BOTH southern outposts. We devoted all four starting rifles north and waited for a serially produced raider to cover home. In `r1-g2`, our nearby southern outpost was still enemy-owned at 35 seconds. A scout with an eight-second capture timer can impose a significant income advantage before a delayed raider arrives.
3. In `r1-g2` the first tank `u16` had 312 HP at 30 seconds but only 120 at 40 seconds. By 60 seconds only `u23` survived, with about 293 HP, while the opposing tanks were upgraded. Pursuit and fragmented support remain weaknesses. Tests found that simply removing reload movement or narrowing the support radius made results worse, so those speculative changes were rejected.

## Selected strategy

Open with tank then worker, instead of tank then raider. This establishes four-worker local mining earlier, retains armor production, and avoids spending an early serial production slot on a mobile capture unit. Assign one starting rifle to the nearest southern outpost and three to north. Preserve tank-heavy adaptive production, occasional counter units, opportunistic capture, safe ore routing, repair, focus fire, splash valuation and tank movement during reloads.

Upgrade whenever at least one combat unit survives and funds cover the upgrade plus 40 credits if production is already queued, or plus 160 if the queue is empty. This removes the surviving-purchase-value gate while reserving a tank when production is idle. On the unchanged observed histories the revised rule becomes eligible at 20 seconds in `r1-g1` and 21 seconds in `r1-g2`, versus the original 49/69. This is a legality and trigger diagnostic, not a claimed counterfactual match result.

## Experiments and validation

All battle tests use unchanged `rules.js`, 20 physics steps per second, and both actions chosen from the same pre-command state. Synthetic policies and older agents are our own code, not the opponent's source.

- `revise_test.js` / `series2_sweep.json`: earlier upgrades beat the actual round-1 entry in both seats. Removing kiting lost both seats. Narrowing local support and combining that with earlier upgrades also underperformed.
- `tactical_sweep.js` / `series2_tactics.json`: explored reload thresholds, pursuit range, opening production, objectives and target scoring. The tank/worker opening beat both previous-entry seats and both mixed-armor seats. Upgrade-only still lost mixed armor in the west seat.
- `opening_sweep.js` / `series2_opening.json`: one-home/three-north and two-home/two-north both won those four games. Selected one-home/three-north after the broader suite below. These are correlated tests, not independent performance estimates.
- Final `node test.js`: 6/6 wins against rifle, tank and raider baselines in swapped seats. Finish times respectively 94.90/102.10, 133.70/124.55 and 147.75/124.75 seconds. Mirror diagnostic favors east at 207.05 seconds.
- Final `node test_adversarial.js`: 6/6 wins against north-first tanks, direct raider rushes and our oldest split-opening agent. Times 149.85/167.90, 129.50/160.30 and 117.50/127.20 seconds. Zero rejected commands.
- Final `node test_mixed_round3.js`: 4/4 wins against independently authored mixed armor and infantry-support production policies; armor times 135.00/194.10, support 133.50/150.25 seconds.
- `node test_series2.js`: 2/2 wins against the actual new-series round-1 submission, at 142.05/214.85 seconds. Total selected non-mirror suite: 18 wins in 18 games.
- That script validates responses on every playable public frame: 1,293 observations across eight records, zero rejected commands, at most seven commands. It advances each copied state one second after applying our response. This checks legality on realistic observations; it does not establish wins against the actual opponent.
- Timing includes those frames plus 100 decisions on an 80-unit battlefield: 1,393 calls, mean 0.339 ms, maximum 5.451 ms. Persistent subprocess test gives nine parseable responses for eight openings and a finished observation, empty stderr and successful exit. Far below the one-second response target.

## Remaining weaknesses and useful notes

Seat sensitivity remains substantial in mirrors. Weighted local HP can overestimate actual shooting support. Tank reload movement can delay shots, target allocation predicts only approximate committed damage, and grouped commands can distort individual evasion destinations. One home rifle can be overwhelmed; three northern rifles can still be lost to early armor. Removing the opening raider reduces early mobility. Upgrade purchases can temporarily limit replacement production. Public-frame tests are not reactive counterfactual matches; the real opponent may adapt beyond these synthetic policies.

Keep `agent_series_r1.js`, the historical reviews, all `series2_*.js` candidates and JSON experiment records for the next revision. `series2_validation.json` contains the final actual-previous-entry battles, legality, timing and protocol results. `series2_upgrade_diagnostic.json` preserves exact observed upgrade triggers. Existing test scripts remain reproducible with the final `agent.js`.
