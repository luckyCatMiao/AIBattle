# Sol iteration 1

## Evidence from the actual records

Read RULES.md, our own previous_bot.py, and all seven public move lists. The six AI games have exactly **two distinct sequences**, each repeated three times. Sol wins all six recorded games, but these are two tactical examples, not six independent demonstrations of strength. There is no recorded Sol loss to explain. previous_bot.py is preserved unchanged.

* In the Luna-black sequence, black plays (4,10) at ply 5 and (3,11) at ply 7, creating the broken diagonal four (3,11), (4,10), gap (5,9), (6,8), (7,7). Sol correctly fills (5,9) at ply 8. Black's (2,12) at ply 9 extends a line already cut by white. Sol's (8,9) at ply 10 makes an open vertical four with winning endpoints (8,5) and (8,10). Luna blocks only (8,10), and Sol wins at (8,5).
* In the Sol-black sequence, (8,8) at ply 7 joins (7,7) and (9,9) into an open diagonal three. Luna's (9,10) at ply 8 does not restrain it. Sol's (10,10) at ply 9 creates an open four. Luna blocks (11,11), leaving Sol's winning (6,6).
* In the human game, black has (7,7), (7,8), (7,9) after ply 5. Luna attacks at (10,7) on ply 6 instead of interrupting the open vertical three. Black's (7,6) creates two immediate winning cells, (7,5) and (7,10). Blocking (7,10) on ply 8 cannot save the game. The important defensive opportunity is **before** the open four exists. A counterattack is useful only if it wins first or forces a response.

## Submitted implementation

entry.json runs python3 engine.py through the required persistent JSON-lines protocol, with flushed move output and stderr diagnostics. No HTTP transport, credentials, network calls, opponent code, or third-party dependencies are used.

The new engine uses a flattened board, cached directional pattern evaluation, and incremental recomputation of only cells affected by a placement. Threat evaluation anchors five-cell windows to the proposed stone, counts distinct winning cells, and identifies open threes by testing extensions that create two winning cells. Broken fours, boundaries, both colors, and freestyle overlines are handled explicitly. Cross-direction fours and threes receive appropriate priority.

Immediate wins precede defense. A single immediate enemy win is blocked; two independent enemy winning cells are recognized as a lost position unless we can win immediately. A dedicated search proves forcing four sequences up to eight attacking moves, checking the defender's immediate counterwins. Otherwise, iterative negamax searches up to seven plies, with alpha-beta pruning, a transposition table, and forced-block extensions at the depth boundary. Only completed iterations replace the fallback move. Candidate ordering balances attack and defense. Root width is 16; deeper widths are 10 or 8. Candidates are within Chebyshev distance two of existing stones.

Black opens at the center. Against a lone opening stone, the response is diagonally adjacent, preferring the center. This avoids the disconnected two-step diagonal response observed during preliminary quiet-position testing. This opening preference is an unproven strategic choice, not a replay-derived winning book.

A monotonic deadline caps work at 4.4 seconds under the nominal five-second limit, leaving transport and scheduling margin. Board restoration uses finally blocks so a deadline interruption cannot corrupt later analysis. Board state is rebuilt from each authoritative input.

## Validation

Run `python3 test_engine.py` and `python3 test_properties.py`. Detailed outputs are preserved in validation.json and budget_validation.json.

The persistent-entrypoint suite checks 17 positions: center and white openings; the actual broken-four block and both recorded Sol forcing wins; the human game's earlier open-three defense and later already-lost double-endpoint position; edge wins and broken-four blocks with both colors; an overline gap; taking our own win before defending; a crossing double four; and a busier board. Every output is legal and satisfies its tactical expectation. The human position after ply 5 is defended at (7,10). The late human position is explicitly labeled multiple threats; returning one endpoint does not claim to save it.

An independent contiguous-line oracle verifies exact immediate-win detection for both colors on all empty cells of 50 seeded random boards. Those tests also compare all cached scores, neighbor counts, and board cells before and after make/unmake. Four separate cold-process inputs check protocol, legal output, clean stderr, and runtime. Before the final opening preference, difficult quiet searches returned at approximately 4.43 seconds and completed depth five or six. Final measurements are stored in budget_validation.json; all must remain below five seconds. The tactical suite's slowest case is roughly two seconds. These are local timing measurements, not guarantees on a slower host.

## Remaining weaknesses and next-iteration notes

Search is selective: root/deeper width limits and the distance-two candidate neighborhood can miss quiet sacrifices or distant defensive resources. The dedicated proof search covers forcing fours, not arbitrary sequences of threes. Double-three scores are heuristic and are not declared a proof of victory. Static evaluation and the small opening preference have not been established against a strong varied opponent. When two enemy winning cells already exist, the engine can only take its own win or choose a delaying block.

For the next iteration, inspect the first move where an unavoidable threat becomes possible, rather than only the final failed block. Deduplicate identical move sequences. Keep exact win detection and restoration tests. Prioritize missed defensive resources and forcing counterattacks over retuning weights from this tiny sample. Broaden selective search only when a concrete replay failure justifies its time cost.
