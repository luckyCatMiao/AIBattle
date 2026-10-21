# Frontier RTS continuation — revision round 4 of 5

Submitted entry.json runs `node agent.js` as a persistent JSON-lines program. This continues our own revision-3 strategy, saved unchanged as incumbent_revision4.js; its review is review_revision3.md. Protected supplied files were only read. No browsing, downloads, engines, or private opponent code were used.

## Strategy and selected change

Retain tank-first serial production, four workers while nearby ore remains, rifles against raiders, upgrades, repairs, split opening capture, safe worker routing, damage-aware target selection, and individual 50-pixel reload retreats with the existing 0.85-second threshold.

Change the direction of those reload retreats: start with the vector away from the closest threat, then add a weight-0.8 unit vector away from each allied combat unit within 65 pixels. Normalize the result and use it to choose the existing retreat destination. This gives nearby tanks different escape directions and opens space against the 36-pixel tank splash radius. The change adds no commands, production costs, or persistent state. agent.js differs from the incumbent only in this retreat-vector calculation and comments.

## Specific public replay lessons

The latest public games were both wins: r3-g1 west at 197.05 seconds and r3-g2 east at 225.85 seconds. Wins still contain concrete inefficient engagements. Detailed selected frames and public decisions are saved in revision4_replay_lessons.json.

- r3-g1 at 60 seconds: tanks u21/u23 were only 24 pixels apart, with 120/360 HP. At 70 seconds they remained 23 pixels apart near (753,419)/(756,443), now with 5/274 HP. u21 was dead by 80 seconds and u23 had 130 HP. These positions expose both tanks to the same splash attack; the positions alone do not prove how much damage was splash. Previous individual destinations removed formation offsets but did not prevent clustering.
- r3-g1 at 100 seconds: u23/u27 were 33 pixels apart and u25/u27 were 32 pixels apart. At 150 seconds u33/u35/u37 formed three pairs at 24–35 pixels. The same spacing failure continued after the early battle, making reload-direction spacing a relevant repeated correction.
- r3-g2 at 80 seconds: u22/u24 were 23 pixels apart, with 189/226 HP. At 150 seconds u28/u30, u30/u36, and u32/u36 were each approximately 23 pixels apart. At 180 seconds nine allied tank pairs were within splash radius. More surviving armor creates more opportunities for avoidable splash exposure.
- Objective separation remains visible. In r3-g1 at 80 seconds u19 was near (722,501), u23 near (652,367), u25 near (638,309), and the next reinforcement near (344,395). At that decision u19 was ordered toward north. In r3-g2 at 60 seconds u20 held near (654,264), while u16/u22 fought around y=350–390. This makes HP-only local support optimistic. I tested objective changes, but their weaker local results did not support including them in this revision.
- The previous round's west collapse was improved in the observed results: unlike r2-g1's lone 192-HP tank at 100 seconds, r3-g1 retained four tanks totaling roughly 975 HP at 100 seconds. This is evidence to preserve the existing production and reload framework, not proof that the revision alone caused the win against an adapting opponent.

## Tests and selection

All full games use the supplied unmodified rules.js, both pre-command observations before applying either side's actions, 20 physics steps per decision interval, and both seats. All sparring policies are our retained programs or self-authored variants. Tests are deterministic, correlated selection evidence, not estimates of the probability of beating the unseen current opponent.

- revision4_sweep.js / .json: ten candidate/control rows, six games each, against incumbent_revision4, r3_upgrade and revision1_longcohesion. Selected spacing won 6/6. Control won 4/6 including one mirror win; shorter threat range and earlier 0.45 reload each won 5/6. Changing the all-owned fallback to the center won 3/6; stronger focus fire won 3/6; home fallback won 4/6. Zero command errors.
- revision4_refine.js / .json: seven spacing/refinement candidates, ten games each. Selected 65-pixel/0.8 spacing won 9/10 against incumbent, shorter threat range, earlier reload, upgrade-reserve armor, and southern armor. A 40-pixel radius also won 9/10, an 85-pixel radius 7/10, weight 0.4 7/10, weight 1.2 6/10, and combinations with earlier reload or upgrade reserve each 6/10. Selected variant's one loss was west against r4_reload45 at 304.15 seconds. Zero command errors.
- revision4_final_compare.js / .json: selected spacing won 11/12 against the 40-pixel alternative, tighter support, reinforcement joining, earlier grouped reload, fast kiting, and a southern concentration sparring policy. The 40-pixel alternative won 10/12. Selected policy lost its east head-to-head against the 40-pixel alternative at 302.40 seconds; it won west at 180.70. Zero command errors. These outcomes favor 65 pixels while demonstrating sensitivity to seat and small parameter changes.
- revision4_standard.json: 6/6 against rifle, tank and raider baselines. Mirror favored east at 229.05 seconds.
- revision4_adversarial.json: 6/6 against north-first armor, direct raider rush, and an older split opening.
- revision4_mixed.json: 4/4 against mixed armor and tank/rifle support.
- revision4_validation.json: 2/2 against our older series entry; commands applied to independent copies of all 3,655 playable public snapshots, then advanced one second, with zero errors and maximum seven commands. This checks legal behavior on realistic observations, not counterfactual public match outcomes.

After selecting the candidate, agent.js was reformatted with explanatory comments without changing calculations. The standard, adversarial, mixed, public-state and protocol checks above ran against that final file.

## Protocol and timing

entry.json contains {"mode":"program","command":["node","agent.js"]}. The agent reads one stdin JSON observation per line, writes one JSON response per line, logs exceptions only to stderr, and returns no commands for terminal states.

Persistent-process validation returned 19 parseable responses covering all eighteen public openings plus a terminal observation, with empty stderr. Across 3,755 timed decisions, including 100 calls on an 80-unit battlefield, mean decision time was 0.124 ms and maximum 4.782 ms. Standard and adversarial games also stayed below 4.2 ms maximum. Node syntax validation passed.

## Remaining weaknesses and next revision

The retreat vector can turn partly toward an enemy when several allies are behind the tank. It uses ally positions rather than predicted movement, and spacing affects only reload retreats, so attack/hold orders can still form splash clusters. Normalizing a nearly cancelling vector can yield an unstable direction. Stronger repulsion performed worse, so do not increase it without evidence.

Objective changes can still scatter armor and leave reinforcement gaps. HP-based local strength counts allies unable to fire immediately. Individual tank commands may compete for the ten-command budget in larger fights. The selected spacing lost one earlier-reload test and one alternative-spacing test, and mirror seat asymmetry remains substantial. Tank-heavy production can still be challenged by well-controlled raiders.

Next round: inspect the new games around 60–100 seconds for allied tank pairs within 36 pixels, whether reload spacing actually reduces multi-target hits, and whether it moves low-HP tanks toward enemy fire. Compare north/south separation before changing objectives. Preserve incumbent_revision4.js, review_revision3.md, revision4_replay_lessons.json, r4_* candidates, revision4_* scripts/results/logs, and earlier notes.
