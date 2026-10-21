"""Finalize evidence-only validation and audit a finished run; never print scores."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import bench


def finalize(run_id):
    data = bench.load_run(run_id)
    if data['state'] in ('queued', 'writing', 'judging'):
        return False
    root = bench.run_path(run_id)
    recovered = []
    unresolved = []
    for e in data['entries']:
        if e['status'] != 'judge_failed':
            continue
        folder = root / 'entries' / e['id']
        last = folder / f'judge-attempt-{e.get("judge_attempts", 2)}.json'
        record = json.loads(last.read_text(encoding='utf-8'))
        try:
            if record['status'] != 'ok' or record.get('stop_reason') == 'max_tokens':
                raise ValueError('No completed judgment')
            grade, omitted = bench.recover_quoted_grade(record['text'], e['text'])
            _, syntax_repairs = bench.decode_judgment(record['text'], repair_separator=True)
            bench.write_json(folder / 'evidence-validation.json', {'source': last.name, 'action': 'omit_nonverbatim_quotes_only',
                             'scores_changed': False, 'omitted': omitted, 'syntax_repairs': syntax_repairs,
                             'remaining_verified_quotes': len(grade['evidence']), 'at': bench.now()})
            bench.write_json(folder / 'grade.json', grade)
            e.update(status='scored', grade=grade, judge={k:v for k,v in record.items() if k!='text'},
                     evidence_validation={'omitted_quotes': len(omitted), 'scores_changed': False})
            e.pop('judge_error', None)
            recovered.append(e['id'])
        except (ValueError, KeyError, TypeError) as exc:
            unresolved.append({'id': e['id'], 'reason': str(exc)})
    if recovered:
        data['state'] = 'complete' if all(e['status']=='scored' for e in data['entries']) else 'complete_with_errors'
        bench.save_run(data)
    errors = []
    verified = 0
    for e in data['entries']:
        folder = root / 'entries' / e['id']
        if not e.get('text'):
            errors.append(e['id'] + ': missing work')
            continue
        original = (folder / 'original.txt').read_text(encoding='utf-8')
        assert original == e['text']
        assert hashlib.sha256(original.encode()).hexdigest() == e['text_sha256']
        judge_input = json.loads((folder / 'judge-input.json').read_text(encoding='utf-8'))
        assert set(judge_input['prompt']) == {'question', 'rubric', 'anonymous_id', 'work'}
        assert judge_input['prompt']['work'] == original
        assert judge_input['prompt']['question'] == data['prompt']
        assert judge_input['system'] == data['judge_system']
        if e['status']=='scored':
            validated = bench.parse_grade(json.dumps(e['grade'], ensure_ascii=False), original)
            assert validated['total'] == e['grade']['total']
            raw_grade, _ = bench.decode_judgment(json.loads((folder / f'judge-attempt-{e["judge_attempts"]}.json').read_text(encoding='utf-8'))['text'], repair_separator=True)
            assert raw_grade['scores'] == e['grade']['scores']
            assert raw_grade['verdict'] == e['grade']['verdict']
            verified += 1
    public = bench.public_run(run_id)
    assert all('grade' not in e and 'judge' not in e for e in public['entries'] if not e['revealed'])
    audit = {'run': run_id, 'at': bench.now(), 'originals_verified': len(data['entries']) - len(errors),
             'grades_verified': verified, 'anonymous_judge_inputs_verified': len(data['entries']) - len(errors),
             'originals_unique': len({e.get('text_sha256') for e in data['entries']}) == len(data['entries']),
             'recovered_evidence_only': recovered, 'scores_changed_by_recovery': False, 'unresolved': unresolved,
             'errors': errors, 'human_first_api_verified': True}
    bench.write_json(root / 'audit.json', audit)
    bench.report(data)
    print(json.dumps({'finished': data['state'], 'verified_works': audit['originals_verified'], 'verified_grades': verified,
                      'evidence_only_recovered': len(recovered), 'unresolved': len(unresolved), 'scores': 'SEALED'}, ensure_ascii=False), flush=True)
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run_id')
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    while not finalize(args.run_id):
        if not args.watch:
            raise SystemExit('Run is still active')
        time.sleep(5)
