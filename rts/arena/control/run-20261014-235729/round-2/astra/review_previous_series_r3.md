# Frontier RTS revision 3: protect the opening force

Submission: entry.json launches node agent.js, a persistent JSON-lines program. Previous submissions and notes are preserved in agent_r1.js, agent_r2.js, review_r1.md, and review_r2.md. No external engine, network research, or private opponent source was used.

## Public replay diagnosis

Analyzed public_replays.json programmatically, extracting selected timestamps, unit states, and public commands. New-series round 2 again split by seat: r2-g1 (Astra east) lost at 237.40 seconds; r2-g2 (Astra west) won at 170.95 seconds. This is not evidence that the previous revision universally improved or failed.

* r2-g1 at 15 seconds: all four Astra rifles had already advanced to roughly (589–609,491–516), beyond their home southeast outpost, while the first tank was still at (1036,468). Sol held north and southwest; Astra held southeast. The infantry had outrun its armor.
* r2-g1 at 20 seconds: u11 had 86 HP and was retreating toward (1008,420), with fireAt still zero. u13 and u14 were holding near (531,517) and (553,509), also with fireAt zero. At 25 seconds only one rifle remained, with 21 HP. All rifles were dead by 35 seconds. Sending capture units across the map was providing enemy kills rather than useful early firepower.
* r2-g1 at 40 seconds: the first two tanks were separated around (738,445) and (760,360). At 45 seconds they had only 121 and 120 HP; their next reinforcement was still at (964,440). At 60 seconds Sol had level 2, while Astra had level 1 and 125 credits. Unlike the earlier upgrade-lock bug, this snapshot did not contain enough credits to upgrade. The opening resource/control deficit mattered.
* r2-g2 at 25 seconds: three surviving Astra rifles had 24, 71, and 26 HP, but had reduced Sol's first tank to 217 HP. The first Astra tank still had 360 HP at (586,470). At 35 seconds Astra reached level 1 before Sol. Thus the old opening could work from west, but the infantry losses were not equally productive in both seats.

## Selected strategy and exact change

Keep the tank-first opening, fourth worker, sustained tank production, weapon upgrades, repairs, safe-mine selection, tank reload movement, focused attacks, opportunistic captures, and eventual base assault.

For the first 20 seconds, the main force's strategic destination is its nearest southern outpost and capture missions are restricted to that same outpost. The normal local combat and retreat rules still apply. At 20 seconds the normal objective/scout selection resumes. This lets the first tank approach the initial infantry before their cross-map expansion. It also avoids relying on an east-only patch.

Only these two opening conditions differ from agent_r2.js. Do not mistake experimental files for submitted behavior. More aggressive preference for immediately reachable targets lost both seats against the old controller and was rejected. Changing the upgrade gate to time >28 did not improve the selected opening enough to justify another change. Holds of 25, 30, and 35 seconds were tested; 20 seconds did best in the paired comparison below. These are small deterministic local comparisons, not statistical proof of an optimal timing.

## Tests and measurements

* tuning_r3b.txt: selected home20 defeated agent_r2 in both seats (284 and 416 seconds), home25 in both seats (245 and 250), home35 in both seats (232 and 277), and the local focus/reload opponent in both seats (136 and 141). Zero command errors. The baseline mirror itself favors one seat, so paired comparisons matter.
* test_results_r3.txt: all 3,404 playing public-frame/seat combinations validated through rules.js, zero command rejections, no outputs above ten commands. Mean decision-function time 0.0216 ms; maximum 15.47 ms in that run.
* The same test file records six complete games against independently authored tank-pressure, raider-pressure, and tank focus/reload policies, both seats: six wins, zero command errors. Completion times were approximately 119/127, 100/113, and 136/141 seconds respectively.
* scenario_selected_r3.txt: sixteen continuations from the actual r1-g1, r1-g2, r2-g1, and r2-g2 states at 15, 40, 65, and 100 seconds. All won against the local focus/reload opponent, with zero command errors. The opponent is replaced in these tests: these do not show what Sol would have done. agent_r2 also won all sixteen; states after the opening intentionally follow unchanged logic. The tests are regression coverage, not claims of new midgame strength.
* transport_results_r3.txt: 3,404 sequential requests through the real persistent subprocess, valid JSON and <=10 commands each; no stderr and exit 0. Mean end-to-end response 0.179 ms, p99 0.377 ms, maximum 18.58 ms including startup. transport_r3.py reproduces this measurement.
* Read the supplied example.json and simulation source; the observed legal-command tests use actual game snapshots. entry.json retains the required program protocol.

## Remaining weaknesses and retained lessons

There are no official round-3 results yet. The opponent can adapt to the more conservative opening, particularly by taking north uncontested or pressuring the home outpost. A fixed 20-second release is a simple approximation to reinforcement readiness. Tanks can still split across objectives, scouts can switch assignments, and local power estimates omit weapon readiness and detailed geometry. The command budget may defer movement in large armies. The controller's safe mining can still lose workers when control collapses. Local benchmark opponents were beaten by the old entry too, so their success is limited evidence against the real opponent.

Keep the replay lesson specific: on east, at 15–25 seconds, the old rifles crossed the southern frontline before the first tank arrived and often died without firing. Future work should first inspect whether this hold actually fixes that timing against the official opponent. Avoid reintroducing the rejected global cohesion heuristic from round 2 without stronger evidence, and compare swapped seats for every tactical change.
