"""Complete empty/truncated deliveries with a common larger cap, then seal/audit.

Never reroll a complete SVG or print any judge score.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import shutil
import time
import bench
import svg_task


def audit(data):
    root = bench.run_path(data['id'])
    works = images = grades = failed_originals = 0
    problems = []
    for entry in data['entries']:
        folder = root/'entries'/entry['id']
        if not entry.get('text'):
            if entry.get('failed_submission'):
                original=(folder/'original.txt').read_text(encoding='utf-8')
                assert original==entry['failed_submission']
                assert hashlib.sha256(original.encode()).hexdigest()==entry['text_sha256']
                failed_originals+=1
            problems.append({'id':entry['id'],'issue':'no artwork delivered'})
            continue
        original=(folder/'original.txt').read_text(encoding='utf-8')
        assert original == entry['text']
        assert hashlib.sha256(original.encode()).hexdigest() == entry['text_sha256']
        works+=1
        if entry.get('render_status')=='ready':
            image=(folder/'preview.png').read_bytes()
            assert hashlib.sha256(image).hexdigest()==entry['render']['sha256']
            assert hashlib.sha256((folder/'artwork.svg').read_text(encoding='utf-8').encode()).hexdigest()==entry['render']['source_sha256']
            assert hashlib.sha256((folder/'artwork.svg').read_bytes()).hexdigest()==entry['render']['source_file_sha256']
            if entry.get('grade'):
                manifest=json.loads((folder/'judge-input.json').read_text(encoding='utf-8'))
                assert manifest['image']['sha256']==entry['render']['sha256']
                assert manifest['svg_source_sent'] is False
                assert set(manifest['prompt'])=={'question','rubric','anonymous_id'}
            images+=1
        else:
            problems.append({'id':entry['id'],'issue':'SVG could not be rendered'})
        if entry.get('grade'):
            grade=svg_task.parse_grade(json.dumps(entry['grade']))
            assert grade['total']==entry['grade']['total']
            raw=json.loads((folder/f'judge-attempt-{entry["judge_attempts"]}.json').read_text(encoding='utf-8'))
            decoded=svg_task.recover_grade(raw['text'])[0] if entry.get('grade_format_validation') else svg_task.parse_grade(raw['text'])
            assert decoded==entry['grade']
            if entry.get('render_status')=='ready':assert raw['image_sha256']==entry['render']['sha256']
            grades+=1
        else:
            problems.append({'id':entry['id'],'issue':'judge unavailable; not a zero score'})
    public=bench.public_run(data['id'])
    assert all('grade' not in e and 'judge' not in e for e in public['entries'] if not e['revealed'])
    result={'run':data['id'],'at':bench.now(),'originals_verified':works,'same_png_for_human_and_judge_verified':images,
            'failed_submission_originals_verified':failed_originals,'grades_verified':grades,'human_first_gate_verified':True,'issues':problems,'scores':'sealed'}
    bench.write_json(root/'audit.json',result)
    bench.report(data)
    print(json.dumps({'phase':'complete','works':works,'rendered':images,'graded':grades,'issues':len(problems),'scores':'sealed'}),flush=True)


def merge_staged(data, human):
    """Import only empty submissions; preserve initial attempts and all human data."""
    count=0
    for entry in data['entries']:
        staged=bench.ROOT/'recovery-staging'/data['id']/'entries'/entry['id']
        result=staged/'recovery-result.json'
        if not result.exists() or entry.get('budget_recovery'):
            continue
        if entry.get('text') or entry['id'] in human:
            continue
        assert entry['status']=='writer_failed' and not entry.get('grade')
        recovered=json.loads(result.read_text(encoding='utf-8'))
        assert recovered['id']==entry['id'] and recovered['model']==entry['model']
        recovery=recovered['budget_recovery']
        if recovery.get('prompt_sha256'):assert recovery['prompt_sha256']==data['prompt_sha256']
        if recovery.get('system_sha256'):assert recovery['system_sha256']==hashlib.sha256(data['writer_system'].encode()).hexdigest()
        assert recovered['writer_attempts']>entry.get('writer_attempts',0)
        folder=bench.run_path(data['id'])/'entries'/entry['id']
        # Validate every collision before writing anything.
        for source in staged.iterdir():
            target=folder/source.name
            if source.is_file() and target.exists():
                assert target.read_bytes()==source.read_bytes(), f'Unexpected artifact collision: {source.name}'
        bench.write_json(folder/'before-budget-recovery.json',entry)
        for source in staged.iterdir():
            if source.is_file():shutil.copy2(source,folder/source.name)
        entry.clear();entry.update(recovered)
        entry['budget_recovery']['merged_at']=bench.now()
        count+=1
    return count


def sync_render_metadata(data):
    """Reconcile a browser-compatibility rendering with a stopped worker's state."""
    count=0
    for entry in data['entries']:
        folder=bench.run_path(data['id'])/'entries'/entry['id']
        pending=folder/'render-sync.json'
        if not pending.exists():continue
        update=json.loads(pending.read_text(encoding='utf-8'))
        render=update['render']
        assert hashlib.sha256((folder/'preview.png').read_bytes()).hexdigest()==render['sha256']
        assert hashlib.sha256((folder/'artwork.svg').read_text(encoding='utf-8').encode()).hexdigest()==render['source_sha256']
        if entry.get('render',{}).get('sha256')!=render['sha256']:
            if entry.get('grade'):
                bench.write_json(folder/'grade-before-render-sync.json',entry['grade'])
            entry.pop('grade',None);entry.pop('judge',None);entry.pop('judge_error',None)
            entry.update(render=render,render_status='ready',status='written')
            count+=1
    return count


def separate_failed_deliveries(data):
    for entry in data['entries']:
        if entry.get('render_status')!='failed':continue
        folder=bench.run_path(data['id'])/'entries'/entry['id']
        # Preserve the submitted source and any old delivery-only review, but
        # never present a review of missing pixels as a visual artwork score.
        if entry.get('grade'):
            bench.write_json(folder/'delivery-only-review.json',entry['grade'])
        for key in ('grade','judge','judge_error'):entry.pop(key,None)
        if entry.get('text'):entry['failed_submission']=entry.pop('text')
        entry['status']='render_failed'


def finish(run_id):
    data=bench.load_run(run_id)
    if data['state'] in ('queued','writing','judging'):
        raise SystemExit('Initial worker is still active; no changes made.')
    if data.get('kind')!='svg':raise ValueError('Expected SVG run')
    bench.initialize_credentials()
    human=bench.human_results(run_id)
    data['parameters'].update(initial_writer_max_tokens=12000,recovery_writer_max_tokens=32768,
        recovery_rule='One larger-cap attempt for empty deliveries only; never replace existing artwork.')
    merged=merge_staged(data,human)
    synchronized=sync_render_metadata(data)
    separate_failed_deliveries(data)
    for entry in data['entries']:
        if entry.get('render_status')=='ready':
            folder=bench.run_path(run_id)/'entries'/entry['id']
            entry['render']['source_file_sha256']=hashlib.sha256((folder/'artwork.svg').read_bytes()).hexdigest()
            entry['render']['source_hash_policy']='source_sha256 uses UTF-8 text with LF; source_file_sha256 uses exact downloaded bytes'
            bench.write_json(folder/'render.json',entry['render'])
    bench.save_run(data)
    print(json.dumps({'phase':'reconcile','staged_imported':merged,'render_metadata_updated':synchronized,'scores':'sealed'}),flush=True)
    candidates=[]
    for entry in data['entries']:
        empty=entry['status']=='writer_failed' and entry.get('writer_error')=='Empty text response'
        if empty and not entry.get('text') and entry['id'] not in human and not entry.get('budget_recovery'):
            candidates.append(entry)
    if candidates:
        data['parameters'].update(initial_writer_max_tokens=12000,writer_max_tokens=32768,writer_attempts_per_stage=1,
            recovery_rule='One larger-cap attempt for empty deliveries only; never replace any existing artwork or human-rated entry.')
        data['state']='writing'
        for entry in candidates:
            folder=bench.run_path(run_id)/'entries'/entry['id']
            bench.write_json(folder/'before-budget-recovery.json',entry)
            assert not entry.get('text') and not entry.get('grade')
            entry['status']='writing'
            entry['budget_recovery']={'new_cap':32768,'initial_cap':12000,'reason':'empty delivery at initial cap'}
        bench.save_run(data)
        print(json.dumps({'phase':'budget_recovery','entries':len(candidates),'cap':32768}),flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures=[pool.submit(bench.work_item,bench.generate,data,e) for e in candidates]
            for f in concurrent.futures.as_completed(futures):f.result();bench.save_run(data)
    for e in data['entries']:svg_task.recover_last_grade(data,e)
    to_judge=[e for e in data['entries'] if e['status'] in ('written','judge_failed')]
    if to_judge:
        data['state']='judging'
        for e in to_judge:e['status']='judging'
        bench.save_run(data)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(bench.work_item,bench.judge,data,e) for e in to_judge]
            for f in concurrent.futures.as_completed(futures):f.result();bench.save_run(data)
    data['state']='complete' if all(e['status']=='scored' for e in data['entries']) else 'complete_with_errors'
    data['finished_at']=bench.now();bench.save_run(data)
    audit(data)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('run_id');args=parser.parse_args();finish(args.run_id)
