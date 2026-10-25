# Frontier RTS continuation — final revision 5 of 5

entry.json submits the persistent `node agent.js` program. This continues our own revision-4 entry, preserved as incumbent_revision5.js, with its notes in review_revision4.md. I read SETUP.md, RULES.md, rules.js and example.json and analyzed public_replays.json with scripts. Protected files were not modified. No browsing, downloaded engines, private opponent code, or other contestants' files were used.

## Strategy and final change

Keep tank-first production, four workers while nearby ore remains, rifle counters against raiders, upgrades, repairs, split opening capture, safe worker routing, damage-aware focus fire and 50-pixel individual tank retreats during reload. Preserve the 0.85-second reload threshold and spacing away from allies within 65 pixels, weighted 0.8.

Correct the retreat direction when ally repulsion reverses it toward the closest threat. Compute the dot product of the combined retreat vector with the vector away from that threat. When negative, remove the inward component and add 0.25 times the unit vector away from the threat, then normalize as before. This retains lateral spacing while ensuring a positive outward component before map clipping. It needs no extra commands or memory. agent.js differs from incumbent_revision5.js only in this direction guard and its comment.

## Concrete public replay lessons

The latest games were wins: r4-g1 west at 252.10 seconds and r4-g2 east at 186.40 seconds. These games still expose mistakes worth correcting. Selected units and commands are preserved in revision5_replay_lessons.json; inward-movement analysis is in revision5_inward_retreats.json.

- r4-g1 at 70 seconds: u23 had 125 HP, while u25 was still near (446,486), behind the fight. At 80 seconds, u23/u25 had only 13/114 HP and u27 was near (348,461). Enemy armor had about 770 combined HP. Spaced armor can still feed into battle sequentially; HP-based local support does not capture reinforcement delay.
- r4-g1 at 166 seconds: u37 at (672.19,315.10) received a reload move toward (641.84,354.83), pointing partly toward the nearest threatening tank u40 at (774.27,472.73). The vector dot product was -3163.84. Running the selected policy on that same observation changes the destination to (622.30,318.43), with positive dot product 4567.87.
- r4-g2 at 127 seconds: u30 at (651.82,281.04), with 360 HP and two seconds of reload, moved almost straight south to (652.15,331.03). Enemy tank u33 was southwest at (539.47,412.18): the retreat pointed inward, dot product -6520.07. The selected guard instead sends u30 to (698.07,300.03), dot product +2705.28.
- r4-g2 at 142 seconds: u30, now at 248 HP, again received an inward spacing retreat toward (541.67,282.16), relative to enemy u33 at (433.72,375.82). Re-evaluating that observation changes the dot product from -5540.54 to +2368.81. These checks demonstrate the corrected geometry, not the counterfactual game outcome.
- Earlier spacing improvements remain valuable: r4-g1 had no allied tank pairs within 36 pixels at the sampled 50,60,70,80,90,100,120-second frames. r4-g2 also had none at 60–100 seconds. Clustering returns while holding objectives: at 120 seconds in r4-g2, four tank pairs were within splash radius. Retain reload spacing rather than reverting it.

## Tests and selection

Full games use the unmodified public rules.js, both pre-command observations, 20 physics steps per decision, and swapped seats. Sparring agents are our retained entries and self-authored variants. Deterministic, correlated local games support selection; they do not estimate the chance of beating the unseen adapting opponent.

- revision5_sweep.js / .json: ten candidate/control rows, six games each against the incumbent, 40-pixel spacing, and an earlier upgrade policy. Selected direction guard won 5/6; control 4/6. Timed retreat lengths won 2/6, timed retreats with earlier reload 0/6 or 2/6, ready-enemy-only retreats 1/6, shorter retreats 0/6. No command errors. Shorter reload travel was therefore rejected despite its plausible firing-time benefit.
- revision5_refine.js / .json: eight candidates, ten games each against the incumbent, alternative spacing, earlier reload, southern concentration, and longer cohesion policies. Selected guard won 9/10; control 8/10. Weighted enemy avoidance and two direction-cone alternatives also won 9/10. A stricter cone and weaker repulsion each won 6/10; smaller spacing radius won 8/10. All error counts were zero.
- revision5_compare.js / .json: selected guard won 9/12 against weighted avoidance, a direction cone, early reload, tighter support, reinforcement joining and fast kiting. Weighted avoidance won 8/12 and the mild cone 9/12. Prefer the minimal guard because the tied cone changes additional directions without demonstrated benefit. Selected guard lost west against weighted avoidance (267.90 seconds), the cone (227.80), and earlier reload (304.15); these losses remain material limitations.
- revision5_standard.json: 6/6 against rifle, tank and raider baselines; mirror favored east at 244.65 seconds. Zero errors.
- revision5_adversarial.json: 6/6 against north-first armor, direct raider rush and an older split opening. Zero errors.
- revision5_mixed.json: 4/4 against mixed armor and tank/rifle support.
- revision5_validation.json: 2/2 against an older series entry. Applied commands to independent copies of all 4,095 playable public snapshots, then advanced each one second: zero errors and maximum seven commands. This checks realistic observation handling and legality, not altered historical match outcomes.
- revision5_direction_checks.json: re-evaluated the three concrete inward retreats above with both incumbent and final entry. Each selected destination has a positive outward dot product.

## Protocol and response time

entry.json is {"mode":"program","command":["node","agent.js"]}. The process reads stdin JSON lines and writes one JSON response per line; diagnostics go to stderr. Terminal observations produce an empty command list. Node syntax validation passed.

Persistent-process checks produced 30 valid responses covering all twenty public openings, the supplied example, eight midgame observations from the latest games, and a terminal state. Stderr was empty. Across 4,195 timed decisions, including 100 calls on an 80-unit battlefield, mean computation was 0.118 ms and maximum 5.933 ms. Standard/adversarial games also stayed below 4.3 ms maximum. This is comfortably below the response limit; tactical quality remains the objective.

## Remaining weaknesses and preserved notes

The guard protects only the closest threat and current positions; lateral movement can approach a different enemy. Boundary clipping can reduce the outward component. Holding/attacking tanks still cluster because spacing applies only during reload. One-second decisions can miss firing opportunities, but tested shorter/timed movement performed worse. Objective changes can still divide armor, and HP-based support overestimates allies that cannot shoot promptly. Individual movement commands may compete for the ten-command budget in larger fights.

West remains vulnerable in several local matchups and mirror games. Tank-heavy production may lose to stronger raider control. Winning the two latest public games does not prove that this small final change will beat an adapting opponent.

Preserve incumbent_revision5.js, review_revision4.md, revision5_* analyses/tests/results/logs, r5_* candidates and earlier notes. A future revision should measure enemy-ready incoming damage during inward/lateral retreats, reinforce the early west fight without sacrificing north income, and test spacing while holding outposts. Do not shorten reload retreat distance or increase repulsion merely on intuition: those changes lost local games.
