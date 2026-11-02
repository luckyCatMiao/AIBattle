"""长篇轻小说评测：每个模型起一个真正的 Claude Code 子进程，不设守卫裁判。

与前两题（writing / svg）的区别：
  - 不是裸 /v1/messages 调用，而是 `claude -p --effort max` 子进程，模型可以自己
    规划、分章、续写，输出不受单次 max_tokens 限制。
  - 不设输出 token 上限、不设总时长上限、不设工具轮数上限。
  - 没有裁判、没有分数、没有排名。作品全部直接公开，由人自己读。
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import bench

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / 'novel-runs'
LOCK = threading.RLock()

EFFORT = 'max'
# 目标篇幅是给人读的节奏，不是硬性 token 预算；模型可以自行决定章节切分。
TARGET_CHARS = 5000

# GPT 系经 Claude Code 调用时，网关会在 thinking 块未结束时提前发
# content_block_stop，随后继续发同一块的 delta，CLI 报 malformed stream。
# 这些模型改走本地 cc_stream_proxy.py --normalize 修正块顺序。
STREAM_PROXY = {'gpt-5.6-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-6.1-sol',
                'gpt-6.1-terra', 'gpt-5.6', 'gpt-5.6-luna', 'gpt-5.6-terra',
                'gpt-6-sol', 'gpt-6.1-terra'}
PROXY_PORT = 8899
PROXY = None

PROMPT = '''请写一篇中文轻小说的开头部分，题材是“穿越到剑与魔法的异世界”的冒险故事。

要求：
1. 全篇不超过 5000 字（含标点）。这不是凑字数的任务，写到你认为这一段落刚好结束为止。
2. 你要在动笔前构思一个足够长的故事——一个完整的、有中途转折和终局的长篇冒险。但是**只写它的开头几章**，停在悬念处。
3. 结尾必须留下明确的悬念或未解之谜，让读者想继续读下一章；不要在这一篇里把故事讲完，也不要写“欲知后事如何”之类的说书话术，用情节本身制造悬念。
4. 主角的穿越方式、世界设定、魔法体系、同伴关系全部由你决定。避开最俗套的开局模板，给出你自己的理解。
5. 文风自然，有画面感和节奏；人物说话要像活人，不要用旁白解释性格，让读者从对话和行动里认识他们。
6. 只交小说正文。不要写创作说明、大纲、人物设定表、自评或“以下是小说”之类的前言。

请直接输出完整的小说正文。'''

# 第二轮：同人续写。与上一轮刻意相反——要连载爽文的节奏，不要文学腔。
DOUPO_PROMPT = '''请为《斗破苍穹》写一段同人续写。

设定：双帝之战结束后十年，斗气大陆。萧炎、美杜莎、萧薰儿等人的故事已经落幕十年，大陆格局、势力、修炼体系都在悄悄变化。

要求：
1. 全篇不超过 5000 字（含标点）。只写这一段的开头，不要试图把十年全写完。
2. **这是连载爽文，不是文艺小说。** 要有人物、对话、冲突、实力展现和爽点。节奏要快，开局就要有这个世界的“大事在发生”的感觉。
3. 主角可以是原著人物，也可以是新人物；视角由你决定。但要写出一件**十年之后才会发生**的具体事情——某个人、某个势力、某种异变，而不是重复原著已有的剧情。
4. 可以少量引用原著名词（斗气、斗师、斗尊、异火、炼药师、魂殿、迦南学院、魔兽山脉等），但不要大量复述原著情节，也不要抄原文句子。这是新写的故事。
5. 结尾留一个明确的钩子，让人想读下一章。
6. 只交小说正文。不要写创作说明、人物小传、情节大纲、自评，也不要在开头写“以下是续写”之类的话。

请直接输出完整的小说正文。'''

SYSTEM = '你是一名中文网络小说作者。完成用户的创作委托，只输出小说正文。'


def now():
    return bench.now()


def path_for(run_id):
    if not re.fullmatch(r'novel-\d{8}-\d{6}-[a-f0-9]{6}', run_id):
        raise ValueError('Invalid run ID')
    return RUNS / run_id


def load(run_id):
    with LOCK:
        return bench.read_json(path_for(run_id) / 'run.json')


def save(data):
    with LOCK:
        data['updated_at'] = now()
        bench.write_json(path_for(data['id']) / 'run.json', data)


def create(title=None, models=None, prompt=None, system=None):
    available = bench.model_ids()
    if models is not None:
        if not isinstance(models, list) or not all(isinstance(m, str) for m in models):
            raise ValueError('models 必须是模型名称数组')
        models = list(dict.fromkeys(models))
        if any(m not in available for m in models):
            raise ValueError('请选择配置列表中的模型')
    else:
        models = available

    prompt = (prompt or PROMPT).strip()
    system = system or SYSTEM

    # 稿号随机、与模型无关，避免读者从顺序推断作者。
    ordered = models[:]
    import random
    random.SystemRandom().shuffle(ordered)

    run_id = 'novel-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    data = dict(
        id=run_id,
        title=str(title or '穿越剑与魔法的异世界')[:120],
        created_at=now(),
        state='queued',
        kind='novel',
        prompt=prompt,
        system=system,
        prompt_sha256=hashlib.sha256(prompt.encode()).hexdigest(),
        parameters=dict(
            invocation='claude-code-cli',
            effort=EFFORT,
            target_chars=TARGET_CHARS,
            max_tokens=None,
            deadline_seconds=None,
            total_output_limit=None,
            output_override=False,
            tools=True,
            concurrency=max(1, len(ordered)),
            judge=None,
            scoring=None,
        ),
        entries=[
            dict(id=f'稿-{i + 1:02d}', model=m, status='queued',
                 session_id=str(uuid.uuid4()))
            for i, m in enumerate(ordered)
        ],
    )
    save(data)
    (ROOT / 'latest-novel-run.txt').write_text(run_id, encoding='utf-8')
    return data


def start_stream_proxy(base_url, run_id, models):
    """GPT 系模型经本地代理修正流式块顺序；只转发真实 CLI 请求。

    返回代理地址；不需要代理时返回 None。
    """
    global PROXY
    if not (STREAM_PROXY & set(models)):
        return None
    script = str(ROOT / 'cc_stream_proxy.py')
    log = str(path_for(run_id) / 'stream-proxy.log')
    PROXY = subprocess.Popen(
        [sys.executable, script, '--base', base_url, '--port', str(PROXY_PORT),
         '--log', log, '--normalize'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
    )
    for _ in range(50):
        try:
            s = socket.create_connection(('127.0.0.1', PROXY_PORT), 0.5)
            s.close()
            print(f'stream proxy ready on {PROXY_PORT}', flush=True)
            return f'http://127.0.0.1:{PROXY_PORT}'
        except OSError:
            time.sleep(0.2)
    raise RuntimeError('流式修正代理未能启动')


def stop_stream_proxy():
    global PROXY
    if PROXY is not None:
        try:
            PROXY.terminate()
        except OSError:
            pass
        PROXY = None


def provision_homes(data, proxy_url=None):
    """每个模型一个私有 HOME，credentials 只落到那里，不进项目目录。

    与 soccer/arena/train.py 的本机直跑模式一致：不设隔离时用 tempfile，
    claude 取 PATH 里的原生命令。
    """
    host = Path(os.environ.get('USERPROFILE', str(Path.home()))) / '.claude' / 'settings.json'
    settings = json.loads(host.read_text(encoding='utf-8-sig'))
    base_env = dict(settings.get('env', {}))
    for key in ('CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_THINKING_TOKENS', 'CLAUDE_CODE_EFFORT_LEVEL'):
        base_env.pop(key, None)
    base_env['DISABLE_AUTOUPDATER'] = '1'

    tmp_root = Path(tempfile.mkdtemp(prefix='aibattle-novel-homes-'))
    homes = {}
    for entry in data['entries']:
        folder = tmp_root / entry['id']
        claude_dir = folder / '.claude'
        claude_dir.mkdir(parents=True, exist_ok=True)
        env = dict(base_env)
        # GPT 系走本地修正代理。
        if proxy_url and entry['model'] in STREAM_PROXY:
            env['ANTHROPIC_BASE_URL'] = proxy_url
        cfg = {'env': env, 'model': entry['model'], 'disableAllHooks': True}
        for key in ('modelPicker', 'modelSettings'):
            if key in settings:
                cfg[key] = settings[key]
        target = claude_dir / 'settings.json'
        target.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass
        # 跳过引导流程，否则子进程会卡在首次启动。
        (folder / '.claude.json').write_text(json.dumps({
            'hasCompletedOnboarding': True,
            'lastOnboardingVersion': '2.1.312',
            'numStartups': 1,
            'autoUpdates': False,
        }), encoding='utf-8')
        homes[entry['id']] = folder
    bench.write_json(path_for(data['id']) / 'homes.json', {k: str(v) for k, v in homes.items()})
    return homes


def cli_command(model, session, workspace, settings_file):
    return [
        'claude', '-p',
        '--model', model,
        '--effort', EFFORT,
        '--settings', str(settings_file),
        '--setting-sources', '',
        '--strict-mcp-config', '--no-chrome',
        '--permission-mode', 'acceptEdits',
        '--allowedTools', 'Read,Write,Edit,Glob,Grep',
        '--tools', 'Read,Write,Edit,Glob,Grep',
        '--add-dir', str(workspace),
        '--output-format', 'stream-json', '--verbose',
        '--session-id', session,
    ]


def filtered(event):
    """丢弃思考正文，只保留事件结构。"""
    if isinstance(event, list):
        return [filtered(e) for e in event]
    if isinstance(event, dict):
        if event.get('type') in ('thinking', 'redacted_thinking', 'thinking_delta', 'signature_delta'):
            return {'type': event['type'], 'omitted': True}
        return {k: filtered(v) for k, v in event.items() if k not in ('thinking', 'signature')}
    return event


def invoke(data, entry, home, attempt):
    folder = path_for(data['id']) / 'entries' / entry['id']
    workspace = folder / 'workspace'
    workspace.mkdir(parents=True, exist_ok=True)
    settings_file = home / '.claude' / 'settings.json'

    command = cli_command(entry['model'], entry['session_id'], workspace, settings_file)
    bench.write_json(folder / f'invocation-{attempt:04d}.json', dict(
        at=now(), method='claude-code-cli', command=command, effort=EFFORT,
        workspace=str(workspace), output_limit_override=False, total_timeout=None,
        max_tokens=None, note='不设输出 token 上限与总时长上限',
    ))

    env = dict(os.environ)
    env['HOME'] = str(home)
    env['USERPROFILE'] = str(home)
    env['DISABLE_AUTOUPDATER'] = '1'
    env.pop('CLAUDECODE', None)          # 避免被识别为嵌套会话而拒绝启动
    env.pop('CLAUDE_CODE_ENTRYPOINT', None)
    env.pop('CLAUDE_CODE_SESSION_ID', None)
    env.pop('CLAUDE_CODE_CHILD_SESSION', None)

    begin = time.monotonic()
    with (folder / f'stderr-{attempt:04d}.log').open('w', encoding='utf-8') as err, \
         (folder / f'events-{attempt:04d}.jsonl').open('w', encoding='utf-8') as out:
        process = subprocess.Popen(
            command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=err,
            text=True, encoding='utf-8', errors='replace', cwd=str(workspace), env=env,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
        with LOCK:
            entry.update(status='writing', pid=process.pid, attempt=attempt, started_at=now())
            save(data)
        if process.stdin:
            process.stdin.write(data['prompt'])
            process.stdin.close()

        result = None
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                out.write(json.dumps({'type': 'non_json', 'text': line}, ensure_ascii=False) + '\n')
                out.flush()
                continue
            out.write(json.dumps(filtered(event), ensure_ascii=False) + '\n')
            out.flush()
            if event.get('type') == 'system' and event.get('subtype') == 'init':
                with LOCK:
                    entry.update(reported_model=event.get('model'), cli_tools=event.get('tools'))
                    save(data)
            if event.get('type') == 'result':
                result = filtered(event)
        code = process.wait()

    elapsed = round(time.monotonic() - begin, 1)
    bench.write_json(folder / f'result-{attempt:04d}.json',
                     dict(exit_code=code, result=result, elapsed_seconds=elapsed))
    return code, result, elapsed


# 题目文件绝不能当成交付正文；它是我们自己写进工作区的。
TASK_FILES = {'TASK.md', 'task.md'}


def looks_like_manuscript(text, prompt=None):
    """粗筛：排除空文、纯英文说明、和题目几乎相同的文本。"""
    if not text or len(text) < 200:
        return False
    if prompt and text.strip() == prompt.strip():
        return False
    if text.strip() == PROMPT.strip() or text.strip() == DOUPO_PROMPT.strip():
        return False
    han = len(re.findall(r'[一-鿿]', text))
    return han >= 100


def collect_manuscript(folder, result=None, prompt=None):
    """取模型交付的正文。

    优先级：
      1. 约定文件名 novel.md / novel.txt（模型按提示写入工作区）
      2. Claude Code 的 result 事件正文（模型把小说直接写在回复里）
      3. 工作区里其他 md/txt，排除 TASK.md 与题目原文

    返回 (text, 来源描述)；找不到返回 (None, None)。
    """
    candidates = [folder / 'novel.md', folder / 'novel.txt',
                  folder / 'story.md', folder / 'story.txt']
    ws = folder / 'workspace'
    candidates += [ws / 'novel.md', ws / 'novel.txt', ws / 'story.md', ws / 'story.txt']

    for path in candidates:
        if path.is_file():
            text = path.read_text(encoding='utf-8-sig', errors='replace').strip()
            if looks_like_manuscript(text, prompt):
                return text, str(path.relative_to(folder))

    # 模型常常只在最后一条消息里输出全文，这是最常见的情况。
    if result:
        body = (result.get('result') or '').strip()
        if looks_like_manuscript(body, prompt):
            return body, 'result-event'

    if ws.is_dir():
        found = [p for p in ws.rglob('*')
                 if p.is_file() and p.suffix.lower() in ('.md', '.txt')
                 and p.name not in TASK_FILES
                 and 'node_modules' not in p.parts]
        for path in sorted(found, key=lambda p: -p.stat().st_size):
            text = path.read_text(encoding='utf-8-sig', errors='replace').strip()
            if looks_like_manuscript(text):
                return text, str(path.relative_to(folder))
    return None, None


def author(data, entry, home):
    folder = path_for(data['id']) / 'entries' / entry['id']
    (folder / 'workspace').mkdir(parents=True, exist_ok=True)
    (folder / 'workspace' / 'TASK.md').write_text(data['prompt'], encoding='utf-8')

    prompt = ('请阅读 TASK.md，把这篇轻小说的开头几章写到 TASK.md 要求的篇幅与悬念处。\n'
              '正文必须用 Write 工具写入工作区的 novel.md 文件（这是交付物，缺了就算没交）。\n'
              '写完在回复里只留一两句说明，不要复述全文。')

    attempt = entry.get('attempt', 0)
    max_attempts = int(data['parameters'].get('technical_attempts') or 3)
    last_error = None
    while attempt < max_attempts:
        attempt += 1
        # 每次尝试都换一个新 session：复用 --session-id 会被 Claude Code 以
        # "Session ID is already in use" 拒绝，导致重试永远失败。
        entry['session_id'] = str(uuid.uuid4())
        try:
            code, result, elapsed = invoke(data, entry, home, attempt)
            if code or not result:
                raise RuntimeError(f'Claude Code 退出码 {code}，见 stderr 与 result 记录')
            if result.get('is_error'):
                raise RuntimeError('Claude Code 本次会话报错：' + str(result.get('result'))[:500])
            if entry.get('reported_model') != entry['model']:
                raise RuntimeError('Claude Code 报告的模型与指定模型不同：'
                                   f'{entry.get("reported_model")!r} != {entry["model"]!r}')

            text, source = collect_manuscript(folder, result, data.get('prompt'))
            if not text:
                raise RuntimeError('工作区里没有找到交付的正文')

            chars = len(re.sub(r'\s', '', text))
            han = len(re.findall(r'[一-鿿]', text))
            with LOCK:
                entry.update(
                    status='ready',
                    text=text,
                    source_file=source or None,
                    text_sha256=hashlib.sha256(text.encode()).hexdigest(),
                    chars=chars,
                    han_chars=han,
                    writer=dict(
                        invocation='claude-code-cli', effort=EFFORT,
                        elapsed_seconds=elapsed,
                        output_tokens=(result.get('usage') or {}).get('output_tokens'),
                        stop_reason='Claude Code completed',
                        over_target=chars > TARGET_CHARS * 1.1,
                    ),
                    completed_at=now(),
                )
                save(data)
            print(f'{entry["model"]} ready ({chars} 字符)', flush=True)
            return
        except Exception as exc:
            error = bench.sanitize(exc)
            last_error = error
            with LOCK:
                entry.update(status='writing', last_error=error, retry_at=now())
                save(data)
            print(f'{entry["model"]} retry {attempt}/{max_attempts}: {error}', flush=True)
            if attempt < max_attempts:
                time.sleep(min(60, attempt * 5))

    with LOCK:
        entry.update(status='writer_failed', last_error=last_error, failed_at=now())
        save(data)
    print(f'{entry["model"]} FAILED: {last_error}', flush=True)


def run(data):
    settings = bench.config()
    proxy_url = start_stream_proxy(settings['env']['ANTHROPIC_BASE_URL'],
                                   data['id'], [e['model'] for e in data['entries']])
    homes = provision_homes(data, proxy_url)
    with LOCK:
        data.update(state='writing', controller_pid=os.getpid())
        save(data)

    pending = [e for e in data['entries'] if e['status'] not in ('ready', 'writer_failed')]
    # 用固定大小的 worker 池，而不是分批：某个模型思考很久也不会把后面
    # 所有人的稿子堵在队列里。池子空了才补下一个。
    workers = max(1, int(data['parameters'].get('concurrency') or 6))
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(lambda e: author(data, e, homes[e['id']]), pending))

    stop_stream_proxy()
    with LOCK:
        done = all(e['status'] == 'ready' for e in data['entries'])
        data.update(state='complete' if done else 'complete_with_errors', finished_at=now())
        save(data)
        write_report(data)
    print('NOVEL RUN FINISHED ' + data['id'], flush=True)


def write_report(data):
    """没有裁判、没有排名：按随机稿号顺序把全文并排放在一起。"""
    lines = [f'# {data["title"]}', '',
             f'共 {len(data["entries"])} 篇。全部由 Claude Code 子进程撰写，effort={EFFORT}，不设输出与时长上限。',
             '本轮没有裁判打分、没有排名。以下按随机稿号排列，请自行阅读判断。', '']
    for entry in data['entries']:
        lines += ['---', '', f'## {entry["id"]} · {entry["model"]}', '']
        if entry.get('text'):
            w = entry.get('writer') or {}
            lines += [f'*{entry.get("chars", 0)} 字符 · 用时 {w.get("elapsed_seconds", "?")} 秒*', '',
                      entry['text'], '']
        else:
            lines += [f'*未完成：{entry.get("last_error", entry["status"])}*', '']
    (path_for(data['id']) / 'REPORT.md').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--create', action='store_true')
    parser.add_argument('--run')
    parser.add_argument('--models', nargs='*')
    args = parser.parse_args()
    bench.initialize_credentials()
    if args.create:
        print(create(models=args.models)['id'])
    if args.run:
        run(load(args.run))
