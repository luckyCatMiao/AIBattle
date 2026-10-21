# Frontier RTS competition

Play to win this real-time strategy game. Choose your own approach: direct model decisions, a self-authored program, or a hybrid. Neither opponent source nor previous Gomoku strategies are available. Only your private directory and identical public battle records are provided. Do not access other contestants or download engines. The supplied rules.js is the actual public simulation with the built-in opponent removed; you can use it for your own tests. It is not the referee process and editing it cannot change the match rules.

## Submission

Write entry.json as either {"mode":"program","command":["python3","agent.py"]} (or node) or {"mode":"direct"}.

Program: a persistent process reads one JSON observation per stdin line and writes exactly one JSON object {"commands":[...],"note":"optional brief explanation"} per stdout line, flushed promptly. Diagnostics go to stderr. A new process starts for each game. It may keep memory between observations. The game workspace is read-only and has no network or credentials. Preparation permits writing and testing your files, Python 3 / Node and the standard libraries are available. Target under 1 second per response; 5 seconds is the hard process response limit. Protocol failure stops the experiment for diagnosis rather than awarding the other contestant a victory.

Direct: the organizer invokes this same Codex model for each observation, providing your own notes and state. Write that JSON response into action.json. Your model has up to 180 seconds per decision. This mode is supported but much slower in wall time; it does not cost simulated game time. No opponent source is provided in either mode. Only one decision per game second, under the same command budget, regardless of method.

## Timing / observation

The authoritative simulation runs continuously at a fixed 20 Hz, with units executing orders between decisions. Before each simulated second, both players receive the same pre-command snapshot (yourPlayer differs). Both responses are collected before either is applied. At most 10 commands per player per simulated second; additional commands are rejected. Time advances by 20 physics steps after orders. Playback is accelerated up to 8x wall time. start and pause are referee-only. Existing orders persist; sending an empty list is legal. Invalid commands are rejected independently, with errors supplied in the next observation. No hidden fog; all battlefield information is public. Model thinking speed is NOT being benchmarked.

Observation is the object returned by snapshot(game, yourPlayer): id, now (seconds), tick, status, yourPlayer, map {width:1280,height:840}, rules, types, players, units, bases, mines, nodes, events; plus lastErrors, decisionSeconds:1, maxCommands:10. example.json shows a real starting observation. IDs identify entities; player IDs 0/1 are assigned afresh per game. Your opponent's program is never sent. Records show both sides' public issued commands and public state.

## Rules

Two bases at west/east, 1700 HP each, defensive range 170, damage 24 per second. Begin with 260 credits, 3 workers and 4 rifle infantry. Passive base income 1.5 credits/second. Workers harvest 6 ore/second, carry 20, and must return to their base to deposit. Mines have finite ore. Workers automatically find a mine unless you specify one. Coordinates are top-left origin.

Units (cost / serial production seconds / HP / speed / range / damage / cooldown):
- worker: 50 / 4 / 70 / 76 / 0 / 0 / 1
- rifle: 60 / 5 / 110 / 64 / 115 / 13 / 0.8
- tank: 160 / 12 / 360 / 37 / 160 / 40 / 2
- raider: 100 / 8 / 150 / 108 / 94 / 16 / 0.65

Rifle vs raider, raider vs tank, tank vs rifle: 1.5x damage. Tank splash 40% within radius 36. Unit cap is 40 including queued units; production queue cap 6. Production is serial per base. New combat units attack-move toward your rally point. Workers automatically gather.

Three outposts: combat units within 65 capture an enemy/neutral outpost in 8 seconds if uncontested. Opposing presence freezes capture. Controlled outposts pay 3 credits/sec and control-time score even if you leave. Destroying a base eliminates that player's units. Last remaining base wins. At 600 seconds, living players are compared by rounded score = damage*0.2 + kills*35 + mined*0.1 + controlTime*2 + remainingBaseHP*0.1. Destroyed base counts as five kills. Tied scores draw. Upgrades (180 then 300 credits) add 20% damage each, maximum level 2. Repair costs 100, restores 400 base HP, cooldown 30 seconds.

## Commands

{"type":"train","unit":"worker|rifle|tank|raider"}
{"type":"rally","x":350,"y":420}
{"type":"upgrade"}
{"type":"repair"}
{"type":"move","units":["u4"],"x":640,"y":250}
{"type":"attackMove","units":["u4"],"x":640,"y":250}
{"type":"attack","units":["u4"],"target":"b1"}
{"type":"gather","units":["u1"],"target":"m0"}
{"type":"stop","units":["u4"]}

move ignores enemies until arrival. attackMove pursues nearby enemies then resumes travel. attack locks a living enemy entity; units will pursue it. stop holds position and attacks enemies already in range. Group movement uses a 24-pixel spaced formation. All specified units must be living and owned by you. Coordinates must be finite and inside the map. Commands are applied in listed order and consume credits immediately. See rules.js for precise movement, targeting, splash and scoring details.

## Series

Three revision rounds, two games per round swapping west/east seats. Both models start from scratch, medium reasoning, identical preparation budget: target five minutes, hard cutoff ten minutes. Each new round gets both previous public game records, not private strategies. Review your mistakes, revise/test your entry, and write review.md with specific game IDs, simulated times and changes. No model is forced to imitate any particular strategy. Six games from one adaptive series are a small, correlated sample, not a general intelligence ranking.
