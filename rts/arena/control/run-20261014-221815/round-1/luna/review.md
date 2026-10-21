# Frontier RTS round 1 review

## Strategy

The observation contains the full state. On the opening decision, send one rifle toward each of the three neutral outposts using attack-move. Outposts provide both 3 credits per second and 2 score per control second, so early capture is the strongest available economic investment. Workers remain on their default gather orders. Once captures are underway, spend credits on damage upgrades when affordable and queue rifles continuously. When the force reaches 18 and has at least five more combat units than the visible enemy, issue a coordinated attack-move toward the enemy base. This threshold aims to concentrate enough damage to overcome the base's 24 damage per second defense.

The controller recognizes an existing attack-move destination near a node, so it does not repeatedly redirect units in transit. Units naturally attack enemies while moving and hold their node after arrival. New units inherit the player's rally point; default rally remains near the map center.

## Replay lessons

`public_replays.json` contains zero records in this first round, so there are no specific game IDs or event times to learn from yet. The opening uses the initial four rifles to contest all three outposts while retaining one extra unit for flexibility.

## Checks

Ran the agent on the supplied `example.json` starting observation. It returned three valid node attack-move commands, one upgrade and one rifle train command (five commands total) in about 0.02 seconds, well under the one second target. Python bytecode compilation also succeeded. The opening commands are within map bounds, and the combined 180-credit upgrade plus 60-credit train is affordable from the initial 260 credits.

## Weaknesses to review after the games

The node assignment sends only one rifle to each outpost initially; it can lose a contested node to a concentrated enemy squad. The policy does not adapt production to enemy composition, and it uses a simple visible force-count threshold for the base assault without evaluating unit health or exact damage output. Review the first round's captures, squad losses and assault timing before changing those choices.
