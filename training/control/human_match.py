"""Connect a human's black seat to a contestant's existing isolated engine."""
import argparse
import hashlib
import json
import os
import pathlib
import queue
import subprocess
import sys
import threading
import time

from train import ROOT, TRAIN, CONTROL, LABELS, api, command, save


class Player:
    def __init__(self, who, entry, log):
        self.process = subprocess.Popen(
            command(who, 'engine', ['timeout', '--signal=KILL', '14460s', *entry['command']]),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log,
            text=True, encoding='utf-8', bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW)
        self.responses = queue.Queue()

        def read():
            for line in self.process.stdout:
                self.responses.put(line)
            self.responses.put(None)
        threading.Thread(target=read, daemon=True).start()

    def move(self, observation):
        self.process.stdin.write(json.dumps(observation) + '\n')
        self.process.stdin.flush()
        try:
            line = self.responses.get(timeout=10)
        except queue.Empty:
            raise RuntimeError('Engine exceeded the 10-second hard limit')
        if line is None:
            raise RuntimeError('Engine exited unexpectedly')
        move = json.loads(line)
        x, y = move.get('x'), move.get('y')
        if not (type(x) is int and type(y) is int and 0 <= x < 15 and 0 <= y < 15
                and observation['board'][y][x] == 0):
            raise RuntimeError('Engine returned an illegal move')
        return move

    def close(self):
        try:
            self.process.stdin.close()
            self.process.wait(timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            self.process.terminate()
            self.process.wait(timeout=5)


def serve(folder):
    import msvcrt
    lock = (folder / '.worker.lock').open('a+b')
    lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    config = json.loads((folder / 'private.json').read_text(encoding='utf-8'))
    engine = None

    def status(event, **data):
        save(folder / 'status.json', {'event': event, 'pid': os.getpid(),
             'game': config['game'], 'at': time.strftime('%Y-%m-%dT%H:%M:%S'), **data})

    started = time.monotonic()
    try:
        with (folder / 'engine.log').open('a', encoding='utf-8') as errors:
            status('waiting_for_human')
            while time.monotonic() - started < 4 * 60 * 60:
                obs = api('/api/agent/state', token=config['ai_token'])
                if obs['matchId'] != config['game'] or obs['yourColor'] != 'white':
                    raise RuntimeError('Unexpected game or seat')
                if obs['status'] == 'finished':
                    save(folder / 'replay.json', api('/api/games/' + config['game']))
                    status('finished', winner=obs['winner'], plies=obs['ply'])
                    return
                if not obs['yourTurn']:
                    time.sleep(.4)
                    continue
                if engine is None:
                    engine = Player(config['who'], config['entry'], errors)
                status('thinking', ply=obs['ply'])
                obs['timeLimitMs'] = 5000
                begin = time.monotonic()
                move = engine.move(obs)
                elapsed = time.monotonic() - begin
                result = api('/api/move', {'matchId': config['game'], 'ply': obs['ply'],
                    'x': move['x'], 'y': move['y'], 'note': str(move.get('note', ''))[:160]},
                    config['ai_token'])
                with (folder / 'moves.jsonl').open('a', encoding='utf-8') as f:
                    f.write(json.dumps({'ply': obs['ply'] + 1, 'seconds': elapsed,
                                        'move': result['move']}, ensure_ascii=False) + '\n')
                status('waiting_for_human', ply=obs['ply'] + 1)
            status('expired_after_four_hours')
    except Exception as exc:
        status('error', error=str(exc))
        raise
    finally:
        if engine:
            engine.close()
        lock.close()


def create(who):
    entry = json.loads((TRAIN / who / 'entry.json').read_text(encoding='utf-8'))
    if entry.get('mode') != 'program' or entry.get('command') != ['python3', 'engine.py']:
        raise RuntimeError('This launcher requires the existing Python program entrypoint')
    folder = CONTROL / ('run-human-' + who + '-' + time.strftime('%Y%m%d-%H%M%S'))
    folder.mkdir()
    source = (TRAIN / who / 'engine.py').read_bytes()
    (folder / 'engine-snapshot.py').write_bytes(source)
    # Verify the real isolated entrypoint without placing a move in the human game.
    with (folder / 'probe.log').open('w', encoding='utf-8') as errors:
        probe = Player(who, entry, errors)
        try:
            board = [[0] * 15 for _ in range(15)]
            board[7][7] = 1
            begin = time.monotonic()
            answer = probe.move({'board': board, 'yourColor': 'white', 'yourTurn': True,
                'yourSymbol': 'O', 'ply': 1, 'timeLimitMs': 5000,
                'moves': [{'ply': 1, 'x': 7, 'y': 7, 'color': 1}]})
            save(folder / 'validation.json', {'seconds': time.monotonic() - begin,
                                              'legal_response': answer})
        finally:
            probe.close()
    game = api('/api/games', {'black': '你 · 黑棋', 'white': LABELS[who] + ' · 最新策略'})
    game_id = game['game']['id']
    save(folder / 'private.json', {'who': who, 'entry': entry, 'game': game_id,
        'ai_token': game['tokens']['white'], 'human_token': game['tokens']['black'],
        'engine_sha256': hashlib.sha256(source).hexdigest()})
    with (folder / 'worker.log').open('w', encoding='utf-8') as out:
        process = subprocess.Popen([sys.executable, '-u', str(pathlib.Path(__file__).resolve()),
            '--serve', str(folder)], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW)
    for _ in range(100):
        status_file = folder / 'status.json'
        if status_file.exists():
            state = json.loads(status_file.read_text(encoding='utf-8'))
            if state['event'] == 'waiting_for_human':
                print(json.dumps({'game': game_id, 'folder': str(folder), 'pid': process.pid,
                                  'url': 'http://127.0.0.1:8787/?game=' + game_id}))
                return
            if state['event'] == 'error':
                raise RuntimeError(state['error'])
        if process.poll() is not None:
            raise RuntimeError('Worker failed to start; see worker.log')
        time.sleep(.1)
    raise RuntimeError('Worker did not become ready; see status.json')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--create', choices=tuple(LABELS))
    modes.add_argument('--serve', type=pathlib.Path)
    args = parser.parse_args()
    serve(args.serve) if args.serve else create(args.create)
