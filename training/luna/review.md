# Iteration 3 review

## Replay findings

The six AI records still represent only two distinct games repeated three times. In the black game, Luna played H8, G9, E11, D12, C13 while Sol built I8-I7-I9-I10. After I10, Luna's I11 blocked only one end of Sol's vertical four; I6 remained a winning endpoint and Sol won there. The remote E11-D12-C13 diagonal did not create an urgent threat. In the white game, Luna played I10, K10, K12, J11; Sol's K11 created the diagonal H8-I9-J10-K11 with winning endpoints, and Luna's L12 could not prevent Sol's G7 win. The human record is incomplete and only shows the human extending H8-H7-H6 while Luna developed a distant diagonal.

## Changes

Kept the segment evaluator but increased its emphasis on three and four stone patterns. Immediate wins and direct blocks remain first. The engine now distinguishes one opponent winning endpoint, which it blocks, from multiple endpoints, where a single block cannot work. It searches each candidate against all empty cells for immediate wins by either side, prefers moves that create two immediate winning continuations, and avoids moves that leave an immediate opponent win whenever possible. If every candidate loses immediately, it chooses the strongest counterattack. The JSON-line program interface remains unchanged.

## Validation

Ran the real entrypoint on positions reconstructed before every Luna move in the public replays. It emitted one parseable legal JSON move per position (including repeated records). Tactical unit checks confirmed that an existing own four is completed and an opponent's single four is blocked at an endpoint. The two-ended diagonal replay position was exercised as well; it correctly has no single blocking move. The replay batch completed in under two seconds, far below the 5-second per-move budget.

## Remaining weaknesses

This remains a shallow tactical evaluator. It only resolves immediate winning moves and immediate opponent wins, and does not search forced threat sequences. Pattern windows can double-count overlapping shapes, and a multi-end threat that cannot be blocked may still be countered poorly. The public games are few and mostly duplicated, so these adjustments are based on narrow evidence.
