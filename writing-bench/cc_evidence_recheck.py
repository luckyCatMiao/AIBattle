"""Re-evaluate once after genuinely expanded play evidence, using Claude Code."""
import argparse
import concurrent.futures
from pathlib import Path
import shutil
import time

import bench
import combat_bench as combat
import cc_judge


def run(run_id, entry_ids):
    folder = combat.path_for(run_id)
    while True:
        try:
            entries = {e['id']: e for e in combat.public(run_id)['entries']}
            ready = all(entries[eid].get('grade') and
                        entries[eid].get('judge_status') == 'scored' and
                        (folder/'entries'/eid/'judge-input.json').exists()
                        for eid in entry_ids)
            if ready:
                break
        except (PermissionError, ValueError):
            pass
        time.sleep(3)

    tasks = []
    for eid in entry_ids:
        entry = entries[eid]
        path = folder/'entries'/eid
        current = bench.read_json(path/'capture.json')
        previous = bench.read_json(path/'judge-input.json')
        frozen = bench.read_json(Path(previous['judge_workspace'])/'evidence.json')
        old_files = {s['file'] for s in frozen.get('screenshots', [])}
        new_files = {s['file'] for s in current.get('screenshots', [])}
        if not entry.get('judge_eligible'):
            raise ValueError(eid + ': recheck requires new matched-source play evidence')
        if new_files == old_files:
            print(eid + ': latest evidence already reviewed', flush=True)
            continue
        if not new_files > old_files:
            raise ValueError(eid + ': evidence was removed, cannot silently recheck')
        archive = path/'judge-history'/('expanded-play-'+str(time.time_ns()))
        archive.mkdir(parents=True)
        for name in ('grade.json', 'judge-input.json', 'judge-status.json'):
            shutil.copy2(path/name, archive/name)
        bench.write_json(path/'evidence-recheck.json', dict(
            at=bench.now(), source_sha256=entry['source_sha256'],
            reason='新增空战、机动与后续交战实际截图后统一复评，不按旧分数筛选作品或择优保留',
            previous_screenshots=sorted(old_files), new_screenshots=sorted(new_files-old_files),
            archive=str(archive), invocation_method='claude-code-cli', effort='high'))
        tasks.append(entry)

    if tasks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks)) as pool:
            list(pool.map(lambda entry: cc_judge.review(run_id, entry), tasks))
    print('EXPANDED PLAY REVIEWS COMPLETE', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run')
    parser.add_argument('entries', nargs='+')
    args = parser.parse_args()
    run(args.run, args.entries)
