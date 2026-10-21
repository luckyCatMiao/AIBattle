# Frontier RTS round 2 review

## Round 1 replay diagnosis

In both public games, `r1-g1` and `r1-g2`, Luna opened at simulated time 0 by sending one rifle to each of the three outposts and upgrading immediately. This split the opening force while Sol grouped all four rifles at the north outpost and paid for a tank and raider. In `r1-g1`, Sol's four rifles were already targeting our node units at t=6–11; in `r1-g2`, the same exchange happened from the other seat at t=6–11. Luna's node units were then picked off in succession, so Luna recorded zero control time in either final state.

At t=21 in both replays, Sol queued its first tank while Luna was still contesting nodes with separated rifles. Sol continued tank production (visible t=25, 37, 49, and 61 in `r1-g1`) and used focus-fire commands to remove our reinforcements. Luna never built enough durable force to contest the center. Sol ultimately gathered all three nodes and attacked our base with nine tanks; the base fell at t=151.4 (`r1-g2`) and t=151.6 (`r1-g1`).

## Changes for round 2

Replaced the isolated-node opening with Sol's demonstrated opening: queue a tank and raider, explicitly keep workers on the home mine, and send all four starting rifles together toward the north outpost. This should preserve enough rifle mass to win the first fight and gives an early tank that survives base defense. After the opening, the controller sends idle combat units to unowned outposts, buys damage upgrades from surplus, and favors tank production once the opening is established. A base assault starts only when the surviving army has at least 12 units and 1,800 combined HP. It repairs a damaged base when the repair is available.

## Checks

Ran the program against `example.json`; it emits valid JSON and the opening has four commands (tank, raider, worker gather, grouped attack-move). `python3 -m py_compile agent.py` passed. A 240-second self-play simulation completed without command/protocol exceptions, with both bases alive; the outposts changed hands repeatedly and scores were 2,492 and 2,812. The small self-play edge reflects seating and stochastic-free path/focus interactions, so it is not evidence of superiority. The process responds in milliseconds, below the one-second target.

## Remaining weaknesses

This policy lacks the round 1 winner's frequent manual focus-fire and may lose the opening if an opponent concentrates additional forces at the center. The 12-unit assault threshold is based on force size and HP, not enemy composition or estimated time-to-kill. The self-play draw showed that capturing nodes can remain unstable; the next replay should be checked for early rifle losses, whether tanks arrive soon enough, and whether the assault threshold delays pressure too long.
