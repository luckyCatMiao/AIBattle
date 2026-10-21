"""Verify reference benchmark artifacts without changing works or judgments."""
import collections
import hashlib
import json
from pathlib import Path
import sys

import bench
import svg_reference
import svg_task


def audit(run_id):
    data = bench.load_run(run_id)
    assert data.get('task') == 'reference'
    assert data['state'] in ('complete', 'complete_with_errors')
    reference = svg_reference.reference_bytes(data)
    root = bench.run_path(run_id)
    assert hashlib.sha256(reference).hexdigest() == data['reference']['sha256']
    assert data['parameters']['tools'] is False and data['parameters']['image_generation'] is False
    counts = collections.Counter(e['status'] for e in data['entries'])
    result = {'run_id': run_id, 'reference_sha256': data['reference']['sha256'],
              'reference_dimensions': [data['reference']['width'], data['reference']['height']],
              'status_counts': dict(counts), 'author_reference_verified': 0,
              'original_responses_verified': 0, 'pure_svg_verified': 0,
              'same_pixels_for_human_and_judge_verified': 0, 'grades_verified': 0,
              'public_reveal_policy_verified': False, 'failures': []}
    for entry in data['entries']:
        folder = root/'entries'/entry['id']
        writer_input = json.loads((folder/'writer-input.json').read_text(encoding='utf-8'))
        assert writer_input['reference'] == data['reference']
        assert writer_input['prompt'] == data['prompt']
        assert writer_input['system'] == data['writer_system']
        assert writer_input['tools'] is False and writer_input['image_generation'] is False
        attempts = sorted(folder.glob('writer-attempt-*.json'))
        assert attempts
        for path in attempts:
            record = json.loads(path.read_text(encoding='utf-8'))
            assert record['reference_sha256'] == data['reference']['sha256']
            assert record['max_tokens'] == data['parameters']['writer_max_tokens']
        result['author_reference_verified'] += 1
        if entry.get('text_sha256'):
            original = (folder/'original.txt').read_text(encoding='utf-8')
            assert hashlib.sha256(original.encode()).hexdigest() == entry['text_sha256']
            assert original == entry.get('text', entry.get('failed_submission'))
            result['original_responses_verified'] += 1
        if entry.get('render_status') == 'ready':
            svg = (folder/'artwork.svg').read_bytes()
            assert hashlib.sha256(svg).hexdigest() == entry['render']['source_file_sha256']
            assert svg_task.extract_and_validate(svg.decode('utf-8')) == svg.decode('utf-8')
            assert svg_task.extract_and_validate(entry['text']) == svg.decode('utf-8')
            png = (folder/'preview.png').read_bytes()
            assert hashlib.sha256(png).hexdigest() == entry['render']['sha256']
            result['pure_svg_verified'] += 1
        if entry.get('grade'):
            judge_input = json.loads((folder/'judge-input.json').read_text(encoding='utf-8'))
            assert judge_input['reference'] == data['reference']
            assert judge_input['image']['sha256'] == entry['render']['sha256']
            assert judge_input['svg_source_sent'] is False
            assert 'model' not in judge_input['prompt']
            assert entry['judge']['image_sha256'] == entry['render']['sha256']
            assert entry['judge']['reference_sha256'] == data['reference']['sha256']
            result['same_pixels_for_human_and_judge_verified'] += 1
            grade = json.loads((folder/'grade.json').read_text(encoding='utf-8'))
            assert grade == entry['grade']
            assert svg_task.parse_grade(json.dumps(grade), data['rubric']) == grade
            result['grades_verified'] += 1
        if entry['status'].endswith('failed'):
            result['failures'].append({'id': entry['id'], 'status': entry['status'],
                'error': entry.get('writer_error') or entry.get('render_error') or entry.get('judge_error')})
    public = bench.public_run(run_id)
    for entry in public['entries']:
        if not entry['revealed']:
            assert all(key not in entry for key in ('grade', 'judge', 'judge_error'))
    result['public_reveal_policy_verified'] = True
    result['verified_at'] = bench.now()
    bench.write_json(root/'audit.json', result)
    return result


if __name__ == '__main__':
    run_id = sys.argv[1] if len(sys.argv)>1 else (bench.ROOT/'latest-reference-run.txt').read_text(encoding='utf-8').strip()
    print(json.dumps(audit(run_id), ensure_ascii=True))
