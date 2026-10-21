# Frontier RTS continuation, revision round 1 of 5

Submitted entry.json runs the persistent Node agent.js. This continues our own retained round-3 strategy, as required by SETUP.md. No browsing, downloaded engines, private opponent source or edits to protected files were used. incumbent_revision1.js and review_previous_series3.md preserve the incoming entry and notes.

## Latest public replay lessons

The twelve records are historical: six against Luna and six against Astra. The latest two were both losses against Astra. Public commands are evidence of battlefield behavior, not access to opponent implementation. Detailed selected snapshots and decisions are preserved in revision1_replay_lessons.json.

- history-run-20261014-224405-r3-g1: at 15 seconds we owned north and our southern node, with all four rifles alive. At 35 seconds all our rifles were dead; our first tank u15 had 321 HP at (662,473), while u19 was still at (460,479). At 45 seconds u15 had just 22 HP and u19 had 274 HP. Enemy tanks u16/u20 still had 89/264 HP, with a third arriving. Repeated losses exhausted our army despite an economic advantage: at 100 seconds we had 454 credits but only two tanks, versus three enemy tanks; at 140 seconds we had no combat units.
- The same game's decisions at 35–43 seconds show alternating reload retreats and pursuit orders. At 38 seconds u15 switched to pursuing u20; at 39 seconds both our tanks attacked u20 while it withdrew. Our 34-pixel retreat can finish before the next decision: a tank travels 37 pixels per second and arriving changes its order to hold, permitting automatic targeting. This is a concrete timing weakness, though the replay alone cannot establish every causal contribution.
- history-run-20261014-224405-r3-g2: at 25 seconds only one northern rifle remained, plus our home rifle and first tank. At 60 seconds our two forward tanks were near (553,510)/(515,466), but the next tank was at (862,470). At 80 seconds we held all three nodes, yet by 120 seconds only one combat unit survived. At 140 seconds our two tanks had 80/360 HP against four enemy tanks with 136/338/360/360 HP. Outpost income did not compensate for poor exchanges and separated reinforcements.

## Submitted changes

Retain tank-first production, four nearby workers, one opening home rifle and three north rifles, conditional central tank opening, upgrades, adaptive counters, worker protection, repairs and focus fire.

Two tactical changes address the replay failures:

1. Extend tank reload retreat destinations from 34 to 70 pixels. The existing cooldown threshold remains 1.05 seconds: movement is chosen when the tank cannot shoot during the next decision interval. The destination now normally lasts through that whole interval. Reconsider direction on the next observation.
2. Reduce explicit target pursuit allowance from weapon range plus target radius plus 55 pixels to plus 12 pixels. This reduces chasing withdrawing enemies beyond useful firing distance. Existing attackMove behavior still provides automatic engagement; this is not a strict guarantee that units never pursue.

Selected source is also preserved as revision1_longshort.js. No economy or opening changes were selected.

## Tests

All simulations use unchanged rules.js at 20 steps per second. Both agents choose from the same pre-command snapshot. Test opponents are self-authored policies and our own retained files.

- revision1_sweep.js: compared pursuit distance, support estimation, retreat timing/distance, tank-only production and objective priorities against the incumbent and southern sparring policy in both seats. The 70-pixel retreat won all four comparisons. Retreat alone regressed against east-seat basic tanks and mixed armor.
- revision1_refine.js and revision1_general.js: compared 50/100-pixel retreats, narrower pursuits, stronger cohesion and individual retreat commands. Narrower pursuits restored all six tank/armor/support wins while retaining four wins over incumbent/south. This evidence supports the two-change submission rather than retreat alone.
- Final test.js: 6/6 wins against rifle/tank/raider production; mirror diagnostics favor east at 235.55 seconds. Zero command errors.
- Final test_adversarial.js: 6/6 wins against north-first armor, direct raider rush and our old split-opening agent; zero errors.
- Final test_mixed_round3.js: 4/4 armor/support wins. Final incumbent/southern comparisons: 4/4 wins, at 223.15/174.55 seconds against incumbent and 178.40/202.85 against southern sparring. These suites total 20/20 non-mirror wins.
- Final test_series2.js: another 2/2 wins against our older current-series round-1 file. Also validates commands on all 2,085 playable public frames, advancing each copied state one second, with zero errors and a maximum of six commands. This establishes legality, not counterfactual replay wins.
- revision1_final_compare.js: 2/2 against retreat-only revision; 1/2 against the stronger-cohesion revision, losing east at 205.35 seconds. Keep this limitation visible rather than treating the selected suite as universally robust.
- revision1_validation.json: 2,185 timed calls including 100 calls on an 80-unit battlefield; mean 0.201 ms, maximum 4.991 ms. Persistent subprocess returned 13 parseable responses for twelve historical openings and one terminal observation, with empty stderr and successful exit.

## Remaining weaknesses and next-round notes

Objective changes and attackMove can still separate reinforcements. HP-based support approximates effective firepower poorly, and grouped movement offsets distort individual retreat directions. North rifles remain vulnerable to concentrated attacks; worker routing can stall when all mines are unsafe. The stronger-cohesion variant won an east comparison against this entry. Preserve revision1_longcohesion.js for future investigation driven by new replay evidence.

Results are deterministic, correlated local tests and do not estimate actual opponent win probability. The opponent may adapt. Retain revision1_sweep/refine/general/final_compare scripts and their JSON outputs, revision1_replay_lessons.json, revision1_validation.json, incumbent_revision1.js and all useful earlier notes for the next revision.
