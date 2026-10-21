"""Return runtime feedback to the same Claude Code author and session."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import bench
import combat_bench as combat
import cc_combat as cc


def feedback(data, entry):
    folder = combat.path_for(data['id']) / 'entries' / entry['id']
    sha = entry.get('source_sha256')
    notes = []
    runtime = entry.get('runtime') or {}
    if runtime.get('source_sha256') == sha and runtime.get('status') == 'error':
        notes.append('实际浏览器运行错误：' + json.dumps(runtime.get('errors'), ensure_ascii=False))
    path = folder / 'judge-fix-feedback.json'
    if path.exists():
        value = bench.read_json(path)
        if value.get('source_sha256') == sha:
            notes.extend(value.get('feedback', []))
    return '\n'.join(notes)


def repair(data, entry, note):
    folder = combat.path_for(data['id']) / 'entries' / entry['id']
    dev = dict(entry['development'], status='fixing', feedback=note, at=bench.now())
    bench.write_json(folder / 'development.json', dev)
    data = dict(data, _write_run=False)
    attempt = max([int(p.stem.split('-')[1]) for p in folder.glob('invocation-*.json')] or [0])
    prompt = '请继续你自己的原项目，修复实际试玩反馈，保留已有战斗设计并重新自测。不因修复次数扣分，不要改为精简演示。\n反馈：\n' + note
    while True:
        attempt += 1
        try:
            outcome = cc.invoke(data, entry, prompt, True, attempt)
            bench.write_json(folder / f'result-{attempt:04d}.json', outcome)
            if outcome['exit_code'] or not outcome['result'] or outcome['result'].get('is_error'):
                raise RuntimeError('原作者 Claude Code 会话中断，将恢复会话继续')
            version = folder / 'versions' / f'v{attempt:04d}'
            version.mkdir(parents=True, exist_ok=True)
            validation = combat.prepare((folder/'project/game.html').read_text(encoding='utf-8-sig'), version)
            stats = cc.line_counts(folder / 'project')
            bench.write_json(folder / 'line-counts.json', stats)
            dev.update(status='awaiting_check', artifact=f'versions/v{attempt:04d}', validation=validation,
                       source_sha256=hashlib.sha256((version/'game.html').read_bytes()).hexdigest(),
                       code_lines=stats['total_lines'], at=bench.now())
            bench.write_json(folder / 'development.json', dev)
            print(entry['model'] + ' repaired', flush=True)
            return
        except Exception as exc:
            dev.update(status='fixing', last_error=str(exc), at=bench.now())
            bench.write_json(folder / 'development.json', dev)
            prompt = '继续修复并自测自己的 /workspace/game.html。上轮未完成：' + str(exc) + '\n原反馈：' + note
            time.sleep(min(60, attempt * 5))


def watch(run):
    active = {}
    seen = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=17) as pool:
        while True:
            try:
                data = combat.public(run)
            except (PermissionError, json.JSONDecodeError):
                time.sleep(1)
                continue
            for entry in data['entries']:
                if entry.get('administrative_result') or entry['status'] != 'ready' or not entry.get('development') or entry['id'] in active:
                    continue
                note = feedback(data, entry)
                token = (entry.get('source_sha256'), note)
                if note and token != seen.get(entry['id']):
                    seen[entry['id']] = token
                    active[entry['id']] = pool.submit(repair, data, dict(entry), note)
            for eid, future in list(active.items()):
                if future.done():
                    try:
                        future.result()
                    except Exception as exc:
                        seen.pop(eid, None)
                        print(eid + ' monitor retry: ' + str(exc), flush=True)
                    del active[eid]
            time.sleep(3)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run')
    watch(parser.parse_args().run)
