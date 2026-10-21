import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import combat_bench as c
import combat_judge as j
import combat_develop as develop

class CombatTests(unittest.TestCase):
    def test_complete_submission_extracted_without_rewrite(self):
        html='<!DOCTYPE html><html><body><canvas></canvas><script>const a = 1;</script></body></html>'
        with tempfile.TemporaryDirectory() as d:
            result=c.prepare('```html\n'+html+'\n```',Path(d))
            self.assertEqual((Path(d)/'game.html').read_text(),html)
            self.assertTrue(result['syntax_checked'])
            self.assertFalse(result['runtime_tested'])

    def test_syntax_check_does_not_execute_submission(self):
        with tempfile.TemporaryDirectory() as d:
            marker=Path(d)/'should-not-exist'
            js='require("fs").writeFileSync('+json.dumps(str(marker))+',"bad");'
            c.prepare('<html><script>'+js+'</script></html>',Path(d))
            self.assertFalse(marker.exists())

    def test_broken_or_external_submission_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            for html in ['<html><script>let x = ;</script></html>',
                         '<html><script src="https://example.com/a.js"></script></html>',
                         '<html><iframe></iframe><script>1;</script></html>',
                         '<html><script>let a=1;</script>']:
                with self.assertRaises(ValueError):c.prepare(html,Path(d))

    def test_grade_bounds_and_integer_total(self):
        g=dict(scores=dict(impact=30,flow=25,rhythm=17,destruction=12),verdict='参考',
               strengths=['具体'],weaknesses=['具体'],evidence=[dict(basis='source',detail='细节')],limitations='仅离散截图')
        self.assertEqual(j.parse(json.dumps(g))['total'],84)
        for value in [36,-1,1.5,True]:
            g['scores']['impact']=value
            with self.assertRaises(ValueError):j.parse(json.dumps(g))

    def test_run_path_validation(self):
        for value in ['../../settings.json','combat-bad','combat-20261019-160034-875938/../x']:
            with self.assertRaises(ValueError):c.path_for(value)

    def test_unlimited_request_continues_after_provider_output_stop(self):
        calls=[]
        responses=[('<html><script>const a=1;', 'max_tokens'),('</script></html>', 'end_turn')]
        class FakeStream:
            def __init__(self,**kwargs):
                calls.append(kwargs)
                self.text,self.reason=responses.pop(0)
                self.result=SimpleNamespace(stop_reason=self.reason,input_tokens=4,output_tokens=8,thinking='')
                self.response_model='test';self.response_id='test';self.saw_message_stop=True;self._resp_ctx=None
            def __enter__(self):return self
            def __exit__(self,*args):pass
            @property
            def text_stream(self):return iter([self.text])
        with patch.object(c,'Stream',FakeStream):
            r=c.request('test')
        self.assertEqual(r['status'],'ok')
        self.assertEqual(r['text'],'<html><script>const a=1;</script></html>')
        self.assertEqual(len(r['segments']),2)
        self.assertIsNone(r['deadline_seconds'])
        self.assertIsNone(r['total_output_limit'])
        self.assertTrue(all(x['timeout'] is None and x['max_tokens']==1_000_000 for x in calls))
        self.assertIn(c.CONTINUE,[x['content'] for x in calls[1]['messages']])
        calls.clear()
        responses.extend([('<html><script>const a=1;', 'end_turn'),('</script></html>', 'end_turn')])
        with patch.object(c,'Stream',FakeStream):
            segmented=c.request('test',continue_incomplete_document=True,token_cap=131072)
        self.assertEqual(segmented['text'],'<html><script>const a=1;</script></html>')
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[0]['max_tokens'],131072)
        self.assertIn(c.CONTINUE_DOCUMENT,[x['content'] for x in calls[1]['messages']])

    def test_only_provider_token_rejections_negotiate_cap(self):
        self.assertEqual(c.token_ceiling('max_tokens must be less than or equal to 131072',1_000_000),131072)
        self.assertIsNone(c.token_ceiling('model not found 404',1_000_000))
        self.assertIsNone(c.token_ceiling('invalid API key',1_000_000))

    def test_checkpoint_failure_does_not_abort_model_output(self):
        class FakeStream:
            def __init__(self,**kwargs):
                self.result=SimpleNamespace(stop_reason='end_turn',input_tokens=4,output_tokens=8,thinking='')
                self.response_model='test';self.response_id='test';self.saw_message_stop=True;self._resp_ctx=None
            def __enter__(self):return self
            def __exit__(self,*args):pass
            @property
            def text_stream(self):return iter(['<html><script>1;</script></html>'])
        with patch.object(c,'Stream',FakeStream),patch.object(c.bench,'write_json',side_effect=PermissionError('sharing violation')):
            result=c.request('test',progress_dir=Path('unused'))
        self.assertEqual(result['status'],'ok')
        self.assertIn('</html>',result['text'])
        self.assertGreater(result['checkpoint_warnings']['count'],0)

    def test_atomic_json_retries_sharing_violation(self):
        import bench
        replace=Path.replace
        failures=[]
        def intermittent(path,target):
            if len(failures)<2:
                failures.append(1)
                raise PermissionError('sharing violation')
            return replace(path,target)
        with tempfile.TemporaryDirectory() as d,patch.object(Path,'replace',intermittent):
            p=Path(d)/'record.json'
            bench.write_json(p,{'complete':True})
            self.assertEqual(json.loads(p.read_text()),{'complete':True})
            self.assertEqual(list(Path(d).glob('*.tmp')),[])

    def test_resume_only_own_interrupted_generation(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            for n,system,text in [(1,c.SYSTEM,'<html>original'),(2,develop.SYSTEM,'{"patches":[')]:
                folder=root/f'versions/v{n:04d}'
                c.bench.write_json(folder/'writer-input.json',{'system':system})
                c.bench.write_json(folder/'writer-result.json',{'status':'error','partial_text':text})
            prefix,source=develop.generation_prefix(root)
            self.assertEqual(prefix,'<html>original')
            self.assertIn('v0001',source)
        self.assertEqual(develop.join_continuation('prefix','suffix'),'prefixsuffix')
        self.assertEqual(develop.join_continuation('prefix','<!DOCTYPE html>new'),'<!DOCTYPE html>new')

    def test_repair_patch_must_match_exactly_once(self):
        self.assertEqual(develop.apply_response(json.dumps({'patches':[{'old':'let x=1;','new':'let x=2;'}]}),'let x=1;'),'let x=2;')
        for source,old in [('a a','a'),('b','a'),('b','')]:
            with self.assertRaises(ValueError):develop.apply_response(json.dumps({'patches':[{'old':old,'new':'x'}]}),source)

    def test_technical_failure_or_missing_evidence_is_not_a_low_score(self):
        g=j.parse(json.dumps({'needs_technical_fix':True,'technical_feedback':['启动时抛异常']}))
        self.assertNotIn('total',g)

    def test_repaired_source_cannot_reuse_old_capture_or_grade(self):
        import hashlib
        rid='combat-20261019-160034-875938'
        with tempfile.TemporaryDirectory() as d, patch.object(c,'RUNS',Path(d)):
            folder=Path(d)/rid/'entries/作品-01';folder.mkdir(parents=True)
            old=b'<html><script>1;</script></html>';oldsha=hashlib.sha256(old).hexdigest()
            (folder/'game.html').write_bytes(old)
            c.bench.write_json(Path(d)/rid/'run.json',{'id':rid,'entries':[{'id':'作品-01','model':'test','status':'ready'}]})
            c.bench.write_json(folder/'capture.json',{'source_sha256':oldsha})
            c.bench.write_json(folder/'combat-check.json',{'source_sha256':oldsha,'passed':True})
            c.bench.write_json(folder/'grade.json',{'evaluation_policy':c.EVALUATION_POLICY,'source_sha256':oldsha,'total':70})
            self.assertEqual(c.public(rid)['entries'][0]['grade']['total'],70)
            new=b'<html><script>2;</script></html>';newsha=hashlib.sha256(new).hexdigest()
            v=folder/'versions/v0001';v.mkdir(parents=True);(v/'game.html').write_bytes(new)
            c.bench.write_json(folder/'development.json',{'artifact':'versions/v0001','status':'awaiting_check','validation':{'html_sha256':newsha}})
            e=c.public(rid)['entries'][0]
            self.assertFalse(e['judge_eligible'])
            self.assertNotIn('capture',e)
            self.assertNotIn('grade',e)
        g=j.parse(json.dumps({'needs_more_play':True,'play_requests':['需要重斩命中画面']}))
        self.assertNotIn('total',g)

    def test_new_skill_requirement_needs_actual_skill_checks_and_fresh_grade(self):
        import hashlib
        rid='combat-20261019-175423-8d4c40'
        with tempfile.TemporaryDirectory() as d, patch.object(c,'RUNS',Path(d)):
            root=Path(d)/rid
            folder=root/'entries/作品-01';folder.mkdir(parents=True)
            html=b'<html><script>1;</script></html>'
            sha=hashlib.sha256(html).hexdigest()
            (folder/'game.html').write_bytes(html)
            c.bench.write_json(root/'run.json',dict(id=rid,prompt='base',entries=[dict(id='作品-01',model='test',status='ready')]))
            c.bench.write_json(folder/'capture.json',dict(source_sha256=sha))
            check=dict(source_sha256=sha,passed=True)
            c.bench.write_json(folder/'combat-check.json',check)
            grade=dict(evaluation_policy=c.EVALUATION_POLICY,source_sha256=sha,total=80)
            c.bench.write_json(folder/'grade.json',grade)
            self.assertTrue(c.public(rid)['entries'][0]['judge_eligible'])
            c.bench.write_json(root/'feature-request.json',dict(id='four',prompt='new request',required_skills=4))
            c.bench.write_json(folder/'skill-update.json',dict(status='delivered',source_sha256=sha))
            entry=c.public(rid)['entries'][0]
            self.assertFalse(entry['judge_eligible'])
            self.assertNotIn('grade',entry)
            check['verified_skill_count']=4
            c.bench.write_json(folder/'combat-check.json',check)
            entry=c.public(rid)['entries'][0]
            self.assertTrue(entry['judge_eligible'])
            self.assertNotIn('grade',entry)
            grade['feature_request_id']='four'
            c.bench.write_json(folder/'grade.json',grade)
            self.assertEqual(c.public(rid)['entries'][0]['grade']['total'],80)

    def test_cancelled_feature_and_grading_preserve_verified_baseline(self):
        import hashlib
        rid='combat-20261019-175423-8d4c40'
        with tempfile.TemporaryDirectory() as d, patch.object(c,'RUNS',Path(d)):
            root=Path(d)/rid; folder=root/'entries/作品-01';folder.mkdir(parents=True)
            html=b'<html><script>1;</script></html>';sha=hashlib.sha256(html).hexdigest()
            (folder/'game.html').write_bytes(html)
            c.bench.write_json(root/'run.json',dict(id=rid,prompt='base',grading_cancelled=True,
                entries=[dict(id='作品-01',model='test',status='ready')]))
            c.bench.write_json(root/'feature-request.json',dict(id='four',prompt='old extra demand',required_skills=4,status='cancelled'))
            c.bench.write_json(folder/'capture.json',dict(source_sha256=sha))
            c.bench.write_json(folder/'combat-check.json',dict(source_sha256=sha,passed=True))
            c.bench.write_json(folder/'grade.json',dict(evaluation_policy=c.EVALUATION_POLICY,source_sha256=sha,total=80))
            data=c.public(rid);entry=data['entries'][0]
            self.assertEqual(data['prompt'],'base')
            self.assertNotIn('feature_request',data)
            self.assertTrue(entry['combat_verified'])
            self.assertEqual(data['verified_count'],1)
            self.assertFalse(entry['judge_eligible'])
            self.assertEqual(entry['judge_status'],'cancelled')
            self.assertEqual(entry['grade']['total'],80)

if __name__=='__main__':unittest.main()
