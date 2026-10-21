# Sol iteration 2

## Public evidence and concrete mistakes

Read RULES.md, our own previous_bot.py and engine.py, and all nine public move lists. Games 0/2/4 are exactly one sequence; games 1/3/5 are another. Together with the human game and the two iteration-1 games, there are five distinct sequences. Sol won both new games, so there is no new recorded Sol loss. The evidence remains too narrow to infer general strength. previous_bot.py is untouched; the previous review is preserved in review_iteration1.md.

* Earlier Luna-black games: Sol must fill the broken diagonal four at (5,9) on ply 8. Luna's subsequent (2,12) extends a blocked line instead of restraining Sol's vertical three. Sol creates an open four; blocking one endpoint is too late.
* Earlier Sol-black games: Luna's (9,10) on ply 8 fails to restrain the diagonal three through (7,7), (8,8), (9,9). Sol's (10,10) produces two winning cells.
* Human game: after ply 5, black's vertical three at x=7 requires preventive defense. White's ply-6 (10,7) counterattack does not force a reply. After black's (7,6), white cannot save the position by blocking just (7,10). The engine still defends earlier at (7,10).
* New game a6eeac560d4c9672 (index 7): Sol's ply-6 (7,6) leaves black the forcing (4,7), obliging Sol to block (3,7). This costs a defensive tempo, although the record does not establish that (7,6) is losing or incorrect. Black's decisive error is ply-11 (4,6): white already has the open vertical three (8,6), (8,7), (8,8). White's (8,5) creates winning endpoints (8,4) and (8,9); black's one-end block at ply 13 cannot save it. The revised search chooses (7,9) after ply 5 in the local test; that variation is not a proven improvement.
* New game 444b1e9b32845f68 (index 8): after Sol's ply-9 (5,9), the black diagonal (5,9), (6,8), (7,7) is open. White's (9,4) makes a closed four and forces the correct black block (10,3), buying one tempo. White must then restrain the black diagonal. Its ply-12 (8,9) leaves both extensions available. Black's (8,6) makes an open four with endpoints (4,10) and (9,5), and white's (9,5) only delays the win. A forcing counterattack is useful only while it forces replies; the threat remains after the forced block.

## Changes implemented

entry.json selects the persistent standard-library Python engine: {"mode":"program","command":["python3","engine.py"]}. Every input line yields a flushed JSON move. Authoritative input boards rebuild state each turn.

1. Recognize exact double continuations at the root and inside negamax. A move producing an open four or two independent fours has at least two distinct next-turn winning cells. If the enemy has no immediate win, this is a forced win, rather than merely a large positional score. Immediate own wins and mandatory enemy-win blocks still take precedence. Double threes remain heuristic.
2. Add bounded threat search at the depth boundary. Search our forcing fours beyond the nominal horizon; when the opponent can create two winning continuations, search defensive replies instead of immediately evaluating the position. At ordinary quiet leaves, retain a static baseline as a selective approximation. Four extra plies bound this search. This reduces the risk of evaluating a position just before the opponent makes an unstoppable four.
3. Save affected score cells during make and restore them directly during unmake. Previously both operations recomputed patterns. Nested restoration now avoids redundant evaluation and leaves more time for search. Board/neighborhood state and score snapshots unwind through finally blocks on timeout.
4. Cap the initial forcing-four proof attempt at 0.65 seconds. An unsuccessful proof search must leave time for ordinary defensive search. The overall 4.4-second deadline remains, with the last completed iteration and a legal ordered fallback available.

No opponent implementation, downloaded engine, network access, or subagents were used.

## Validation and measured limits

`python3 test_engine.py`: all 23 persistent-entrypoint cases pass, with legal moves, clean stderr, and elapsed time below five seconds. Six added cases cover the new real games: an early search position, open-four creation and final wins in both colors, and the mandatory (10,3) block. The early search position has no asserted strategic optimum; it tests protocol and time. The slowest measured case is 4.400 seconds. The human open-three defense completes depth 7 in about 2.49 seconds. Exact tactical wins/blocks generally return in milliseconds. Full results are in validation.json.

`python3 test_properties.py`: 50 seeded random boards agree with an independent contiguous-line oracle for all immediate wins in both colors. Every sampled move labeled a double continuation produces at least two independently verified winning cells. Six nested placements per board agree with fresh full score/neighborhood recomputation after every placement, and unmake restores the original state. An injected timeout interrupts a nested forcing sequence, verifying finally restoration; an expired search returns a legal fallback without state corruption. Four cold-process cases verify clean JSON output and runtime under five seconds; measurements are in budget_validation.json.

These tests establish local tactical/protocol correctness and timing on this host. They do not establish stronger tournament performance or runtime on a slower machine.

## Remaining weaknesses and future notes

General search still uses 16 root candidates, 10/8 deeper candidates, and a distance-two neighborhood. Defensive threat extensions examine at most 12 candidates and are not exhaustive proofs. Quiet leaf baselines, selective widths, and a four-ply extension limit can miss forcing sequences or quiet defenses. The initial four-sequence solver stops after eight attacking moves or its 0.65-second allowance. Open-three evaluation is local and heuristic; there is no full three-threat proof search. The diagonal white opening remains an unproven preference.

For future iterations, deduplicate sequences and find the earliest move enabling an unavoidable threat. Keep the exact oracle, nested restoration, and timeout tests. Do not infer that every winning-game move was sound, or claim a changed early move is better without testing the resulting variation. Prioritize concrete missed defenses and forcing counterattacks over fitting weights to this small record set.
