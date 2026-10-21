# Frontier RTS revision 1

Submission: `entry.json` runs `node agent.js`, a persistent JSONL process using only standard Node libraries and the supplied public rules module. No opponent source was accessed. The controller uses the current observation rather than persistent hidden assumptions, so it works with either seat.

## Strategy

Open tank then fourth worker. Sustain tank production with at most two queued units, buy damage upgrades when an army and funded production exist, repair damaged bases, and select mines by distance plus nearby enemy pressure. Preserve initial rifles as capture units where possible. Assign one rifle to each currently safe unowned outpost; the remaining army pursues a nearby affordable objective. This often prioritizes southern territory, but the controller can capture an undefended northern point. Capture assignments use move to avoid automatic pursuit. Tanks use focused attacks, approximate damage reservations to reduce overkill, and splash-aware target valuation. Retreat locally outnumbered units. During reloads, tanks retreat from nearby shorter-range units. Advance on the enemy base only with a substantial army advantage. Tanks naturally stop at 189 pixels when attacking a base (192 firing range versus the base's 184 range against tanks).

Production commands reserve their actual credit cost and respect live population plus queued units. Identical combat intents are grouped, and all output is limited to ten commands. Emergency repair and production precede tactical orders.

## Public replay lessons

All six historical games were summarized with scripts, including states, army compositions, scores, and public commands. Sol won every historical game; these are not results against this entry.

* `history-r1-g1`, 0–20 seconds: Luna splits initial rifle orders and spends on an immediate upgrade; by 20 seconds Sol owns north and has a tank. At 60 seconds Sol owns all three nodes. Lesson: early upgrade without sustained production and coherent combat fails.
* `history-r2-g2`, 60 seconds: Luna owns north and west-south, yet at 90 seconds Sol has five tanks versus Luna's one tank, two rifles, and raider. Sol wins at 136.10. Temporary capture superiority cannot substitute for army preservation and production.
* `history-r3-g1`, 60 seconds: Luna briefly owns north, but at 90 seconds Sol has five tanks and level 1 while Luna has one tank. At 120 seconds Luna has no units and its base has 636 HP. Sol wins at 127.35. Avoid feeding replacements into concentrated armor.
* `history-r3-g2`, 21–45 seconds: Sol's public orders show a raider capturing south while tanks alternate focused attacks with movement. At 90 seconds Sol has five tanks and level 1 against one tank. The supplied actual rules confirm that move suppresses shooting; use reload windows rather than permanent retreat.

## Validation

`node test.js` validates each issued command against the actual command implementation on 1,678 playing historical observations, covering both seats: zero invalid commands and no command-budget violations. Latest run averaged 0.025 ms per decision with maximum 0.979 ms (machine-local measurements, not a timing guarantee).

Persistent-process test fed 1,678 compact JSON lines and parsed exactly 1,678 responses, with no stderr. Initial measured aggregate time was 0.170 seconds, including startup and serialization. The first manual test mistakenly piped pretty-printed example.json directly to the line protocol; this was a test-input format error, corrected by compact JSON serialization.

Six complete deterministic local matches used the supplied 20 Hz simulator and independently authored opponents: tank-heavy capture/attack, raider-heavy capture/attack, and a stronger tank controller with focus fire, reload retreat, and a fourth worker. Final results in `test_results.txt`: wins in both seats against the first two, a west-seat win against the stronger controller, and an east-seat loss to it at 193.35 seconds. There were zero command rejections. These opponents are approximations for testing, not Sol's private strategy.

Exploratory variants included worker-first production, more permissive retreat thresholds, delayed northern scouting, and tank-vs-tank reload retreat. They did not solve the strong east-seat matchup and some worsened baseline games; retain conservative retreat and tank-first opening. `agent_original.js`/`agent_v1.js` preserve the initial candidate. `tune.py` preserves the exploratory harness; its original printed win count had incorrect field indices, since corrected. Read explicit seat and winner columns in `tuning_results.txt`, not its obsolete zero win counts. Final additional change funds the second queued tank at 160 credits instead of 320, improving the basic east-seat tank match from 227.40 to 196.15 seconds.

## Remaining weaknesses / next revision

The strongest local east-seat loss already has all three nodes enemy-owned and a 2119–1328 score deficit at 120 seconds. Inspect actual r1-g1/r1-g2 at 20–60 seconds next round: isolated capture casualties, tank arrival spacing, target overkill, and retreat cascades are likely important. Local strength estimates use circular proximity and do not predict enemy orders or firing events. Reservations approximate one shot without exact counter/splash damage. Distant scouting can be intercepted along the route despite a safe destination. Ten-command scheduling can starve lower-priority movement in large battles. Late-game behavior and 40-unit saturation are less tested than the opening and midgame. This entry has no reliable evidence of superiority over Sol yet; the real games are the next diagnostic.
