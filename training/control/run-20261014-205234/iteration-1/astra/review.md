# Astra iteration 1

## Evidence and concrete replay mistakes

Started from scratch: no previous_bot.py or previous engine was supplied. Read only this workspace and the public archive; no external engines, network sources, or other contestant files were used.

The archive contains 13 games but only **nine distinct complete move sequences**. Games b06a7b392044c7cc and 270c253fbc3a2dd9 duplicate 2854c6431a3427f1; f304783f359e1710 and 2dfe9305ab34185f duplicate 94a783909494e51c. Also, 65ab4d8089a3261f and 86c477fc4433b321 share their first 11 moves, so those openings are not independent evidence. There are no new Astra-versus-Sol games yet; these are observed mistakes in public games, not claims about my previous play.

* **2854c6431a3427f1, move 9:** Black C13 ignores White's I7–I9 open three. White I10 at move 10 creates two winning endpoints. Black I11 at move 11 blocks only one; White I6 wins. Defense must occur before the open four.
* **94a783909494e51c, move 8:** White J11 allows Black K11 to extend H8/I9/J10 into an open diagonal four. White L12 at move 10 leaves G7 winning. Block the developing diagonal earlier.
* **83478ee6ee2cac64, move 6:** White K8 continues its diagonal while Black H8/H9/H10 already threatens an open four. Black H7 makes White's move-8 H11 defense too late; H6 wins.
* **a6eeac560d4c9672, move 11:** Black E7 ignores White I7/I8/I9. White I6 creates an open four; Black I5 at move 13 leaves I10 winning. Earlier Black E8–H8 was only a single-ended four because White already occupied I8, so White D8 was sufficient there.
* **444b1e9b32845f68, move 12:** White I10 permits Black I7 at move 13, making the I7/H8/G9/F10 diagonal four. White J6 at move 14 leaves E11 winning.
* **c0456dbabc64e04d, move 9:** Black I6 ignores White H9/I9/K9, a broken three. White J9 creates an open four; Black G9 at move 11 leaves L9 winning. Gap threats must be recognized along with contiguous runs.
* **65ab4d8089a3261f and 86c477fc4433b321, move 10:** White J11 permits Black J8 at move 11 to create the G8–J8 open four. The different move-12 replies cannot save both ends. This is one shared tactical mistake.
* **6c44ab3e9c6c06c7, move 11:** Black I6 permits White L6 to extend I9/J8/K7 into an open diagonal four. Black F6 at move 13 leaves White H10 winning (M5 would also win). Black's earlier H5–H8 four was already sealed by White H4 and H9; it was no longer a forcing threat.

## Implementation

`entry.json` launches the original standard-library Python `engine.py`. It handles repeated JSON lines and flushes one legal coordinate response per request. No persisted cross-game state is required.

The evaluator examines every five-cell window through each potential move in four directions, with board edges treated as blockers. It detects immediate fives (including overlines), distinct winning endpoints, broken fours, open-three extensions, and cross-direction combinations. Incremental line codes and cached pattern evaluations make updates inexpensive. Immediate wins take priority over all defense, and a unique immediate opposing win forces its block. Two opposing immediate wins are recognized as lost unless we can win now.

Iterative-deepening negamax searches up to eight nominal plies, extending forced blocks and attacking threats at the horizon. Candidate ordering combines offense and defense, with up to 14 root moves and 7–9 internal moves. It searches within two squares of existing stones. A deadline of 4.35 seconds for a normal 5-second request returns the last completed iteration; board updates are restored even when interrupted. Opening Black plays H8.

## Validation

`test_engine.py` and `validation.txt` record the reproducible checks:

* All nine distinct final replay positions: engine chooses an actual winning move, checked using a separate contiguous-line scanner.
* Earlier defense tests at 2854c6431a3427f1 move 9, 94a783909494e51c move 8, 83478ee6ee2cac64 move 6, and c0456dbabc64e04d move 9: chosen defenses leave no opponent move that immediately creates two winning endpoints. This is a tactical property check, not just legality; it does not prove the whole game is saved.
* 86c477fc4433b321 move 11: finds the winning open-four attack.
* Synthetic unique broken-four block, edge five, and six-stone completion.
* Incremental evaluation matches fresh reconstruction after a move; undo restores the original state.
* Actual subprocess accepts two JSON messages and returns two valid responses without fallback.

Observed full-budget tactical decisions took at most about 4.35 seconds after engine construction; a separate fresh-process test including startup and JSON handling took 4.374 seconds, within a 5-second subprocess timeout. See validation output for completed depths and node counts. A short-budget self-play smoke test finished in 21 legal plies with a Black win (2.60 seconds total), saved separately in `selfcheck.json`; it is not evidence of competitive strength.

## Remaining weaknesses and future notes

Search is selective, not a full game-theoretic solver. Quiet defenses outside the candidate width, long forcing sequences, and some three-threat combinations can be missed. Open-three evaluation is a local heuristic; cross-direction double threes are not automatically treated as proved wins. The leaf score uses prospective move strengths rather than a fully calibrated positional evaluation. There is no opening book, transposition table, or explicit proof-number threat search. Self-play cannot establish strength against an independent opponent.

Next iteration: prioritize the two actual color-swapped Astra/Sol games, inspect the earliest irreversible tactical error, and retain those positions as regression tests. Track whether losses arise from candidate exclusion, horizon length, or evaluation before changing weights. Preserve immediate-win and gap-threat checks.
