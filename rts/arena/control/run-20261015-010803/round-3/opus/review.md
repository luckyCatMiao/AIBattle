# Review: claude-opus-5-5, revision round 3

## Round 2 results (v2, now tools/agent_v2.py): lost both games
- **r2-g1 (I played east): lost by base destruction at t=219.**
  - The early skirmish decided it. From t=30 to 49 my 2 tanks went from 720 HP to 433 while sol's took little damage.
  - By t=76 it was 3 of my tanks against 5 of sol's.
  - At t=77–92 my "retreat" used `move`, so my tanks did not fire back while sol chased them. From t=79 to 99 I lost 4 tanks and sol lost none.
  - Sol then banked over 1000 credits, held all 3 outposts and pushed at about t=200.
- **r2-g2 (I played west): lost at t=170.** The same early trading loss happened at t=30–60, my 2–3 tanks against sol's 4–5. After that I never had more tanks than sol.
- **How sol fights (script over sol's commands in r2):**
  - In both games, 142 of sol's 142 `move` orders to combat units were given within 260 px of my units. Most of the ones checked came right after a shot, with fireAt−now between 1 and 2 s: the tank fires, steps back about 45 px while reloading, then returns. That is shoot-and-scoot.
  - 179 of its 215 attack orders targeted the nearest enemy unit; 137 were already in range. It also uses `attack` to walk to just inside range (range+r−3, about 171 px) of my nearest tank. Several of its tanks hit one of mine there, out of reach of my other tanks.
  - My v2 tanks stood still on hold and traded shot for shot, which loses against this.

## Changes (v3 = agent.py, copy in tools/agent_v3.py)
- **Scoot while reloading:** a tank that is reloading (fireAt−now > 0.9) and is within an enemy's range+30 steps 45 px away from the threatening enemies, leaning toward home. It does not do this within 200 px of its own base.
- **Ready tanks:** they attack the best target within range+30 px, or range+4 when the army is not being aggressive. Targets are scored by threat ÷ HP with a focus-fire bonus, and the score is reduced if the target is not yet in range.
- **Retreating:** retreat orders now use `attackMove` whenever enemies are near, so units shoot back on the way out. Units that have a target in range keep firing.
- Macro is the same as v2.

## Tests (tools/harness.js with the real rules.js)
| Match (west vs east) | Result |
|---|---|
| v3 vs v2 | v3 won by base destruction, t=226 |
| v2 vs v3 | v3 won by base destruction, t=149 |
| v3 vs solbot4 (solbot3 plus scooting) | v3 won, t=180 |
| solbot4 vs v3 | v3 won, t=408 |

- **Tank-first opening:** tried and dropped, because neither opening won from both seats in the mirror games.
- **Speed:** responses take at most about 25 ms. The output format checks out on example.json.

## Remaining weaknesses / notes for next time
- solbot4 is weak (v2 also beats it), so the local tests don't show how v3 does against the real sol. Next time, check r3 for the early fights at t=20–90.
- Units still bunch up and take full tank splash.
- Stepping back costs one command per tank, which can hit the 10-command limit with big armies; only the most threatened tanks get moved.
- Spare credits pile up because there is only one production queue.
