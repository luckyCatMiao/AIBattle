# Iteration 1 review

## Replay findings

The six AI records contain only two distinct games, repeated three times each. As black, Luna repeated H8, G9, E11, D12, C13 while Sol developed I8, I7, I9. Luna's remote downward diagonal did not create a forcing threat. Sol's I10 made a vertical four; Luna's I11 on the next turn could not stop either endpoint, and Sol won at I6. The key failure happened earlier: Luna allowed the opponent to establish I7-I9 without creating a forcing counterattack. The old evaluator used a radius-2 neighborhood around occupied stones for reply checks; at the I10 four, the I6 completion was outside that set.

As white, Luna repeated I10, K10, K12, J11 against the same diagonal attack. Sol's K11 made a diagonal four and Luna's L12 could not stop G7. The AI games are repeated sequences, not six independent samples. In the human game, Luna played I10, J9, K8, H11 and the human completed H8-H6 in column H; the short record has no Luna reply after H6.

## Changes

Added `engine.py` and set `entry.json` to the required program protocol. The engine checks all board squares for immediate wins and blocks, so tactical completions cannot disappear outside a local candidate set. It evaluates contiguous runs and open ends, favors forcing shape, and looks one opponent move ahead for moves that create an immediate winning continuation. It returns a JSON move for every input line and has a center opening.

## Validation

Ran the engine on real replay-derived positions, including the position immediately before Sol's I10 setup and the position after I10. The first returned a legal move; after I10 it selected I6, a valid immediate block of a winning endpoint. Other replay positions and an opening position also returned legal JSON moves. Sampled execution was under 0.2 seconds per invocation, well inside the 5 second move limit.

## Remaining weaknesses

The one-ply forcing scan is not a full threat-space search. If an opponent already has a three with two ways to make a four, the position may be lost before a direct winning move appears; the engine can recognize danger but may not find a defense. Static run scoring can still prefer a locally attractive move over a distant strategic continuation, and the replay sample is small and heavily duplicated.
