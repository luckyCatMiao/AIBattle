import unittest
from cc_stream_proxy import Blocks, OrderedBlocks


class StreamCompatibilityTests(unittest.TestCase):
    def test_premature_stop_is_deferred_without_losing_any_content(self):
        blocks = OrderedBlocks()
        stream = [
            {'type': 'message_start'},
            {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'thinking', 'thinking': ''}},
            {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'thinking_delta', 'thinking': 'dummy-a'}},
            {'type': 'content_block_stop', 'index': 0},
            {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'thinking_delta', 'thinking': 'dummy-b'}},
            {'type': 'content_block_start', 'index': 1, 'content_block': {'type': 'text', 'text': ''}},
            {'type': 'content_block_delta', 'index': 1, 'delta': {'type': 'text_delta', 'text': 'unchanged'}},
            {'type': 'content_block_stop', 'index': 1},
            {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn'}},
            {'type': 'message_stop'},
        ]
        output = [item for event in stream for item in blocks.transform(event)]
        self.assertEqual([e['delta'] for e in output if e['type'] == 'content_block_delta'],
                         [e['delta'] for e in stream if e['type'] == 'content_block_delta'])
        self.assertEqual([e['type'] for e in output][3:6],
                         ['content_block_delta', 'content_block_stop', 'content_block_start'])

    def test_reused_gateway_indices_remap_without_changing_tool_arguments(self):
        blocks = Blocks()
        start = {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'thinking', 'thinking': ''}}
        self.assertEqual(blocks.transform(start)['index'], 0)
        blocks.transform({'type': 'content_block_stop', 'index': 0})
        tool = {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'tool_use', 'id': 'tool-1', 'name': 'Write', 'input': {}}}
        self.assertEqual(blocks.transform(tool)['index'], 1)
        delta = {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'input_json_delta', 'partial_json': '{"file_path":"/workspace/game.html","content":"hello"}'}}
        output = blocks.transform(delta)
        self.assertEqual(output['index'], 1)
        self.assertEqual(output['delta'], delta['delta'])

    def test_duplicate_close_is_dropped_but_unknown_content_is_never_dropped(self):
        blocks = Blocks()
        blocks.transform({'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}})
        stop = {'type': 'content_block_stop', 'index': 0}
        self.assertIsNotNone(blocks.transform(stop))
        self.assertIsNone(blocks.transform(stop))
        with self.assertRaises(ValueError):
            blocks.transform({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': 'new content'}})


if __name__ == '__main__':
    unittest.main()
