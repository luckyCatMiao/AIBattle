# Astra iteration 3

Read RULES.md, my existing engine and prior review, and the public records. No previous_bot.py exists. Preserved the prior submission in iteration2_engine.py and iteration2_review.md. Used only my supplied code and public records; no network or subagents.

## Replay evidence

17 records contain 13 distinct exact (color,x,y) sequences. The duplicate groups remain 2854c6431a3427f1 / b06a7b392044c7cc / 270c253fbc3a2dd9 and 94a783909494e51c / f304783f359e1710 / 2dfe9305ab34185f. Do not count these as independent evidence. Reviewed the newest pair in detail; both were Astra losses.

* c1ca491b0482e5f2, White move 14 J7: a demonstrated tactical error. Black I4 instead of the recorded G5 wins through a quiet threat followed by continuous fours. The old VCF solver returns no win here. The new solver finds I4, and regression3.py independently checks all 210 legal White replies: for each it validates a forcing-four continuation using a separate contiguous-line scanner, checking immediate counterwins, unique forced blocks, and terminal double winning cells. Revised full-budget play selects I5 at move 14, for which no opponent threat proof is found. This avoids the demonstrated refutation, without proving a game-theoretic save.
* c1ca491b0482e5f2, move 20 F6: Black I4 again proves a quiet-threat win. All nearby legal defensive candidates tested at this position were refuted; changing the last block is too late. After recorded move 22 J4, Black can win by J3, creating winning cells K2 and F7. The actual move 23 F7 likewise creates the final double continuation, followed by J3 (24) and E8 (25). Earlier moves must improve.
* 9c80ca79494320e9, move 9 L8: the old horizon evaluation forces Black to select a checking attack and scores the position -8539 at depth zero, whereas allowing a quiet static alternative gives +25891. These are heuristic scores, not proof L8 loses. Revised full-budget choices differ earlier: H6 at move 7 and K8 at move 9. This is a behavioral change, not a measured strength gain.
* 9c80ca79494320e9, White move 20 H7 establishes competing diagonal threats. Black's move 21 N8 forces M8 (22), but does not remove the loss: after M8 every one of Black's 203 legal replies admits a verified continuous-four win. In particular, recorded Black J9 (23) allows White I6 (24), with winning endpoints J5 and E10. Blocking I6 or E10 instead allows White J9, with endpoints F5 and K10. Independently validated the entire M8 certificate. Therefore blaming only Black's final block J5 (25) would miss the earlier failure. The exact earliest losing move remains unresolved.

## Changes

The standard-library Python entrypoint and persistent JSON-lines protocol remain selected in entry.json.

1. Added a sound, bounded proof search for one quiet attacking move followed by continuous fours. It examines up to ten promising attacks and checks EVERY legal defender reply, including distant counterattacks. A forced defensive block can also be the initial quiet move: this detects White M8 in the first game. Immediate wins take precedence. Timeouts and failed searches mean unknown, never safe.
2. Added a static alternative at non-forced quiescence nodes. Previously, any available forcing four made the search choose among attacks exclusively, even when all were worse than a quiet move. Mandatory blocks still extend. Static scores remain separated from terminal scores. The static alternative is heuristic, not a legal pass or a proof of safety.
3. Widened root search/screening from 14 to 24 candidates. Own threat proof gets up to 0.55 seconds; opponent screening gets up to 1.40 seconds total and 0.058 seconds per candidate. General iterative deepening uses the remaining budget. Overall search ceiling remains 4.35 seconds, with initialization accounted for against the request budget. Every speculative move is undone on timeout.

## Validation

* test_engine.py passes: actual immediate wins in all 13 distinct replay endings, earlier defensive cases, broken fours, edges, overlines, incremental restoration, and two requests in one persistent process. See validation3.txt.
* regression3.py independently validates the I4 and M8 quiet-threat certificates, rather than testing legality alone. It also checks proof-timeout state restoration.
* Eight representative real positions are tested through fresh entrypoint subprocesses with five-second timeouts, including both newest openings/middlegames, move 14 of c1ca491b0482e5f2, and the prior iteration's move-42 regression in 72ccfa4ccb489216. Outputs are legal and have no fallback errors. Results and measured wall times are in regression3.txt. Typical full-budget responses take about 4.37–4.40 seconds.
* The prior move-42 continuous-four defense remains J6. The stronger solver finds a quiet-threat loss even there; the previous claim of no VCF remains the regression requirement, not a claim of safety. A final regression exposed a fallback issue when every candidate has a quiet-threat refutation: the engine now prefers candidates without a continuous-four refutation before falling back to all candidates. Positions already tactically lost may retain a proved-losing move when every screened candidate loses; this is explicitly visible in the move-20 test.
* analysis3.txt preserves threat findings on the recorded moves. inspect3.txt preserves the earlier VCF-only candidate survey. Timing-dependent search can change choices; none of these tests establish overall match strength.

## Remaining weaknesses and future notes

The quiet-threat proof permits only one quiet move before continuous fours, so it misses deeper quiet plans. Candidate attacks, VCF depth, and runtime are bounded. General search still prunes internal move widths, and root screening covers only 24 candidates. Static evaluation can misjudge longer-term initiative. A failed proof is unknown. The first game's loss before the final fork remains strategically unresolved.

Next iteration: focus on new competitive records and the earliest recoverable position, preserve both exhaustive quiet-threat certificates and the earlier J6 defense, and consider deeper threat search or better move ordering before increasing arbitrary evaluation weights. Historical scripts using r[-2]/r[-1] are tied to their old archive size; use explicit game IDs in future regression work, as regression3.py does.
