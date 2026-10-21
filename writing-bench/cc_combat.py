"""Real Claude Code projects, isolated with bubblewrap, no direct model API."""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import threading
import time
import uuid
import bench
import combat_bench as combat

ROOT = Path(__file__).resolve().parent
LOCK = threading.RLock()
BRIEF = combat.PROMPT.split('技术交付：')[0] + '''
你现在运行在真正的 Claude Code 中，有自己的独立项目 /workspace，可用文件读写、Bash、Node、Python 和 git。自行规划、创建项目、编写代码、运行检查、迭代和修复。不是在聊天里输出一段源码。不得阅读其他选手源码，环境也不挂载其他项目。不允许调用其他模型代做或使用生图接口。

项目组织、辅助文件与开发流程由你决定，最终在 /workspace/game.html 交付可离线直接玩的完整独立 HTML（可用自己的构建脚本将多文件源码打包到这里）。保留你写的源文件、构建脚本与说明，方便后续核对项目规模。最终游戏不得依赖网络、CDN 或外部资源；图形和音效自行绘制/合成。运行在 allow-scripts 的沙箱 iframe 中，不可依赖 localStorage、父窗口、下载、弹窗或网络。游戏中不要显示作者模型身份。

提供只读 window.combatBenchState()，返回真实状态 JSON：ready、playerAlive、enemyCount、hitCount、limbBreakCount、playing。不能为了检查伪造状态或削弱正常玩法。

没有人为设置输出额度、项目代码行数、开发总时长或工具轮数上限。请自主完成你认为值得交付的作品，完整检查并修复后再结束。本轮只评最终可玩版本的打击感，不评一次编译通过、编码过程或代码量。不是要求无限工作，完成你认为足够打磨的系统即可交付。结束时简要中文说明玩法与自测结果；不要在回复里粘贴整份代码。'''


def sandbox(run, entry, command):
    return ['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'runuser', '-u', 'nobody', '--',
            'python3', '/mnt/c/Users/Admin/Desktop/AIBattle/writing-bench/cc_sandbox.py', run, entry, *command]


def cli_command(model, session, resume=False):
    return ['claude', '-p', '--model', model, '--effort', 'high', '--safe-mode',
            '--settings', '/home/player/.claude/settings.json', '--setting-sources', '',
            '--strict-mcp-config', '--no-chrome', '--permission-mode', 'acceptEdits',
            '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep',
            '--tools', 'Bash,Read,Write,Edit,Glob,Grep',
            '--output-format', 'stream-json', '--verbose',
            '--resume' if resume else '--session-id', session]


def create():
    run = 'combat-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    data = dict(id=run, title='Claude Code 独立项目 · 打击感', created_at=bench.now(),
                state='queued', prompt=BRIEF, prompt_sha256=hashlib.sha256(BRIEF.encode()).hexdigest(),
                invocation_method='claude-code-cli',
                parameters=dict(effort='high', tools=True, concurrency=17, deadline_seconds=None,
                                total_output_limit=None, output_override=False, cli_version='2.1.296'),
                entries=[dict(id=f'作品-{i+1:02d}', model=m, status='queued', session_id=str(uuid.uuid4()))
                         for i, m in enumerate(bench.model_ids())])
    combat.save(data)
    for e in data['entries']:
        folder = combat.path_for(run) / 'entries' / e['id'] / 'project'
        folder.mkdir(parents=True)
        (folder / 'TASK.md').write_text(BRIEF, encoding='utf-8')
    (ROOT / 'latest-combat-run.txt').write_text(run, encoding='utf-8')
    return data


def setup(data):
    # Feed credentials to a private Linux home, never command arguments or logs.
    settings = bench.config()
    cfg = {k: settings[k] for k in ('env', 'modelPicker') if k in settings}
    cfg['env'] = {k: v for k, v in cfg.get('env', {}).items()
                  if k not in ('CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_THINKING_TOKENS', 'CLAUDE_CODE_EFFORT_LEVEL')}
    payload = dict(run=data['id'], entries=[e['id'] for e in data['entries']], settings=cfg)
    script = '''import json,os,pathlib,sys
d=json.load(sys.stdin)
for entry in d['entries']:
 p=pathlib.Path('/opt/aibattle-cc')/d['run']/entry/'home'/'.claude'
 p.mkdir(parents=True,exist_ok=True)
 f=p/'settings.json'; f.write_text(json.dumps(d['settings']))
 os.chmod(f,0o600)
 for item in [p.parent,p,f]:os.chown(item,65534,65534)
'''
    subprocess.run(['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'python3', '-c', script],
                   input=json.dumps(payload), text=True, encoding='utf-8', check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW)


def filtered(event):
    if isinstance(event, list):
        return [filtered(e) for e in event]
    if isinstance(event, dict):
        if event.get('type') in ('thinking', 'redacted_thinking', 'thinking_delta', 'signature_delta'):
            return {'type': event['type'], 'omitted': True}
        return {k: filtered(v) for k, v in event.items() if k not in ('thinking', 'signature')}
    return event


def line_counts(project):
    files = []
    for path in sorted(project.rglob('*')):
        if not path.is_file() or any(p in ('node_modules', '.git', '.venv', '__pycache__') for p in path.parts):
            continue
        if path.suffix.lower() not in ('.html', '.js', '.mjs', '.cjs', '.ts', '.css', '.json', '.py', '.sh'):
            continue
        raw = path.read_text(encoding='utf-8', errors='replace')
        files.append(dict(path=str(path.relative_to(project)), lines=len(raw.splitlines()), bytes=path.stat().st_size))
    return dict(total_lines=sum(f['lines'] for f in files), files=files,
                note='物理行数，含注释空行；排除依赖目录；源文件与打包文件分别列出，总代码量可能含重复打包代码。')


def update(data, entry, **values):
    with LOCK:
        entry.update(values)
        if data.get('_write_run', True):
            combat.save(data)


def invoke(data, entry, prompt, resume, attempt):
    folder = combat.path_for(data['id']) / 'entries' / entry['id']
    command = cli_command(entry['model'], entry['session_id'], resume)
    bench.write_json(folder / f'invocation-{attempt:04d}.json',
                     dict(at=bench.now(), method='claude-code-cli', command=command, effort='high',
                          prompt=prompt, workspace='/workspace', host_project=str(folder / 'project'),
                          output_limit_override=False, total_timeout=None))
    begin = time.monotonic()
    with (folder / f'stderr-{attempt:04d}.log').open('w', encoding='utf-8') as err, \
         (folder / f'events-{attempt:04d}.jsonl').open('w', encoding='utf-8') as out:
        process = subprocess.Popen(sandbox(data['id'], entry['id'], command), stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=err, text=True, encoding='utf-8',
                                   errors='replace', creationflags=subprocess.CREATE_NO_WINDOW)
        update(data, entry, status='building', pid=process.pid, attempt=attempt, started_at=bench.now())
        process.stdin.write(prompt)
        process.stdin.close()
        result = None
        for line in process.stdout:
            try:
                event = json.loads(line)
            except ValueError:
                out.write(json.dumps({'type': 'non_json', 'text': line}, ensure_ascii=False) + '\n')
                out.flush()
                continue
            out.write(json.dumps(filtered(event), ensure_ascii=False) + '\n')
            out.flush()
            if event.get('type') == 'system' and event.get('subtype') == 'init':
                update(data, entry, reported_model=event.get('model'), cli_tools=event.get('tools'), initialized_at=bench.now())
            if event.get('type') == 'assistant':
                tools = [b.get('name') for b in event.get('message', {}).get('content', []) if b.get('type') == 'tool_use']
                update(data, entry, last_activity_at=bench.now(), last_tools=tools)
            if event.get('type') == 'result':
                result = filtered(event)
        code = process.wait()
    return dict(exit_code=code, result=result, elapsed_seconds=round(time.monotonic() - begin, 1))


def author(data, entry):
    folder = combat.path_for(data['id']) / 'entries' / entry['id']
    project = folder / 'project'
    attempt = entry.get('attempt', 0)
    resume = bool(entry.get('initialized_at'))
    prompt = '请阅读 /workspace/TASK.md，直接在本工作区独立完成游戏项目，并自测修复后交付 /workspace/game.html。'
    while True:
        attempt += 1
        try:
            outcome = invoke(data, entry, prompt, resume, attempt)
            resume = bool(entry.get('initialized_at'))
            bench.write_json(folder / f'result-{attempt:04d}.json', outcome)
            if outcome['exit_code'] or not outcome['result'] or outcome['result'].get('is_error'):
                raise RuntimeError('Claude Code 本次会话未成功结束；见 stderr 与 result 记录')
            if entry.get('reported_model') != entry['model']:
                raise RuntimeError('Claude Code 报告的模型与指定模型不同，不能冒充该选手交付')
            raw = (project / 'game.html').read_text(encoding='utf-8-sig')
            version = folder / 'versions' / f'v{attempt:04d}'
            version.mkdir(parents=True, exist_ok=True)
            validation = combat.prepare(raw, version)
            stats = line_counts(project)
            bench.write_json(folder / 'line-counts.json', stats)
            writer = dict(invocation_method='claude-code-cli', effort='high', elapsed_seconds=outcome['elapsed_seconds'],
                          stop_reason='Claude Code completed', output_tokens=(outcome['result'].get('usage') or {}).get('output_tokens'))
            bench.write_json(folder / 'development.json', dict(status='awaiting_check', artifact=f'versions/v{attempt:04d}',
                             validation=validation, writer=writer, source_sha256=hashlib.sha256((version/'game.html').read_bytes()).hexdigest()))
            update(data, entry, status='ready', writer=writer, validation=validation, code_lines=stats['total_lines'], completed_at=bench.now())
            print(entry['model'] + ' ready', flush=True)
            return
        except Exception as exc:
            error = str(exc)
            update(data, entry, status='building', last_error=error, retry_at=bench.now())
            print(entry['model'] + ' retry: ' + error, flush=True)
            prompt = '继续自己的项目，不要重写为精简演示。上一轮检查遇到：' + error + '\n请检查会话/工具错误并修复项目，完成后交付 /workspace/game.html。'
            time.sleep(min(60, attempt * 5))


def run(data):
    setup(data)
    terminal_path = combat.path_for(data['id']) / 'terminal-results.json'
    excluded = set(bench.read_json(terminal_path).get('entries', {})) if terminal_path.exists() else set()
    data.update(state='building', controller_pid=__import__('os').getpid())
    combat.save(data)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(data['entries'])) as pool:
        list(pool.map(lambda e: author(data, e), [e for e in data['entries']
                     if e['status'] != 'ready' and e['id'] not in excluded]))
    data.update(state='projects_delivered_with_exclusions' if excluded else 'projects_delivered', delivered_at=bench.now())
    combat.save(data)
    print('ALL ACTIVE PROJECTS DELIVERED ' + data['id'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--create', action='store_true')
    parser.add_argument('--run')
    args = parser.parse_args()
    if args.create:
        print(create()['id'])
    if args.run:
        run(combat.load(args.run))
