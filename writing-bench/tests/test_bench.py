import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bench

WORK = '艾尔：饭还没好？\n米娜：你刚问过。\n洛：把勺子放下吧。'
GRADE = {'scores': {'natural': 40, 'character': 16, 'interest': 14, 'fit': 8},
         'verdict': '反应自然。', 'strengths': ['接话具体。'], 'weaknesses': ['篇幅不足。'], 'ai_tells': [],
         'evidence': [{'quote': '饭还没好？', 'comment': '直接问。'}, {'quote': '你刚问过。', 'comment': '有关系。'}]}


def answer(text):
    return {'status': 'ok', 'text': text, 'stop_reason': 'end_turn', 'output_tokens': 100, 'input_tokens': 20,
            'elapsed_seconds': 1, 'response_model': 'fixture'}


class GradeIntegrity(unittest.TestCase):
    def test_total_is_computed_not_trusted(self):
        data = copy.deepcopy(GRADE)
        data['total'] = 100
        self.assertEqual(bench.parse_grade(json.dumps(data), WORK)['total'], 78)

    def test_fabricated_evidence_rejected(self):
        data = copy.deepcopy(GRADE)
        data['evidence'][0]['quote'] = '原文里不存在的句子'
        with self.assertRaises(ValueError):
            bench.parse_grade(json.dumps(data), WORK)

    def test_invalid_component_scores_rejected(self):
        for value in (51, -1, True, 40.5, '40'):
            data = copy.deepcopy(GRADE)
            data['scores']['natural'] = value
            with self.assertRaises(ValueError):
                bench.parse_grade(json.dumps(data), WORK)

    def test_evidence_only_recovery_preserves_judgment(self):
        data = copy.deepcopy(GRADE)
        data['evidence'].append({'quote': '不存在的句子', 'comment': '不能保留这条引文'})
        grade, omitted = bench.recover_quoted_grade(json.dumps(data), WORK)
        self.assertEqual(grade['scores'], data['scores'])
        self.assertEqual(grade['verdict'], data['verdict'])
        self.assertEqual(len(omitted), 1)
        self.assertEqual(len(grade['evidence']), 2)

    def test_syntax_repair_changes_only_field_separator(self):
        raw = json.dumps(GRADE).replace('], "ai_tells":', ']["ai_tells":')
        parsed, repairs = bench.decode_judgment(raw, repair_separator=True)
        self.assertEqual(parsed, GRADE)
        self.assertEqual(len(repairs), 1)
        self.assertEqual(repairs[0]['from'], '[')


class PipelineIntegrity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patches = [patch.object(bench, 'RUNS', Path(self.temp.name)), patch.object(bench, 'model_ids', return_value=['author-one', bench.JUDGE]), patch.object(bench, 'initialize_credentials')]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def test_blind_inputs_and_completed_resume_make_no_new_calls(self):
        data = bench.make_run(bench.DEFAULT_PROMPT, 'test')
        calls = []
        def fake(model, prompt, system, max_tokens):
            calls.append((model, prompt, system))
            if system == bench.WRITER_SYSTEM:
                self.assertEqual(prompt, data['prompt'])
                return answer(WORK)
            material = json.loads(prompt)
            self.assertEqual(set(material), {'question', 'rubric', 'anonymous_id', 'work'})
            self.assertNotIn('author-one', prompt)
            self.assertNotIn(bench.JUDGE, prompt)
            return answer(json.dumps(GRADE, ensure_ascii=False))
        with patch.object(bench, 'call_model', side_effect=fake):
            bench.execute(data['id'])
            completed = bench.load_run(data['id'])
            self.assertEqual(completed['state'], 'complete')
            self.assertEqual(len(calls), 4)
            self.assertEqual(sum(e['judge_is_same_model'] for e in completed['entries']), 1)
            bench.execute(data['id'])
            self.assertEqual(len(calls), 4)

    def test_unavailable_author_is_unscored_and_not_replaced(self):
        data = bench.make_run(bench.DEFAULT_PROMPT, 'test', ['author-one'])
        with patch.object(bench, 'call_model', return_value={'status': 'error', 'error': 'unavailable', 'http_status': 404}) as call:
            bench.execute(data['id'])
        e = bench.load_run(data['id'])['entries'][0]
        self.assertEqual(e['status'], 'writer_failed')
        self.assertNotIn('grade', e)
        self.assertEqual(call.call_count, 1)

    def test_retry_keeps_previous_attempt_files(self):
        data = bench.make_run(bench.DEFAULT_PROMPT, 'test', ['author-one'])
        e = data['entries'][0]
        e['writer_attempts'] = 2
        folder = bench.run_path(data['id']) / 'entries' / e['id']
        bench.write_json(folder / 'writer-attempt-1.json', {'error': 'old evidence'})
        with patch.object(bench, 'call_model', return_value=answer(WORK)):
            bench.generate(data, e)
        self.assertEqual(e['writer_attempts'], 3)
        self.assertEqual(json.loads((folder / 'writer-attempt-1.json').read_text())['error'], 'old evidence')
        self.assertTrue((folder / 'writer-attempt-3.json').exists())

    def test_human_first_gate_and_reveal_lock(self):
        data = bench.make_run(bench.DEFAULT_PROMPT, 'test')
        data['state'] = 'complete'
        for e in data['entries']:
            e.update(status='scored', text=WORK, grade=bench.parse_grade(json.dumps(GRADE), WORK), judge={'private': 'metadata'})
        bench.save_run(data)
        one, two = data['entries']
        public = bench.public_run(data['id'])
        self.assertFalse(public['ranking_unlocked'])
        self.assertTrue(all('grade' not in e and 'judge' not in e for e in public['entries']))
        with self.assertRaises(ValueError):
            bench.reveal(data['id'], one['id'])
        public = bench.save_human(data['id'], one['id'], 0, '允许零分，但不自动揭晓')
        self.assertTrue(all('grade' not in e for e in public['entries']))
        public = bench.reveal(data['id'], one['id'])
        self.assertIn('grade', next(e for e in public['entries'] if e['id'] == one['id']))
        self.assertNotIn('grade', next(e for e in public['entries'] if e['id'] == two['id']))
        with self.assertRaises(ValueError):
            bench.save_human(data['id'], one['id'], 100)
        with self.assertRaises(ValueError):
            bench.reveal(data['id'])
        bench.save_human(data['id'], two['id'], 100)
        public = bench.reveal(data['id'])
        self.assertTrue(public['ranking_unlocked'])
        self.assertTrue(all('grade' in e for e in public['entries']))

    def test_human_score_rejects_invalid_values(self):
        data = bench.make_run(bench.DEFAULT_PROMPT, 'test', ['author-one'])
        e = data['entries'][0]
        e.update(text=WORK, status='written')
        bench.save_run(data)
        for value in (True, '80', 80.5, -1, 101, None):
            with self.assertRaises(ValueError):
                bench.save_human(data['id'], e['id'], value)

    def test_direct_reveal_preserves_ratings_and_other_round_gate(self):
        writing = bench.make_run(bench.DEFAULT_PROMPT, 'writing')
        svg = bench.make_run('SVG artwork task', 'svg', kind='svg')
        for data in (writing, svg):
            data['state'] = 'complete'
            for e in data['entries']:
                e.update(status='scored', text=WORK, grade=bench.parse_grade(json.dumps(GRADE), WORK))
            bench.save_run(data)
        bench.save_human(writing['id'], writing['entries'][0]['id'], 65, '真实个人评分')
        human_path = bench.run_path(writing['id']) / 'human.json'
        before = human_path.read_bytes()
        public = bench.reveal_without_human(writing['id'], '用户要求直接揭晓写作评分')
        self.assertTrue(public['ranking_unlocked'])
        self.assertFalse(public['all_human_scored'])
        self.assertEqual(public['human_count'], 1)
        self.assertEqual(human_path.read_bytes(), before)
        self.assertEqual(bench.load_run(writing['id'])['entries'], writing['entries'])
        self.assertTrue(all(e['revealed'] and 'grade' in e for e in public['entries']))
        with self.assertRaises(ValueError):
            bench.save_human(writing['id'], writing['entries'][1]['id'], 100)
        sealed = bench.public_run(svg['id'])
        self.assertFalse(sealed['ranking_unlocked'])
        self.assertTrue(all('grade' not in e for e in sealed['entries']))

    def test_judge_recovery_preserves_last_returned_scores(self):
        data = bench.make_run(bench.DEFAULT_PROMPT, 'test', ['author-one'])
        raw = copy.deepcopy(GRADE)
        raw['evidence'].append({'quote': '不存在的引文', 'comment': '无效证据'})
        def fake(model, prompt, system, max_tokens):
            return answer(WORK if system == bench.WRITER_SYSTEM else json.dumps(raw))
        with patch.object(bench, 'call_model', side_effect=fake) as calls, patch.object(bench.time, 'sleep'):
            bench.execute(data['id'])
        completed = bench.load_run(data['id'])
        e = completed['entries'][0]
        self.assertEqual(completed['state'], 'complete')
        self.assertEqual(calls.call_count, 3)
        self.assertEqual(e['grade']['scores'], raw['scores'])
        self.assertEqual(e['grade']['verdict'], raw['verdict'])
        self.assertEqual(e['evidence_validation']['omitted_quotes'], 1)


if __name__ == '__main__':
    unittest.main()
