# Continuation series, revision 1

entry.json runs node agent.js. This continues our previous series final controller; incumbent.js preserves that exact entry, and review_previous_series_r3.md preserves its notes. No external sources or opponent code were accessed. Read SETUP.md, RULES.md, rules.js, example.json and analyzed all twelve public game records with scripts.

## Replay lessons

Latest records: history-run-20261014-224405-r3-g1 (Astra east, win at 164.65 seconds) and history-run-20261014-224405-r3-g2 (Astra west, win at 217.05). The opening hold worked: at 20 seconds both games retain all four rifles at full health, with the first tank nearby. Previously the east infantry crossed prematurely and died before support. Keep the 20-second opening.

Concrete remaining capture mistake: in history-run-20261014-224405-r3-g2 at 114 and 115 seconds, our u32 holds at approximately (577,212), 74 pixels from north n0, which is enemy-owned, uncontested, and has zero capture progress. No enemy combat unit is within 220 pixels of the node. The old fourth-tank formation slot is 60 pixels horizontally and 40 vertically from the objective: outside capture radius 65. In history-run-20261014-224405-r3-g1 at 132 seconds, u32 similarly holds approximately (456,468), 69 pixels from enemy southwest n2, with zero capture progress and no nearby enemy. Later ranks can be even farther away. This wastes uncontested income and delays territorial control.

An initial suspicion about the west game's tank u21 at 60 seconds was checked: although it is full health and has never fired at (612,213), it IS capturing north (progress 0.825). That is useful work, not proof that every detached tank should regroup. A tested generic reinforcement rule failed one seat against the incumbent and was rejected.

## Selected strategy and change

Retain tank-first production, fourth worker, two weapon upgrades, repairs, focused fire, tank reload retreats, opportunistic rifle captures, safe mining, and superiority-based base assaults. Change only the tank formation's horizontal rear-rank offset: formerly floor(k/3)*35, now min(1,floor(k/3))*20. Together with the 25-pixel near-side offset and three 40-pixel-spaced lanes, commanded capture positions are at most sqrt(45^2+40^2), about 60.2 pixels from the node. This leaves a small margin within radius 65. Physical separation and actual combat can still move tanks outside it.

Five candidates were tested: this bounded spacing, reload threshold 0.95, generic reinforcement support, narrower capture lanes, and earlier upgrade eligibility. The bounded spacing was the only candidate to beat both retained comparison controllers in both seats. Keep the current reload and upgrade behavior; do not confuse experimental new_*.js files with the submitted agent.

## Tests

- revision_bench.txt: selected new_capfix defeated incumbent.js in west/east at 233/283 seconds, and agent_r2.js at 295/345 seconds. Zero command errors. revision_repeat.txt reproduced the results. These deterministic tests are narrow evidence, not forecasts against the adapting official opponent.
- revision_tests.txt: 4,170 playing replay observations, both seats across all twelve games, checked through actual rules.command. Zero rejected commands and no command budget violations. Mean decision time 0.0179 ms, maximum 2.10 ms.
- Same test: six full games against locally authored tank pressure, raider pressure, and tank focus/reload policies, both seats; six wins, zero command errors.
- revision_scenarios.txt: 24 continuations from the six latest-series public games at 15, 40, 65, and 100 seconds; all won against the local focus/reload policy, zero command errors. Incumbent also wins all 24. These replace the opponent and establish regression coverage, not official counterfactual results.
- revision_transport.txt: 4,170 requests through the real persistent stdin/stdout process, valid JSON, <=10 commands, no stderr, exit 0. Mean round-trip 0.163 ms, p99 0.295 ms, max 24.61 ms including startup, well within one second.

## Next revision / weaknesses

Inspect actual official results for capture timing and army dispersion. Bounded rear slots can bunch large armies, increasing tank splash risk; three lanes and soft separation do not guarantee safe spacing. Tanks still switch objectives and can retreat separately. Focus-fire reservations approximate damage and do not fully model readiness. Workers remain vulnerable when map control collapses. North is often conceded early; do not sacrifice the successful opening hold without paired evidence. The two latest historical wins do not establish robustness against the opponent's next revision. Keep incumbent.js as a reference and prioritize official replay evidence over local win counts.
