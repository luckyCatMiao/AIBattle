# Frontier RTS revision 2

Entry: `entry.json` runs `node agent.js`. The process accepts one observation per line and returns one JSON command object per line. All gameplay decisions are authored here; no private opponent code or external engines were accessed. Previous entry and notes are preserved as `agent_r1.js` and `review_r1.md`.

## Actual round-1 results and diagnosis

The new-series results were a west-seat win and east-seat loss, not two losses: `r1-g1` (Sol west, Astra east) ended at 216.30 with Sol winning; `r1-g2` (Astra west, Sol east) ended at 236.80 with Astra winning. Public records were analyzed with scripts rather than dumped in full.

* `r1-g1`, 18 seconds: Astra rifle u11 had 50 HP, was retreating from (541,457), and had never fired. Three other rifles clustered around the southwest node while the first tank was still at (919,459). By 30 seconds all four rifles were dead. The initial split does obtain two southern nodes, but carries a real casualty cost.
* `r1-g1`, 42 seconds: Astra tank u16 had 15 HP versus Sol u15's 216 HP. The old controller only used reload movement against non-tanks, even though tank duels dominated the actual game. Sol's public orders regularly alternated attacks and movement. The actual rules establish that move suppresses fire, so movement must be confined to a reload window.
* `r1-g1`, 65 seconds: full-health u22 stood at (668,213) while u24, at (944,397), retreated from two southern enemy tanks. At 73 seconds u24 had 72 HP and u22 was retreating with its gun already ready; at 76 seconds u22 had 120 HP. Local retreat cascades and scattered reinforcements squandered the available army.
* `r1-g1`, 110 seconds: Astra had 518 credits and level 1 versus Sol level 2. At 120 seconds Astra still had level 1, 563 credits, and one surviving tank. Requiring four combat units before upgrading made losses permanently block upgrades despite available money.
* `r1-g2`, 60 seconds: Astra had level 2 and three tanks versus Sol level 0 and one tank, with scores 922–799. At 120 seconds Astra held all three nodes. Preserve the successful tank-production and southern-capture structure rather than replace the opening wholesale.

## Submitted changes and strategy

The core remains tank-first, fourth worker, continuous tank production, opportunistic rifle captures, focus fire, mining selection that penalizes enemy presence, repairs, and eventual ranged base siege.

1. Tanks now make reload retreats against enemy tanks as well as shorter-range units. Trigger: closest enemy combat unit within 175 pixels and more than 0.65 seconds until the next shot. The 38-pixel movement order is revisited next second. This avoids the old static tank duels while retaining ready-gun attack orders.
2. Permit upgrades with two tanks, or after 75 seconds, while retaining credit reservation and production/population checks. This removes the attrition-induced upgrade lock and delays the old first-tank-era upgrade that could compete with reinforcement funding.
3. Raise the local numerical retreat threshold from 1.35 to 1.65, reducing premature full retreats and allowing support units to reach the fight. Emergency retreat and reload movement are separate decisions.
4. Raise enemy exclusion around scout destinations from 220 to 240 pixels. Capture candidates also support raiders, though current production remains tank-based.

A stronger explicit regrouping heuristic was implemented and rejected: it won the six basic tests but lost both seats against the simpler revised controller. It remains in `agent_r2_cohesion.js` for diagnosis. It should not be described as part of the submitted strategy. Threshold, reload-window, retreat-distance, and upgrade variants are preserved in `variant_*.js`, with `tune_r2.py` and `tuning_r2.txt`. The baseline mirror match itself favored east; compare paired outcomes, not a single seat. No parameter variant established a sufficiently convincing overall improvement to replace the simpler candidate.

## Validation

* `test_results_r2.txt`: 2,586 playing public-observation/seat combinations validated through the supplied command implementation, zero rejected commands and no command-budget violations. Decision timing is recorded in that file.
* `transport_r2.txt`: 2,586 sequential request/response exchanges through the actual persistent subprocess, valid JSON each time, no stderr, mean 0.166 ms, p99 0.321 ms, maximum 18.595 ms including startup. This measures actual process transport and serialization, not just the decision function.
* `previous_entry_results_r2.txt`: revised entry beats the saved round-1 entry in both seats, at 148 and 146 seconds, with no command errors.
* Six complete games against three independently authored test opponents (tank pressure, raider pressure, tank focus/reload micro), swapping seats: six wins, zero rejected commands. The stronger east matchup now ends in a win at 145.15 seconds. These are local approximations, not Sol's private controller.
* `scenario_test.js` / `scenario_results_r2.txt`: resume actual `r1-g1` and `r1-g2` battlefield states at 40, 65, and 100 seconds, replacing the opponent with the strongest local test controller. Revised entry wins all six continuations; prior entry wins four and loses east at the 65- and 100-second starts. These counterfactual simulations do not establish what Sol would have done.

## Remaining weaknesses and next revision

Actual series evidence remains one win and one loss for the old entry; there are no official results for this revision yet. Opponent adaptation is unknown. Initial rifle scouting remains costly, and current local power estimates still ignore gun readiness and detailed firing geometry. The controller does not solve global army cohesion: the rejected regrouping heuristic prevented useful captures and did worse in paired tests. Reload retreats do not predict the opponent's next decision. Capture assignment can change en route. Large armies may exhaust the ten-command budget and defer lower-priority moves; late-game cap behavior has less coverage than combat-heavy games.

For revision 3, inspect r2 games at 20–45 seconds for rifle losses and first tank trades, 60–100 seconds for separated tanks and ready guns retreating, and compare actual upgrade timings. Retain round-1 snapshots as scenario regression tests. Prefer fixes supported by specific losses over adding the rejected cohesion rule without new evidence.
