# Iteration 2 review

## Replay findings

The six AI records are repeated sequences, not six independent games: there are two distinct AI games, each repeated three times. As black, Luna played H8, G9, E11, D12, C13 while Sol built I8-I7-I9 and then I10. Luna replied I11 to the vertical four, leaving both I6 and I12 as winning endpoints; Sol won at I6. The earlier diagonal stones at E11-D12-C13 did not force Sol to answer, and Luna made no competing threat. The lesson is that static contiguous-run scoring needs to recognize broken and extendable patterns before the opponent reaches a four.

As white in the other distinct AI sequence, Luna played I10, K10, K12, J11. Sol then played K11, creating a diagonal four that Luna did not stop; Sol completed at G7. In the human game, Luna played I10, J9, K8, H11 while the human developed H8-H7-H6; this record ends after the human's H6. Again Luna's moves formed a remote diagonal without interrupting or outpacing the opponent's line.

## Changes

Reworked `engine.py` to score every five-cell segment, including broken patterns with empty gaps. Immediate wins and opponent winning moves are checked across the full board before evaluation. Candidate moves that leave an immediate opponent win are rejected whenever a safe candidate exists; remaining moves are ranked by own pattern potential and opponent pattern disruption, with a small center preference. The JSON-line protocol and `entry.json` remain program mode.

## Validation

Fed the entrypoint 37 positions reconstructed from the public replay move histories at several ply counts, plus a synthetic position where the opponent has four consecutive stones. It returned one legal, parseable JSON move per line in 0.64 seconds for the batch. The synthetic four was blocked at an endpoint. Separate checks confirmed an immediate own four is completed. Runtime is comfortably below the 5-second per-move budget on these positions.

## Remaining weaknesses

This is still a shallow evaluator, not threat-space search. It may miss a move that creates a forced win several plies later, and segment scores count overlapping windows, which can make some patterns look disproportionately valuable. If all candidate moves permit an immediate win, it selects among losing moves by the same score. The replay set is small and highly duplicated, so it cannot establish broad strength.
