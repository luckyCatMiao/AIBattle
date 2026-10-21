"""Encode actual Chrome screencast frames at their recorded wall-clock speed."""
import argparse
import json
import math
from pathlib import Path
import statistics
import subprocess

import imageio_ffmpeg


def export(folder):
    timeline = json.loads((folder/'timeline.json').read_text(encoding='utf-8'))
    frames = timeline['frames']
    if len(frames) < 2:
        raise ValueError('Not enough recorded frames')
    deltas = [b['timestamp']-a['timestamp'] for a, b in zip(frames, frames[1:])]
    if any(not math.isfinite(dt) or dt <= 0 for dt in deltas):
        raise ValueError('Non-monotonic frame timestamps')
    lines = ['ffconcat version 1.0']
    for i, frame in enumerate(frames):
        name = frame['file']
        if Path(name).name != name or "'" in name or not name.endswith('.jpg'):
            raise ValueError('Unsafe frame name')
        duration = deltas[i] if i < len(deltas) else statistics.median(deltas)
        lines += ["file '"+name+"'", 'option framerate 1000', f'duration {duration:.9f}']
    concat = folder/'frames.ffconcat'
    concat.write_text('\n'.join(lines)+'\n', encoding='utf-8')
    output = folder/'clip.mp4'
    command = [imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error',
        '-y', '-safe', '0', '-f', 'concat', '-i', str(concat.resolve()),
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-r', '60', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'fast',
        '-crf', '20', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', str(output.resolve())]
    subprocess.run(command, check=True, capture_output=True)
    reader = imageio_ffmpeg.read_frames(str(output))
    try:
        actual = next(reader)
    finally:
        reader.close()
    expected = frames[-1]['timestamp']-frames[0]['timestamp']+statistics.median(deltas)
    if abs(actual['duration']-expected) > .15:
        raise ValueError('Encoded duration does not match real recording')
    metadata = dict(source_sha256=timeline['source_sha256'], key=timeline.get('key'),
        input_frames=len(frames), recorded_seconds=expected, encoded_seconds=actual['duration'],
        audio_recorded=False, output_fps=60,
        note='按浏览器帧时间戳以60FPS编码，必要时重复帧保持实际速度；原始帧保留，无音轨。')
    (folder/'clip-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(str(output)+' · '+str(actual['duration'])+'s', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folders', nargs='+', type=Path)
    args = parser.parse_args()
    for folder in args.folders:
        export(folder)
