# Frontier RTS round 3 review

## Round 2 replay diagnosis

Both games ended in base losses: Sol won r2-g1 at t=137.1 and r2-g2 at t=136.1. In r2-g1, Luna captured no outposts; Sol accumulated 293 seconds of control time. In r2-g2, Luna held nodes for only 113.2 control seconds while Sol reached 174.0.

The round 2 controller's node assignment was unsafe. At t=15 in r2-g1 and t=14 in r2-g2, it issued two attack-move commands to the same new unit, one for each side node. The second command replaced the first. In r2-g1 it also sent u17 to the west side node at t=21 and stopped it at t=23, splitting forces. This repeated the original tactical mistake in a subtler form: isolated units were sent away while the opposing army massed near center. Meanwhile Sol secured north and upgraded at t=73 and t=97 in r2-g1, and t=73 and t=109 in r2-g2.

## Round 3 changes

The opening still queues one tank and one raider, gathers workers at the home mine, and sends the four starting rifles together to north. New production rallies at the central node. The controller no longer peels individual units toward side nodes; after securing north, it rallies the army toward the closest remaining enemy node. Nearby combat units focus the same low-health enemy. Tank production remains the default, with raiders added to answer enemy armor. Upgrades wait until north is ours and the bank can cover the upgrade plus another tank.

## Checks

`python3 -m py_compile agent.py` passed. Ran the process on `example.json` and on realistic round 2 snapshots at t=0 and t=30; each emitted one parseable JSON response within 18 ms and used no more than 10 commands. The t=0 output contains exactly the two affordable opening units, a worker gather order, and grouped center movement.

## Remaining weaknesses and carry-forward notes

This policy has not been evaluated in a full head-to-head simulation. It can still lose the central fight to a stronger early focus-fire plan, and its after-capture rally choice may leave a captured node underdefended. Round 3 records should check whether holding north long enough to capture it outweighs the lost side-node income, whether the tank/raider mix survives enemy armor, and whether the delayed upgrade timing increases the fielded army before the first base assault.
