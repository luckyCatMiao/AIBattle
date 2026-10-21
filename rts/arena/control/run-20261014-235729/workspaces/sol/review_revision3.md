# Frontier RTS continuation: revision round 3 of 5

Submission: entry.json launches persistent Node agent.js. This continues our own round-2 entry, saved as incumbent_revision3.js, with its notes saved as review_revision2.md. All supplied protected files remain unchanged. Analysis used public records and our own retained programs only; no browsing, downloads or private opponent code.

## Selected strategy

Keep tank-first production, four workers while nearby ore remains, rifle response to enemy raiders, early upgrades, split opening capture, worker safety, repairs and damage-aware focus fire. Change three details of tank reload micro:

- Issue each tank its own retreat destination. Previously approximate 70-pixel destination buckets merged tanks and the simulator applied formation offsets to a shared point.
- Retreat when more than 0.85 seconds remain on cooldown, versus 1.05 previously. Decisions occur once per second, so the old threshold often stopped retreating through most of the final reload second.
- Set a 50-pixel destination, versus 70. Tanks move 37 pixels in one decision interval; the shorter destination reduces continued displacement if a subsequent decision does not replace that move.

Keep the existing threat range and base-rush exceptions. These changes preserve production and strategic objectives. The submitted code differs from incumbent_revision3.js in just these three lines.

## Latest public replay lessons

Latest games were r2-g1, west loss at 229.35 seconds, and r2-g2, east win at 276.85 seconds. Extracted snapshots and commands are preserved in revision3_replay_lessons.json.

- r2-g1 at 70 seconds: front tank u23 had 208 HP at approximately (600,400); reinforcement u25 was at (446,486), while three enemy tanks had 181/248/360 HP. At 80 seconds u25 had 136 HP at (550,456), and u27 was roughly 200 pixels behind at (348,461). At 100 seconds only u29 remained, with 192 HP, against three tanks totaling 688 HP. Our 469 credits show that this was a combat and reinforcement problem rather than lack of money.
- r2-g1 at 149 seconds: the issued move grouped u37 and u33 at (546.87,239.60). At the 150-second snapshot, u33 had 2 HP at approximately (580,246), u37 had 338 HP at (569,266), and both had different formation-adjusted destinations derived from that single point. u35 was separately at (534,389) with 69 HP. At 151 seconds another shared retreat grouped u37/u33 at (531.96,223.22). Individual destinations remove this concrete approximation and formation-offset effect.
- r2-g1 at 160 seconds: u37 had fallen to 91 HP at (545,237), while u39 had 192 HP at (429,356). By 180 seconds no combat units remained and all outposts belonged to the enemy. Improving tank survival before this collapse is more useful than spending surplus credits on additional mining.
- r2-g2 at 60 seconds: u20 and u22, with 120/152 HP near (665,273)/(688,279), received a shared retreat. At 70 seconds u22 had only 29 HP at (709,223); u24 was isolated near (801,355) at 192 HP. Even the winning seat showed the same fragile front and delayed reinforcements.
- r2-g2 at 150–160 seconds: u32 survived with just 13 HP while moving north to capture; u38 remained healthy at north, and u36 fell from 259 to 35 HP nearer the southern fight. This is evidence of objective-induced separation that reload micro does not fully solve.

These are observed failures. Local tests support the selected revision but do not demonstrate a counterfactual win against the recorded opponent.

## Tests

All full simulations use unmodified rules.js, observations taken before either player's actions, and 20 physics steps per simulated second. Both seats are tested. Sparring policies are our own retained entries and self-authored variants.

- revision3_new_sweep.js / .json: ten candidates tested against incumbent_revision3, revision1_longcohesion and series3_southpure. Earlier reload thresholds and the individual 0.85-second candidate won 6/6. Tighter support and combined tighter-support/individual retreat won 4/6; forced reinforcement joining and north-only objectives won 3/6. This argues against bundling broad strategic changes into the submission.
- revision3_refine.js / .json: individual 0.85-second retreats won 8/10 against a harder set including support, joining and earlier-reload variants. The 0.65 threshold won 7/10; 1.25 won 2/10. The finefar row is a duplicate control: its replacement did not match the source, so it should not be interpreted as an independent range test.
- revision3_economy.js / .json: selected individual 50-pixel retreat won 10/10 against incumbent, tighter support, joining, earlier grouped reload and southern armor. It defeated incumbent at 283.60/254.70 seconds. Removing the fourth worker won 5/10; delaying it won 6/10; holding more upgrade cash won 9/10; 100-pixel retreats won 8/10; an actual wider threat range won 7/10.
- revision3_final_compare.json: selected policy won 5/6 against its 70-pixel parent, the upgrade-reserve variant and stronger-cohesion armor. One loss to the upgrade-reserve variant in the east seat remains a useful regression case.
- revision3_standard.json: 6/6 against rifle, tank and raider production. The mirror favored east at 284.95 seconds; seat asymmetry remains material.
- revision3_adversarial.json: 6/6 against north-first armor, direct raider rush and our older split-opening policy.
- revision3_mixed.json: 4/4 against mixed armor and tank/rifle support.
- revision3_validation.json: 2/2 against our older series policy. Commands applied legally to independent copies of all 3,231 playable public snapshots and then advanced one second, with zero errors and maximum seven commands. This validates realistic states, not replay outcomes.

Selected policy: 33/34 non-mirror full-game tests across its ten economy-sweep games, six final comparisons and eighteen general validation games. These deterministic and correlated matches do not estimate success probability against an adapting contestant. All candidate sweep games reported zero command errors.

## Protocol and response time

Persistent stdin/stdout validation returned 17 parseable responses covering all sixteen public openings plus a terminal observation, with empty stderr. Terminal observations return an empty command list. Across 3,331 timed calls, including 100 calls on an 80-unit battlefield, mean response was 0.140 ms and maximum 4.879 ms. The standard and adversarial tests also measured response maxima below 5 ms. entry.json is the required program-mode object, and agent.js exports choose for local tests while serving newline-delimited JSON when launched directly.

## Remaining weaknesses and next revision

HP-based support estimates still count allies that are not immediately able to fire. Outpost objective changes can spread tanks across north and south, and forward reinforcements still arrive singly. Individual retreat commands consume more of the ten-command budget in a large army. The earlier threshold can defer a shot becoming ready just before the next observation; enemy cooldowns are not used to decide whether that trade is favorable. Enemy raider micro remains a threat to tank-heavy production. The upgrade-reserve east loss shows the selected change is not dominant across all retained strategies.

Next revision should inspect whether the new public west game retains its tank line through 70–100 seconds, whether formation-free retreats preserve low-HP units, and whether tactical command starvation appears. Review the new games before adding more changes. Retain incumbent_revision3.js, review_revision2.md, revision3_replay_lessons.json, all r3_* candidates and revision3_* scripts/results. Earlier review and replay lesson files remain useful historical context.
