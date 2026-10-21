import json, pathlib, re, shutil, urllib.request
root = pathlib.Path(__file__).resolve().parents[2]
train = root / 'training'
games = json.load(urllib.request.urlopen('http://127.0.0.1:8787/api/state'))['games']
public = []
for summary in games:
    if summary['status'] == 'finished':
        public.append(json.load(urllib.request.urlopen('http://127.0.0.1:8787/api/games/' + summary['id'])))
for who, source in [('luna', 'play.py'), ('sol', 'player.py')]:
    dest = train / who
    dest.mkdir(exist_ok=True)
    text = (root / 'players' / who / source).read_text(encoding='utf-8')
    text = re.sub(r"TOKEN\s*=\s*'[^']*'", "TOKEN='REDACTED_OLD_MATCH_TOKEN'", text)
    (dest / 'previous_bot.py').write_text(text, encoding='utf-8')
    (dest / 'public_replays.json').write_text(json.dumps(public, ensure_ascii=False, indent=2), encoding='utf-8')
    (dest / 'AGENTS.md').write_text('You are a Gomoku contestant. Only your own code and public game records are supplied. Develop your own strategy. Do not try to obtain another contestant\'s private files or bypass the sandbox. No subagents.\n', encoding='utf-8')
    (dest / 'RULES.md').write_text('''# Gomoku iteration contest
15x15 freestyle Gomoku, >=5 consecutive stones wins. No forbidden moves.
board[y][x] is 0 empty, 1 black, 2 white. Black starts. Coordinates x,y=0..14.
Each iteration contains two games from an empty board, swapping colors.
Both contestants receive identical public replays and only their own previous source.
Choose your own approach: direct reasoning, a program, or a hybrid.
If choosing a program, create engine.py (Python standard library), or engine.js (Node standard library), plus entry.json: {"mode":"program","command":["python3","engine.py"]}.
The engine reads one JSON line per turn and writes one JSON line {"x":7,"y":7,"note":"short label"}. Flush stdout. It stays alive across moves of a game; it restarts for the next game.
Input has board, yourColor (black/white), ply, matchId, moves and timeLimitMs=5000. The public referee remains authoritative. Do not make HTTP calls; the organizer transports moves.
Budget is 5 seconds per move after input arrives, with a 10 second hard process limit for scheduling overhead. Return your best completed move within 5 seconds. Engine execution has no network and no credentials.
If choosing direct reasoning instead, write entry.json {"mode":"direct"}; the organizer will invoke this same model on each position, with these same rules and your own notes.
For every preparation round, review real replays, improve your strategy as you see fit, test it, and write review.md with concrete failures and changes. Preserve your own useful experience in files. Explain limitations honestly.
Do not copy other engines, download game implementations, or seek opponent source. Stay within the provided workspace. You may run your own tests.
The organizer will freeze your submitted version for each color-swapped pair and then give you the completed public records for the next improvement round.
''', encoding='utf-8')
print(json.dumps({'players':['luna','sol'], 'shared_completed_replays':len(public)}))
