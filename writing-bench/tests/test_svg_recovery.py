import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx

import bench
import finish_svg


class RecoveryIntegrity(unittest.TestCase):
    def test_real_sse_keepalive_cannot_bypass_request_deadline(self):
        response = httpx.Response(200, stream=httpx.ByteStream(b'event: ping\ndata: {"type":"ping"}\n\n'))
        with self.assertRaisesRegex(TimeoutError, '600 seconds'):
            list(bench.proxy._iter_sse_events(response, deadline=0))
        response.close()

    def test_stream_deadline_also_applies_before_text(self):
        stream=object.__new__(bench.RecordedStream)
        stream._resp=None;stream.result=None;stream.deadline=0
        with patch.object(bench.proxy,'_iter_sse_events',return_value=iter([('ping',{'type':'ping'})])):
            with self.assertRaisesRegex(TimeoutError,'600 seconds'):list(stream.text_stream)

    def test_unrenderable_submission_does_not_block_human_first_reveal(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(bench,'RUNS',Path(temp)):
            data={'id':'run-20261019-120000-abcdef','state':'complete_with_errors',
                  'entries':[{'id':'art-001','model':'one','status':'scored','text':'complete SVG','grade':{'total':50}},
                             {'id':'art-002','model':'two','status':'scored','text':'<svg','render_status':'failed','grade':{'total':0}}]}
            finish_svg.separate_failed_deliveries(data);bench.save_run(data)
            public=bench.save_human(data['id'],'art-001',42)
            self.assertTrue(public['all_human_scored'])
            self.assertFalse(public['ranking_unlocked'])
            self.assertNotIn('grade',public['entries'][0])
            self.assertNotIn('grade',public['entries'][1])
            with self.assertRaises(ValueError):bench.save_human(data['id'],'art-002',0)
            public=bench.reveal(data['id'])
            self.assertTrue(public['ranking_unlocked'])
            self.assertEqual(public['entries'][0]['grade']['total'],50)
            self.assertNotIn('grade',public['entries'][1])

    def test_staging_import_preserves_previous_attempts_and_skips_existing_work(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(bench,'ROOT',Path(temp)), patch.object(bench,'RUNS',Path(temp)/'runs'):
            data={'id':'run-20261019-120000-abcdef','prompt_sha256':'prompt','writer_system':'system',
                  'entries':[{'id':'art-001','model':'author','status':'writer_failed','writer_attempts':2},
                             {'id':'art-002','model':'author-two','status':'written','text':'keep original'}]}
            root=bench.run_path(data['id'])/'entries'
            folder=root/'art-001';folder.mkdir(parents=True)
            (folder/'writer-attempt-1.json').write_text('original failure',encoding='utf-8')
            for entry in data['entries']:
                staged=bench.ROOT/'recovery-staging'/data['id']/'entries'/entry['id']
                recovered=copy.deepcopy(entry)
                recovered.update(status='written',text='new work',writer_attempts=3,
                    budget_recovery={'new_cap':32768,'prompt_sha256':'prompt','system_sha256':hashlib.sha256(b'system').hexdigest()})
                bench.write_json(staged/'recovery-result.json',recovered)
                (staged/'writer-attempt-3.json').write_text('recovery attempt',encoding='utf-8')
            self.assertEqual(finish_svg.merge_staged(data,{}),1)
            self.assertEqual(data['entries'][1]['text'],'keep original')
            self.assertEqual((folder/'writer-attempt-1.json').read_text(encoding='utf-8'),'original failure')
            self.assertEqual(data['entries'][0]['text'],'new work')
            self.assertEqual(finish_svg.merge_staged(data,{}),0)

    def test_render_sync_requires_exact_source_and_pixels(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(bench,'RUNS',Path(temp)):
            data={'id':'run-20261019-120000-abcdef','entries':[{'id':'art-001','render':{'sha256':'stale'},'status':'judge_failed'}]}
            folder=bench.run_path(data['id'])/'entries'/'art-001';folder.mkdir(parents=True)
            (folder/'preview.png').write_bytes(b'pixels');(folder/'artwork.svg').write_bytes(b'source\r\n')
            render={'sha256':hashlib.sha256(b'pixels').hexdigest(),'source_sha256':hashlib.sha256(b'source\n').hexdigest()}
            bench.write_json(folder/'render-sync.json',{'render':render})
            self.assertEqual(finish_svg.sync_render_metadata(data),1)
            self.assertEqual(data['entries'][0]['status'],'written')
            self.assertEqual(finish_svg.sync_render_metadata(data),0)
            (folder/'preview.png').write_bytes(b'changed')
            with self.assertRaises(AssertionError):finish_svg.sync_render_metadata(data)


if __name__=='__main__':unittest.main()
