import base64
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx

from PIL import Image
import bench
import svg_reference
import svg_task

SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><path d="M0 0H80V100H0Z" fill="#ed9735"/></svg>'
GRADE = {'scores': {'likeness': 12, 'composition': 5, 'light_color': 8, 'craft': 4},
    'verdict': '测试结果', 'strengths': ['形状完整'], 'weaknesses': ['还原不足'], 'uncertainties': [],
    'observations': [{'region':'背景','comment':'参考图与参赛图颜色不同'}, {'region':'主体','comment':'参赛图缺少细节'}]}


class ReferenceIntegrity(unittest.TestCase):
    def test_http_stream_error_keeps_actual_status_and_message(self):
        response = httpx.Response(400, stream=httpx.ByteStream(b'{"error":{"message":"image input is not supported"}}'))
        with self.assertRaises(bench.proxy.ClaudeAPIError) as caught:
            bench.proxy._check_response(response)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(str(caught.exception), 'image input is not supported')
        success = httpx.Response(200, stream=httpx.ByteStream(b'event: ping\n\n'))
        bench.proxy._check_response(success)
        self.assertFalse(success.is_stream_consumed)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patches = [patch.object(bench, 'RUNS', self.root/'runs'), patch.object(bench, 'model_ids', return_value=['fixture-model'])]
        for p in self.patches: p.start()
        image = Image.new('RGB', (80, 100), '#cc4466')
        stream = io.BytesIO(); image.save(stream, format='PNG')
        self.raw = stream.getvalue()
        self.source = self.root/'source.png'; self.source.write_bytes(self.raw)
        self.data = svg_reference.make_run(self.source)
        self.entry = self.data['entries'][0]

    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()

    def test_exact_reference_to_writer_and_judge_with_no_generation_tools(self):
        def fake_writer(model, prompt, system, max_tokens, *, messages=None):
            self.assertEqual(max_tokens, 32768)
            content = messages[0]['content']
            self.assertEqual(base64.b64decode(content[-1]['source']['data']), self.raw)
            self.assertEqual(content[0]['text'], self.data['prompt'])
            stream = bench.RecordedStream(messages=messages, model=model, system=system, max_tokens=max_tokens)
            self.assertNotIn('tools', stream._payload)
            return {'status':'ok','text':SVG,'stop_reason':'end_turn'}
        with patch.object(bench, 'call_model', side_effect=fake_writer):
            bench.generate(self.data, self.entry)
        self.assertEqual(self.entry['render_status'], 'ready')
        folder = bench.run_path(self.data['id'])/'entries'/self.entry['id']
        pixels = (folder/'preview.png').read_bytes()
        def fake_judge(model, prompt, system, max_tokens, *, messages=None):
            content = messages[0]['content']
            images = [c for c in content if c['type']=='image']
            self.assertEqual(len(images), 2)
            self.assertEqual(base64.b64decode(images[0]['source']['data']), self.raw)
            self.assertEqual(base64.b64decode(images[1]['source']['data']), pixels)
            text = ' '.join(c['text'] for c in content if c['type']=='text')
            self.assertNotIn('fixture-model', text)
            self.assertNotIn(SVG, text)
            return {'status':'ok','text':json.dumps(GRADE),'stop_reason':'end_turn'}
        with patch.object(bench, 'call_model', side_effect=fake_judge):
            svg_task.judge(self.data, self.entry)
        self.assertEqual(self.entry['grade']['total'], 29)
        self.assertEqual(self.entry['judge']['reference_sha256'], self.data['reference']['sha256'])
        self.data['state']='complete'; bench.save_run(self.data)
        public=bench.public_run(self.data['id'])
        self.assertFalse(public['ranking_unlocked'])
        self.assertNotIn('grade',public['entries'][0])
        self.assertEqual(svg_reference.reference_bytes(public), self.raw)
        svg_task.report(self.data)
        self.assertIn('人物与关键形态还原', (bench.run_path(self.data['id'])/'REPORT.md').read_text(encoding='utf-8'))

    def test_changed_reference_stops_before_any_api_request(self):
        (bench.run_path(self.data['id'])/self.data['reference']['file']).write_bytes(b'changed')
        with patch.object(bench, 'call_model') as call:
            with self.assertRaisesRegex(ValueError, '参考图校验失败'):
                bench.generate(self.data, self.entry)
            call.assert_not_called()

    def test_pure_vector_check_rejects_raster_and_xml_base(self):
        for extra in ['<image href="data:image/png;base64,AAAA"/>', '<filter><feImage href="#a"/></filter>', '<g xml:base="file:///C:/"/>']:
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                svg_task.extract_and_validate(SVG.replace('</svg>',extra+'</svg>'))

    def test_image_rejection_is_not_retried_as_text_only(self):
        record={'status':'error','http_status':400,'error':'image input is not supported'}
        with patch.object(bench,'call_model',return_value=record) as call:
            bench.generate(self.data,self.entry)
        self.assertEqual(call.call_count,1)
        self.assertTrue(self.entry['vision_unsupported'])
        self.assertEqual(self.entry['status'],'writer_failed')
        self.assertNotIn('grade',self.entry)

    def test_reference_rubric_and_recovery_preserve_scores(self):
        raw=json.dumps(GRADE).replace(', "strengths":','} , "strengths":',1)
        recovered, info=svg_task.recover_grade(raw,svg_reference.RUBRIC)
        self.assertEqual(recovered['scores'],GRADE['scores'])
        self.assertFalse(info['scores_changed'])
        wrong=copy.deepcopy(GRADE);wrong['scores']['likeness']=41
        with self.assertRaises(ValueError):svg_task.parse_grade(json.dumps(wrong),svg_reference.RUBRIC)


if __name__ == '__main__':
    unittest.main()
