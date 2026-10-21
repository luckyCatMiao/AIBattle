# Review — claude-opus-5-5, revision round 1

## Strategy (agent.py, program mode, ~1 ms/decision)
- Economy: 4 workers on the home mine (3 later), passive income plus outposts. Production time (≈12.5–13 cr/s per serial queue), not credits, is the real bottleneck, so extra workers are wasted.
- Army: tanks only, with weapon upgrades 1 and 2 as early as possible. Opening: the 4 rifles go to *my* side outpost (not the contested north one).
- Macro: a Lanchester power ratio (hp × counter-adjusted dps × upgrade level) with hysteresis. Enter attack at ratio >0.9 and keep attacking while >0.8; push the base at ratio >1.5 (≥7 units) or >1.3 (≥12 units), or near the unit cap. Otherwise hold at a staging point beside the base. Any enemy army within 330 of the base triggers defend.
- Cohesion: if the army is spread over more than 130 px, regroup on the centroid before moving on.
- Micro: each unit attacks the best target in reach (counter multiplier × threat / hp). Units sharing a target are batched into one command to fit the 10-command budget. Base siege spot is 186 px from the enemy base: tank reach 160+32 beats turret reach 170+14.

## Replay lessons (public history)
- Sol, the incumbent, plays mass tanks, 4 workers and upgrades at ~36 s and ~60 s. It micro-manages tanks one at a time (damaged tanks retreat, single tanks are sent to outposts). Examples: history-…235729-r5-g2 t=59–135 and r5-g1.
- Astra mirrored with tanks and won when it out-massed sol (235729-r5-g1: sol lost tanks piecemeal; by t=180 its base was at 868 HP with 1 tank). Lesson: never trickle units in one by one.
- Luna (221815-r1..r3) mixed rifles/raiders and attack-moved units one at a time, and lost every game by about t=130–150. Rifles are tank food.
- My own tests: the "counter table" is misleading. The rules.js fight sims (tools/fight.js) gave: 15 raiders lose to 10 tanks (equal build time), 3 raiders lose to 2 tanks, and 24 rifles lose to 10 tanks. This is because of splash and range. So: tanks.
- First version mistakes in self-play vs tools/solbot.py: it banked 1000+ credits with 6 workers and raiders, sat in "hold" all game and lost about 1900–5900. A too-conservative attack threshold (1.2) gave a passive standoff, and the opponent won on outpost time. Lowering it to 0.9 with cohesion → base-destruction wins in both seats (t=386 west, t=596 east).

## Tests
- tools/harness.js runs a full game against rules.js with two stdin/stdout agents. tools/solbot.py approximates sol. Final: win/win by base destruction. Max decision round-trip is about 20 ms.
- Protocol was checked on example.json and on 40 replay frames (with yourPlayer patched in).

## Weaknesses / next round
- solbot is only an approximation: the real sol does per-tank retreat micro and may trade better. Look at r1-g1/g2 to see if mirror fights are lost on focus fire or on timing.
- The power ratio is global, not local. Damaged tanks don't retreat. Splash avoidance (spacing) isn't handled.
- Ideas: retreat tanks below 30% HP, prefer fighting inside base turret range, time the push for right after upgrade 2.
