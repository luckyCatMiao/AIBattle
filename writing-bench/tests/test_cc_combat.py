import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import bench
import cc_combat as cc


class ClaudeCodeTests(unittest.TestCase):
    def test_resume_does_not_restart_user_selected_zero_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bench.write_json(root / 'terminal-results.json', {
                'entries': {'作品-01': {'total': 0, 'origin': 'user_instruction'}}})
            data = {'id': 'test-run', 'entries': [
                {'id': '作品-01', 'status': 'cancelled'},
                {'id': '作品-02', 'status': 'cancelled'},
                {'id': '作品-03', 'status': 'ready'}]}
            with patch.object(cc, 'setup'), patch.object(cc.combat, 'save'), \
                 patch.object(cc.combat, 'path_for', return_value=root), \
                 patch.object(cc, 'author') as author:
                cc.run(data)
            self.assertEqual([call.args[1]['id'] for call in author.call_args_list], ['作品-02'])
            self.assertEqual(data['state'], 'projects_delivered_with_exclusions')

    def test_transient_windows_read_lock_does_not_kill_monitor(self):
        with patch.object(Path, 'read_text', side_effect=[PermissionError('sharing'), '{"state":"building"}']), \
             patch.object(bench.time, 'sleep'):
            self.assertEqual(bench.read_json(Path('run.json')), {'state': 'building'})

    def test_real_cli_has_tools_high_and_no_budget_flags(self):
        cmd = cc.cli_command('gpt-6.1-sol', 'example-session')
        self.assertEqual(cmd[0:2], ['claude', '-p'])
        self.assertEqual(cmd[cmd.index('--effort') + 1], 'high')
        self.assertIn('Bash,Read,Write,Edit,Glob,Grep', cmd)
        for forbidden in ('--max-budget-usd', '--max-turns', '--max-tokens', 'timeout'):
            self.assertNotIn(forbidden, cmd)
        self.assertIn('--resume', cc.cli_command('gpt-6.1-sol', 'example-session', True))

    def test_statistics_exclude_dependencies_and_include_authored_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            (project / 'game.html').write_text('<html>\n</html>\n')
            (project / 'src').mkdir()
            (project / 'src/main.js').write_text('const a = 1;\n')
            (project / 'node_modules').mkdir()
            (project / 'node_modules/vendor.js').write_text('x\n' * 50)
            result = cc.line_counts(project)
            self.assertEqual(result['total_lines'], 3)
            self.assertEqual(len(result['files']), 2)

    def test_thinking_not_saved_as_public_log_content(self):
        event = {'message': {'content': [{'type': 'thinking', 'thinking': 'private'},
                                         {'type': 'tool_use', 'name': 'Write', 'input': {'file_path': '/workspace/game.html'}}]}}
        output = json.dumps(cc.filtered(event))
        self.assertNotIn('private', output)
        self.assertIn('Write', output)


if __name__ == '__main__':
    unittest.main()
