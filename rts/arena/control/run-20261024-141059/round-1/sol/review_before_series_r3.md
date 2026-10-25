# Frontier RTS — current series revision 2 of 3

Submission: `entry.json` runs the persistent `node agent.js` program. Continue our retained incumbent, archived as `incumbent_series_r2.js`; earlier notes are preserved in `review_before_series_r2.md`. I read SETUP.md, RULES.md, rules.js and example.json and analyzed all 24 public games with scripts. No protected inputs were edited, no external engines or browsing were used, and no private opponent source was accessed.

## Selected strategy

Keep tank-first production, four workers while nearby ore remains, rifle production against raiders, upgrades, repairs, split opening captures, safe worker routing, damage-aware focus fire, and individual reload retreats with the existing outward-direction guard.

Change the local allied support radius from 250 to 140 pixels. Enemy pressure is still measured within 250 pixels. The existing retreat condition remains enemy power greater than 1.65 times nearby allied power, with base support and proximity safeguards unchanged. This prevents a forward unit from counting distant reinforcements at full strength when deciding whether to remain in a fight. It affects combat units of every type. Production, targeting and reload geometry remain the retained policy.

The final source differs from the incumbent by that single radius change. Prefer this modest change over the more complicated predictive retreat candidate because it held up better in the broader comparison.

## Concrete replay lessons

Current-series games were both wins: r1-g1 west destroyed the enemy base at 168.40 seconds; r1-g2 east won the score comparison at 600 seconds. These wins do not establish that the policy will beat an adapting challenger.

- r1-g1, 20 seconds: we already owned north and west-south outposts. At 60 seconds we owned all three. Preserve the split opening and tank-first production; abandoning the initial central tank route performed poorly locally.
- r1-g2, 180 seconds: we had twelve tanks, approximately eleven clustered near the northern objective, while the enemy had seven tanks. Both bases remained at 1700 HP. At 300 seconds the armies were 22 versus 14 tanks, and at 500 seconds 36 versus 23. Our conservative rush threshold never triggered. This is a lost opportunity to finish earlier, though preserving all outposts secured the score win. Central and forward staging alternatives did not improve overall local results, so the submission preserves this conservative behavior.
- r1-g2, 25 seconds: u16 was at (659.43,471.51), with 360 HP. The prior support estimate counted rifle u11 at 148.87 pixels and u12/u13 at 225.50/235.17 pixels as full support. The new policy orders withdrawal toward reinforcements instead. This demonstrates the changed support calculation; it does not prove a better outcome at that moment, since the nearest listed enemy was still about 203 pixels away.
- history-run-20261014-235729-r5-g1, 47 seconds: tank u19 had 264 HP at (661.38,421.50). Its only close ally, u15, had 49.8 HP at distance 25.94. The old calculation also counted full-health u21 at distance 226.46. Enemy u16/u20/u22 contributed 360/153.6/360 HP within 250 pixels. The old entry ordered u19 to attack u16; the revision instead orders withdrawal toward u21. At 48 seconds u15 had 30.6 HP and u19 216; at 49 seconds u15 was gone and u19 had 148.8 HP. The old policy overestimated immediate support during this losing exchange.
- history-run-20261014-235729-r5-g2, 53 seconds: u16/u20 had only 116.8/304 HP together; full-health support was over 223 pixels away. The revision similarly withdraws instead of maintaining u20's attack. Re-evaluations are preserved in `series_r2_lessons.json`, including positions, commands, distances and HP.

## Selection tests

All complete games use the unmodified rules.js, common pre-command snapshots, twenty physics steps per decision, and both seats. Opponents are our own archived programs, self-authored variants and simple baselines. Deterministic local results are correlated selection evidence, not estimates against the unseen challenger.

- `series_r2_sweep.json`: seven candidates, six games each. Control won 3/6; central staging, forward staging, stronger focus and damage-weighted splash each won 3/6. Broad idle spacing won 2/6; later reload retreat won 1/6. Rejected them.
- `series_r2_refine.json`: seven candidates, six games each. Selected 140-pixel support won 4/6; 180-pixel support 2/6; a lower retreat threshold 0/6; distance-weighted support 1/6; abandoning the initial central route 1/6. Three-worker armor and earlier upgrades each won 3/6.
- `series_r2_micro.json`: six candidates, six games each. Predictive retreat plus 140-pixel support won 5/6, but predictive retreat alone only 1/6. Other support radii and higher retreat priority won 3/6; central staging plus selected support won 2/6.
- `series_r2_compare.json`: twelve additional games per finalist against reinforcement joining, tighter support, fast kiting, direction cones, smaller spacing and an older entry. Control and selected support each won 11/12; predictive retreat plus support won 9/12. Combining the initial common opponents and this broader comparison, selected support won 15/18, control 14/18 and predictive support 14/18. Selected support still lost west against weighted retreat and smaller spacing, and east against earlier reload. Keep these weaknesses explicit.
- `series_r2_standard.json`: 6/6 against rifle, tank and raider baselines. The mirror favored west at 227.60 seconds; the incumbent mirror had favored east. Seat sensitivity remains substantial.
- `series_r2_adversarial.json`: 6/6 against northern armor, direct raider rush and an older split strategy.
- `series_r2_validation.json`: 2/2 against an older series entry. Applied the selected commands to independent copies of all 5,454 playable public observations and advanced each copy one second. Zero command errors; maximum seven commands. This validates handling and legality, not counterfactual historical outcomes.

## Protocol and timing

Node syntax check passed. The persistent process produced 34 JSON responses for all public openings, the supplied example, recent midgame observations and a terminal observation. Stderr was empty. Across 5,554 timed calls, including 100 calls on an 80-unit battlefield, mean computation was 0.103 ms and maximum 5.048 ms. Separate full-game baseline checks recorded a maximum of 13.781 ms, comfortably below the response limit. No test exceeded the ten-command budget.

## Remaining weaknesses and next-round notes

The 140-pixel support cutoff is abrupt and uses HP rather than firing geometry, cooldown or actual reinforcement arrival time. It can retreat unnecessarily from opponents outside immediate firing range. Tank reload movement can still approach a second threat; predictive multi-threat movement looked promising in a small sweep but lost additional east games in the broader comparison. Holding tanks cluster and the objective selector can send forces back and forth. All-outpost ownership can stall a winning army until score settlement. Individual retreats compete for command slots in larger fights.

Preserve the incumbent, prior review, all `series_r2_*` analyses/results/test scripts and `sr2_*` candidates. Next round, compare the new public games specifically around 25–60 seconds, checking whether closer support improves survival without surrendering north. Measure unnecessary retreats and objective ownership, rather than assuming a better mirror result generalizes. Consider a support estimate based on whether each ally can actually shoot the same threat, but test it against both seats before replacing the simple cutoff.
