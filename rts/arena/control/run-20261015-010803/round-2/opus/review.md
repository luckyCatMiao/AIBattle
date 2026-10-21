# Review: claude-opus-5-5, revision round 2

## Result of round 1 (v1, mass tanks, tools/agent_v1.py)
- **r1-g1 (sol west, I was east): lost by base destruction at t=168.** The forces were even (8 tanks vs 9). At t=115–145 I advanced from x≈1020 to x≈775 and lost the fight 8→0 while sol kept 8. Sol micro-manages: when a tank is targeted, sol `move`s it away (kiting). My `attack` orders and 60 px "reach" made my tanks chase that target into sol's formation one at a time.
- **r1-g2 (I was west): lost on score, 1313 vs 5092.** At t=97–108 my tank u23 chased alone toward sol's held group at (630,260) and died. My army then switched between hold and attack and walked away while under fire, going from 7 tanks to 3. After that sol held all 3 outposts until t=600 (+9 cr/s, +6 score/s).
- **The economic cause:** the home mine (2200 ore) runs out at t≈140. After that my 4 workers took ≈6 ore/s from a far centre mine. My income fell to about a tank every 19 s, while sol stayed capped at one per 12 s and banked 5000 credits.

## Changes (v2, agent.py)
- **Micro:** units shoot only targets already in range (range + radius); they never chase. Sol's kiting no longer drags my units forward. In a fight, units with no target in range `stop` (hold position). If the local strength ratio is ≥1.05 they attack-move together instead.
- **Local strength ratio:** computed from enemies within 260 px of my army. My army retreats to the home turret only when this ratio is below 0.6. That makes the decision steady instead of flipping every second.
- **Positioning:** the army waits at my own-side outpost, not at home, so it earns control score and protects the far mine. It takes the next outposts at a global ratio above 0.95 (keeps going while above 0.85). It pushes the base at ratio >1.6 with ≥8 units, at >1.35 with ≥14, or at 38+ population.
- **Economy:** when the home mine falls below 400 ore, the agent builds up to 7 workers and sends them to the mine nearest my outpost. Workers within 190 px of enemy combat units run home.

## Tests (tools/harness.js, the real rules.js)
- **tools/solbot3.py:** a new, closer copy of sol. It masses tanks, camps the outposts, focus-fires in range and kites damaged tanks.
- **Results** (base destruction unless stated):

| Opponent | v2 west | v2 east |
|---|---|---|
| solbot3 | won, t=206 | won, t=231 |
| solbot | won | won |
| v1 | won | lost |

- **Before tuning:** v2 with a 1.2 attack threshold sat in hold and lost to solbot3 on score as east. Lowering the thresholds fixed that.
- **Protocol and speed:** checked on example.json. The longest decision took about 25–35 ms.

## Remaining weaknesses / next round
- My copies of sol are only approximations. Check the real r2 games for fight outcomes at equal tank counts.
- Credits still pile up once income is above about 13 cr/s, because there is only one production queue. There is nothing useful to spend them on beyond repairs.
- I don't spread units out to reduce tank splash damage, and my damaged tanks don't kite.
- The losing mirror game against v1 suggests v2 can still lose an even fight where v1 goes all-in.
