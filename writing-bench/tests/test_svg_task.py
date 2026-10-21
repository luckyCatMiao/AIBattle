import hashlib
import json
from pathlib import Path
import sys
import tempfile
import subprocess
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bench
import svg_task

SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#f8f3df"/><circle cx="400" cy="300" r="100" fill="#23945f"/></svg>'
GRADE = {'scores': {'expression': 20, 'scale': 15, 'craft': 20, 'invention': 10}, 'verdict': '测试评分',
         'strengths': ['有清晰形状'], 'weaknesses': ['没有呈现题目'], 'uncertainties': [],
         'observations': [{'region': '中间', 'comment': '绿色圆形'}, {'region': '背景', 'comment': '浅色矩形'}]}


class SvgIntegrity(unittest.TestCase):
    def test_one_premature_json_brace_recovery_preserves_judgment(self):
        raw=json.dumps(GRADE,ensure_ascii=False).replace(', "strengths":','} , "strengths":',1)
        grade,repair=svg_task.recover_grade(raw)
        self.assertEqual(grade,svg_task.parse_grade(json.dumps(GRADE)))
        self.assertFalse(repair['scores_changed'])
        with self.assertRaises(ValueError):svg_task.recover_grade(json.dumps(GRADE))
        with self.assertRaises(ValueError):svg_task.recover_grade('{"scores":{}} , "strengths":[]}')

    def test_missing_image_does_not_get_an_artwork_score(self):
        with patch.object(bench,'call_model') as call:
            data={'id':'run-20261019-120000-abcdef'}
            entry={'id':'art-001','text':'<svg','render_status':'failed'}
            svg_task.judge(data,entry)
            self.assertEqual(entry['status'],'render_failed')
            self.assertEqual(entry['failed_submission'],'<svg')
            self.assertNotIn('text',entry)
            call.assert_not_called()

    def test_duplicate_id_first_reference_and_original_unchanged(self):
        source='<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"/></defs><g id="paint"><rect fill="url(#paint)"/></g></svg>'
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'source.svg';path.write_text(source,encoding='utf-8')
            result=subprocess.run([sys.executable,str(bench.ROOT/'normalize-svg.py'),str(path)],capture_output=True,text=True,check=True)
            normalized=json.loads(result.stdout)
            self.assertEqual(path.read_text(encoding='utf-8'),source)
            self.assertEqual(normalized['svg'].count('id="paint"'),1)
            self.assertIn('fill="url(#paint)"',normalized['svg'])
            self.assertEqual(len(normalized['compatibility_adjustments']),1)
            path.write_text(source.replace('<defs>','<style>#paint{opacity:.5}</style><defs>'),encoding='utf-8')
            result=subprocess.run([sys.executable,str(bench.ROOT/'normalize-svg.py'),str(path)],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)

    def test_external_resources_and_scripts_are_rejected(self):
        bad = ['<script>alert(1)</script>', '<image href="https://example.com/a.png"/>', '<g onclick="go()"/>',
               '<foreignObject/>', '<style>@import "https://example.com/x.css";</style>',
               '<rect style="fill:url(file:///C:/secret.png)"/>', '<animate attributeName="x"/>']
        for content in bad:
            with self.subTest(content=content), self.assertRaises(ValueError):
                svg_task.extract_and_validate('<svg xmlns="http://www.w3.org/2000/svg">'+content+'</svg>')

    def test_nested_svg_and_internal_paint_refs_are_preserved(self):
        source='<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><svg><rect fill="url(#g)"/></svg></svg>'
        self.assertEqual(svg_task.extract_and_validate('```svg\n'+source+'\n```'), source)

    def test_grade_range_and_total(self):
        grade=svg_task.parse_grade(json.dumps(GRADE))
        self.assertEqual(grade['total'],65)
        for value in [31, True, 20.5]:
            data=json.loads(json.dumps(GRADE));data['scores']['expression']=value
            with self.assertRaises(ValueError):svg_task.parse_grade(json.dumps(data))

    def test_real_render_and_exact_same_image_sent_to_blind_judge(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(bench,'RUNS',Path(temp)), patch.object(bench,'model_ids',return_value=['author-one']):
            data=bench.make_run(svg_task.PROMPT,'fixture',['author-one'],'svg');entry=data['entries'][0]
            folder=bench.run_path(data['id'])/'entries'/entry['id'];folder.mkdir(parents=True)
            entry.update(text=SVG,status='written')
            svg_task.render_entry(data,entry,folder)
            self.assertEqual(entry['render_status'],'ready')
            self.assertEqual((entry['render']['width'],entry['render']['height']),(1600,1200))
            png=(folder/'preview.png').read_bytes()
            self.assertEqual(png[:8],b'\x89PNG\r\n\x1a\n')
            def fake(model,prompt,system,max_tokens,*,messages=None):
                import base64
                self.assertEqual(model,bench.JUDGE)
                content=messages[0]['content']
                self.assertEqual(base64.b64decode(content[1]['source']['data']),png)
                text=content[0]['text']
                self.assertNotIn('author-one',text)
                self.assertNotIn('<svg',text)
                return {'status':'ok','text':json.dumps(GRADE),'stop_reason':'end_turn'}
            with patch.object(bench,'call_model',side_effect=fake):svg_task.judge(data,entry)
            self.assertEqual(entry['status'],'scored')
            manifest=json.loads((folder/'judge-input.json').read_text(encoding='utf-8'))
            self.assertFalse(manifest['svg_source_sent'])
            self.assertEqual(manifest['image']['sha256'],hashlib.sha256(png).hexdigest())
            data['state']='complete';bench.save_run(data)
            public=bench.public_run(data['id']);self.assertNotIn('grade',public['entries'][0])


if __name__=='__main__':unittest.main()
