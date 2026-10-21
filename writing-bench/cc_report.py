"""Report completed CLI project sizes without scoring by code length."""
import argparse
import json
from pathlib import Path
import bench
import combat_bench as combat

CODE_EXTENSIONS = {'.html', '.js', '.mjs', '.cjs', '.ts', '.css', '.py', '.sh'}
DEPENDENCY_DIRS = {'node_modules', '.devtools', '.venv', 'venv', 'site-packages',
                   'vendor', 'third_party', 'third-party', '__pycache__'}


def project_code_file(path):
    # Line-count manifests can contain Windows separators even when read elsewhere.
    relative = Path(path.replace('\\', '/'))
    return (relative.suffix.lower() in CODE_EXTENSIONS
            and not any(part.lower() in DEPENDENCY_DIRS for part in relative.parts))


def report(run):
    data = combat.public(run)
    rows = []
    for entry in data['entries']:
        folder = combat.path_for(run) / 'entries' / entry['id']
        done = entry['status'] == 'ready' and entry.get('development', {}).get('status') == 'awaiting_check'
        row = dict(model=entry['model'], entry=entry['id'], completed=done,
                   project=str(folder/'project'), source_sha256=entry.get('source_sha256'),
                   administrative_result=entry.get('administrative_result'))
        if row['administrative_result']:
            row['completed'] = done = False
        if done:
            stats = bench.read_json(folder/'line-counts.json')
            game = combat.artifact_folder(run, entry)/'game.html'
            source = game.read_text(encoding='utf-8')
            code_files = [f for f in stats['files'] if project_code_file(f['path'])]
            row.update(game_lines=len(source.splitlines()), game_bytes=game.stat().st_size,
                       other_source_and_test_lines=sum(f['lines'] for f in stats['files']
                           if f['path'] != 'game.html' and project_code_file(f['path'])),
                       code_files=code_files)
        rows.append(row)
    count = sum(row['completed'] for row in rows)
    text = ['# Claude Code 项目规模', '', f'更新：{bench.now()}。已正式交付 {count}/{len(rows)} 个。', '',
            '全部开发由真正 Claude Code 完成，统一传 high，不额外设置输出额度、总开发时长或工具轮数。', '',
            '| 模型 | 状态 | 成品 HTML 行数 | 其他源码与自测行数 | 成品大小 |',
            '|---|---|---:|---:|---:|']
    for row in rows:
        if row['completed']:
            text.append(f"| {row['model']} | 已交付 | {row['game_lines']:,} | {row['other_source_and_test_lines']:,} | {row['game_bytes']/1024:.1f} KB |")
        elif row['administrative_result']:
            text.append(f"| {row['model']} | 用户指定停止，0 分 | — | — | — |")
        else:
            text.append(f"| {row['model']} | 尚未完成 | — | — | — |")
    text += ['', '统计物理行数，含空行和注释；排除 node_modules、.devtools、虚拟环境、vendor 等依赖目录及 JSON 配置/锁文件。其他源码与自测列可能含构建产物，成品 HTML 也可能打包相同源码，两列不相加当作独立代码量。代码量不参与打击感评分。', '',
             '实际连续手感评分需有效交战证据。服务故障、开发时长和修复次数不扣作品分。', '']
    folder = combat.path_for(run)
    bench.write_json(folder/'project-sizes.json', dict(at=bench.now(), completed=count, total=len(rows), rows=rows))
    (folder/'PROJECT_SIZES.md').write_text('\n'.join(text), encoding='utf-8')
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run')
    args = parser.parse_args()
    print('Reported completed projects:', report(args.run))
