# Astra iteration 2

## Evidence

Read RULES.md, my supplied engine.py and prior notes, and all 15 public records. There is no previous_bot.py. Preserved my iteration-1 engine and review as iteration1_engine.py and iteration1_review.md. No opponent implementation or external engine was used.

Deduplicating exact (color,x,y) sequences leaves **11 distinct games**, not 15 independent observations. b06a7b392044c7cc and 270c253fbc3a2dd9 repeat 2854c6431a3427f1; f304783f359e1710 and 2dfe9305ab34185f repeat 94a783909494e51c. The shared opening of 65ab4d8089a3261f and 86c477fc4433b321 is also correlated. Prior replay observations remain in iteration1_review.md.

The newest two games are both Astra losses:

* **ec2f009a1042efac, move 13 (Black G6):** the engine reported depth 1 and stopped as if it had proved a win. Replaying the actual position with the preserved engine reproduces a score of 9,999,994 at depth 1. The repaired engine scores the same root search at 2,262,023.886, below the mate threshold, and continues searching. Move 15 similarly stopped at depth 1 in the record. The old horizon could end on a mandatory block and evaluate an outstanding immediate win as an enormous positional score. That contaminated the search's terminal-score range. This is a demonstrated search/scoring failure; it does not prove G6 itself loses against optimal play.
* **ec2f009a1042efac, moves 28–36:** White K6 (28), Black L5 (29), White I4 (30), then the E4/D3 exchange and Black J4 (33) culminated in White L7 (34). L7 connects I4/J5/K6/L7 and leaves **H3 and M8** winning. Black H3 (35) can cover only one; White M8 (36) wins. An independent contiguous-line scanner confirms both endpoints after move 34. The failure occurs before the final forced block. I have not proved the earliest position in this game that is unavoidably lost or that the new engine saves it.
* **72ccfa4ccb489216, move 42 (White M6):** a concrete missed forcing sequence. Black can play **J6 (43), J7 forced (44), K9 (45), L10 forced (46), L9 (47)**, producing the two winning endpoints H9 and M9. White H9 (48) loses to M9 (49). The regression reconstructs this line and independently checks each defender's lack of an immediate counterwin, each unique forced block, and the final pair of winning cells. The revised engine chooses **J6 at move 42**, creating its own forcing threat and avoiding this demonstrated continuous-four refutation. No opponent continuous-four win is found after this replacement; this is not a proof that the entire position is saved.
* **72ccfa4ccb489216, moves 30 and 34:** short-budget revised searches prefer M5 over the recorded E9, and K9 over L6. These are exploratory differences, not proved improvements. In particular, L6 was NOT proved losing by the new continuous-four solver; a candidate rejection count must not be attributed to the recorded move without checking it explicitly.

## Implementation

entry.json selects the standard-library Python engine.py and the required persistent JSON-lines protocol.

1. Static evaluation is clamped to +/-3,000,000, safely below terminal scores near +/-10,000,000. A mandatory unique block is always resolved even at the extension boundary. Double-three heuristic moves are excluded from the horizon's four-only extension list.
2. Added a continuous-four proof search, up to twelve attacking moves. Every attack must create an immediate winning threat; the defender's immediate counterwin takes precedence, and otherwise its unique block is applied. Two distinct winning endpoints establish a win. Failure or timeout means unknown, never a proof of safety.
3. Before general search, allow up to 0.30 seconds for our forcing-four win. Then screen the normal fourteen root candidates for opponent forcing-four refutations, at most 0.065 seconds each and 0.85 seconds total. Exclude proved losses when at least one unrefuted candidate remains. If all are refuted, retain candidates to return a legal move.
4. Continue iterative deepening under the existing total 4.35-second search ceiling. Account for board initialization when passing the remaining request budget. Every speculative move is undone in finally blocks, including on timeout.

The existing local pattern evaluator, gap recognition, edge handling, incremental updates, and immediate-win priority are retained. No replay-specific opening moves were hardcoded.

## Validation

* `python3 test_engine.py` passes (`validation2.txt`): immediate wins in all eleven distinct replay endings, old tactical-defense tests, edge and overline cases, incremental-state restoration, and two messages in one live protocol process.
* `python3 regression2.py` passes (`regression2.txt`): reproduces the original false depth-1 mate, checks its removal, verifies the move-42 recorded refutation using an independent line scanner, tests the revised J6 defense against the continuous-four search, and runs a real move-13 request plus an empty opening through one fresh process. Total wall time for both responses was approximately **4.376 seconds**, under a five-second subprocess timeout.
* `tactical_review.py`/`tactical_analysis.txt` preserve the independently checked forcing sequence and explicitly record positions where no such proof was found.
* `budget_tests.py`/`budget_tests.txt` exercise five additional real positions through fresh entrypoint processes with five-second timeouts, including early opening, both latest games' middlegames, and Black's winning K9 at move 45 of the second game. All five passed; the slowest took 4.3743 seconds. At full budget move 34 selected J10, illustrating the timing/depth dependence. The test also independently checks the first game's final diagonal fork.
* `analysis.txt` and `analysis2.txt` retain short-budget before/after exploratory searches; their differing moves are not strength measurements.

## Remaining weaknesses / next iteration

Continuous-four search cannot prove plans requiring a quiet three, and its depth/time bounds can miss longer wins. Root screening checks only the usual fourteen candidates, and the general search still has narrow internal widths. An unrefuted move is not necessarily safe. The static evaluator and quiet-position strategy remain heuristic; the first game's earlier strategic failure is unresolved. Timing-dependent iterative deepening can change moves. No independent match-strength claim follows from these regressions.

Next time, inspect new competitive records before tuning weights. Preserve the mate-score separation and move-42 forcing-line test. Investigate multi-threat/quiet-three defense and the earliest recoverable position in ec2f009a1042efac; do not treat the final forced block as the original error. Keep exact duplicate records out of aggregate evidence.
