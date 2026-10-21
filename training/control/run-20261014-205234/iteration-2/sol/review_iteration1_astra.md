# Sol versus Astra, iteration 1 preparation

## Evidence and replay review

Read RULES.md, own previous_bot.py, engine.py, engine_iteration2.py and prior reviews. The archive has 13 completed records and nine distinct complete move sequences. Records 2854c6431a3427f1 / b06a7b392044c7cc / 270c253fbc3a2dd9 are one sequence; 94a783909494e51c / f304783f359e1710 / 2dfe9305ab34185f are another. The two most recent black-Sol games also share their first eleven moves; that shared prefix is not independent evidence. There are no games of the new Astra matchup yet. Historical Sol wins against Luna do not establish strength against Astra.

Concrete mistakes, with one-based ply numbers and zero-based coordinates:

* 6c44ab3e9c6c06c7: black's ply 11 (8,5) makes its own horizontal three but ignores white's open diagonal three (8,8), (9,7), (10,6). White's ply 12 (11,5) produces distinct winning cells (7,9) and (12,4). Black's ply 13 (5,5) creates its own open four too late: white wins immediately at (7,9) on ply 14. Counterattack must be evaluated against whose winning move occurs first. White's ply 6 (9,7) allowed black to force a block at (7,3) on ply 8; this is a tempo concession, not a demonstrated losing error. White already occupied (7,8), so black's vertical four had only one winning endpoint.
* 86c477fc4433b321: black's ply 7 (6,7) produces a horizontal open three. White's ply 8 (12,11) validly forces black's ply 9 (13,12), because the diagonal's other endpoint (8,7) is black. White's ply 10 (9,10) neglects the surviving horizontal threat; black's ply 11 (9,7) creates winning cells (5,7) and (10,7). White's ply 12 (11,8) does not create an immediate win and cannot rescue this position. Black wins on ply 13 (10,7). This shares its early sequence with 65ab4d8089a3261f, so it confirms a tactical continuation rather than providing an independent opening result.
* c0456dbabc64e04d: black's ply 9 (8,5) neglects white's broken horizontal three (7,8), (8,8), (10,8). White's ply 10 (9,8) creates an open four; blocking just (6,8) at ply 11 loses to (11,8).
* a6eeac560d4c9672: black's ply 11 (4,6) neglects white's open vertical three at x=8. White's ply 12 (8,5) creates two winning endpoints. Sol's earlier ply 6 (7,6) allowed a forcing black four and mandatory defense; the result does not prove that early choice optimal.
* 83478ee6ee2cac64: white's ply 6 (10,7) fails to restrain black's vertical open three. After black's ply 7 (7,6), an endpoint block cannot prevent the other endpoint winning. This is a useful pre-fork defense regression.
* 2854c6431a3427f1: Sol correctly fills the broken diagonal four at (5,9), ply 8. Black's ply 9 (2,12) ignores the white vertical three and loses after the open four. 94a783909494e51c similarly punishes white's ply 8 (9,10), which neglects black's diagonal three.

## Changes

entry.json selects the persistent standard-library Python engine with command ["python3", "engine.py"]. Input boards remain authoritative; each request produces a flushed JSON move. previous_bot.py is untouched. No network, downloaded engines, opponent code, or subagents were used.

1. Preserve every candidate with an own or enemy forcing-four score (>=90,000) outside the ordinary quiet-move beam, both at the root and in normal/defensive search. Keep all own forcing fours at the quiescence horizon and in the four-sequence solver. Previously fixed slices could omit tactical attacks or preventive defenses. Quiet candidates remain selective.
2. Memoize completed four-sequence proofs by board, attacker and remaining attacking depth. Timeout results are never cached. Successful results are exact forcing continuations; unsuccessful results mean only no continuation was found within this solver's scope.
3. After the own attacking proof and immediate-fork screen, check root moves for opponent four-sequence wins up to six attacking moves. Reject positively proved losses when another candidate survives. Each attempt gets at most 70 ms and the entire pass gets at most 750 ms. Timeout remains unknown. The overall deadline stays 4.4 seconds. If all candidates are refuted, retain a legal move rather than claiming a defense exists.

The archive does not demonstrate a loss caused by these specific implementation gaps. These changes address inspected search limitations and are supported by tactical tests, not a claim of measured tournament improvement.

## Validation

python3 test_engine.py exercises 37 positions through one persistent protocol process, including eight additional positions from the two most recent archived games. Assertions cover actual wins, forced blocks, open-four creation, both colors, edge lines, broken fours, overlines, and own-win priority. Quiet replay positions assert legality and timing without claiming optimality. An initially overstrict new fixture after game 6c44ab3e9c6c06c7 ply 9 was corrected: white has only two diagonal stones then, so the move (10,6) creates the third stone rather than an immediate open four. All 37 cases pass with clean stderr; maximum measured response time is 4.400 seconds. Results and per-position runtimes are in validation.json.

python3 test_properties.py checks 50 seeded boards against an independent contiguous-line win oracle, verifies two winning continuations for fork scores, compares nested incremental updates to fresh reconstruction, and checks rollback on timeout. All property checks pass. Four cold-start protocol cases pass, with maximum measured time 3.214 seconds, and are recorded in budget_validation.json. A constructed two-four sequence is independently verified: white (6,7) forces black (8,7), then white (6,6) creates winning cells (6,3) and (6,8). Initially white has no immediate fork. With ordinary search deliberately interrupted, the new defensive fallback prevents this sequence. A tiny-beam test verifies that every forcing/defensive candidate survives truncation. This proves handling of the tested continuation, not exhaustive defense against every three-threat attack.

## Remaining weaknesses and future notes

General search still has a selective quiet beam, radius-two candidates, approximate static evaluation and a four-ply horizon extension. Open and double threes are heuristic. There is no exhaustive all-defense three-threat solver. The added opponent proof pass can reduce completed general-search depth; its time slices may miss a real threat. Memoized negative proof results are depth-specific and limited to continuous forcing fours. Root candidates surviving the pass are not certified safe. Timing tests describe this host, with 0.6 seconds of reserve under the referee limit.

For future iterations prioritize the first avoidable threat in the new Astra pair, including tempo concessions inside wins. Deduplicate complete records and shared prefixes. Keep independent tactical oracles and forced-timeout tests. Do not tune openings to repeated Luna sequences or infer strength from historical wins. Preserve these notes when updating the next review.
