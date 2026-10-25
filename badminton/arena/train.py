"""Independent model competitors; frozen revisions; durable frame-by-frame replays."""
import argparse, concurrent.futures, gzip, hashlib, importlib.util, json, math, msvcrt, os, pathlib, random, re, shutil, socket, subprocess, sys, tempfile, threading, time, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
CONTROL = ROOT / 'control'
# 复用 rts 系列已经写好并验证过的模型客户端与沙箱传输层。
spec = importlib.util.spec_from_file_location('legacy_transport', ROOT.parents[1] / 'rts' / 'arena' / 'train.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
CATALOG = {
    'sol': 'gpt-6.1-sol', 'luna': 'gpt-6-luna', 'astra': 'gpt-6-astra', 'opus': 'claude-opus-5-5',
    # DeepSeek 通过 Claude Code CLI 使用，与 GPT 走同一条客户端路径。
    'deepseek-flash': 'deepseek-v4.1-flash', 'deepseek': 'deepseek-v4.1-flash',
}
LABELS = {
    'sol': 'GPT-6.1 Sol', 'luna': 'GPT-6 Luna', 'astra': 'GPT-6 Astra', 'opus': 'Claude Opus 5.5',
    'deepseek-flash': 'DeepSeek V4.1 Flash', 'deepseek': 'DeepSeek V4.1 Flash',
}
# 本轮所有对手都通过 Claude Code CLI 调用（不再使用 Codex CLI）。
CLIENTS = {w: 'claude' for w in CATALOG}
# GPT 系模型在当前网关下会出现「thinking 块提前结束、后续 delta 继续」的流式乱序，
# 需要本地顺序修正代理；DeepSeek 不需要。
STREAM_PROXY = {'sol', 'luna', 'astra'}
EFFORT = 'medium'
MODELS = {w: CATALOG[w] for w in ('opus', 'sol')}
transport.MODELS = MODELS
transport.LABELS = LABELS
RUN = None; REF = None; STATE = {}; GUARD = threading.Lock(); ARGS = None
STARTING = {}; INHERITED = {}; HISTORY = []; PROTECTED_HASHES = {}
NO_ISOLATION = False
SETTINGS_FILES = {}
HOMES_TMP = None
PROTECTED = ['RULES.md', 'GAME.md', 'simulation.js', 'catalog.js', 'example.json', 'canary.txt']
# 单局上限 240 秒，每窗口 10 帧（0.5 秒）；再留出得分后的停顿余量。
MAX_WINDOWS = 520


def wsl_path(p):
    """Windows 绝对路径 -> WSL /mnt/<drive>/... 路径。"""
    s = str(pathlib.Path(p).resolve())
    return '/mnt/' + s[0].lower() + '/' + s[3:].replace('\\', '/')


def model_command(who, output='submission.txt', seconds=0):
    """本轮统一使用 Claude Code；保留 codex 分支只用于显式配置的旧对手。

    seconds<=0 表示不包裹 timeout，准备阶段可以一直进行到模型自己结束。
    """
    # 本机直跑不套 timeout 包装：Windows 的 timeout.exe 与 GNU timeout 语法不同，
    # 时限交给 subprocess.run 的 timeout 参数。
    prefix = [] if (not seconds or seconds <= 0 or NO_ISOLATION) else [
        'timeout', '--signal=TERM', '--kill-after=10s', str(seconds) + 's']
    if CLIENTS.get(who, 'claude') == 'claude':
        settings = SETTINGS_FILES.get(who, '/home/player/.claude/settings.json') if NO_ISOLATION else '/home/player/.claude/settings.json'
        exe = (shutil.which('claude') or 'claude') if NO_ISOLATION else 'claude'
        return prefix + [exe, '-p',
                '--safe-mode', '--settings', settings, '--setting-sources', 'user',
                '--model', MODELS[who], '--effort', EFFORT, '--dangerously-skip-permissions',
                '--strict-mcp-config', '--disable-slash-commands', '--no-chrome', '--no-session-persistence',
                '--tools', 'Bash,Read,Write,Edit,Glob,Grep', '--output-format', 'stream-json', '--verbose']
    return prefix + ['codex', 'exec',
            '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check',
            '--dangerously-bypass-approvals-and-sandbox', '-m', MODELS[who],
            '-c', 'model_reasoning_effort="medium"', '-c', 'web_search="disabled"',
            '--disable', 'apps', '--disable', 'plugins', '--disable', 'multi_agent',
            '--disable', 'computer_use', '--disable', 'browser_use', '--disable', 'in_app_browser',
            '--disable', 'memories', '--disable', 'hooks', '--json', '-o', '/workspace/' + output, '-']


def completed_usage(who, events):
    if CLIENTS.get(who, 'claude') == 'claude':
        results = [e for e in events if e.get('type') == 'result']
        if len(results) != 1 or results[0].get('is_error') or results[0].get('subtype') != 'success':
            raise RuntimeError(who + ' did not complete successfully')
        init = [e for e in events if e.get('type') == 'system' and e.get('subtype') == 'init']
        if not init or init[0].get('model') != MODELS[who]:
            raise RuntimeError('Unexpected Claude Code model selection for ' + who)
        usage = results[0].get('modelUsage', {})
        if MODELS[who] not in usage:
            raise RuntimeError('Requested model missing from model usage: ' + who)
        return [{'usage': results[0].get('usage'), 'modelUsage': usage,
                 'reported_cost_usd': results[0].get('total_cost_usd')}]
    usage = [e['usage'] for e in events if e.get('type') == 'turn.completed']
    if not usage:
        raise RuntimeError(who + ': no completed model turn')
    return usage


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)


def hashed(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_history(run, seen=None):
    run = pathlib.Path(run).resolve()
    seen = set() if seen is None else seen
    if run in seen:
        raise RuntimeError('Cyclic series history')
    seen.add(run)
    config = json.loads((run / 'config.json').read_text(encoding='utf-8'))
    if config.get('from_run'):
        load_history(config['from_run'], seen)
    for result in json.loads((run / 'results.json').read_text(encoding='utf-8')):
        ident = 'history-' + run.name + '-' + result['id']
        HISTORY.append({**{k: v for k, v in result.items() if k not in ('sha256', 'windows')},
                        'original_id': result['id'], 'id': ident, 'source_run': run.name})


def isolated(who, mode, cmd):
    return ['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'runuser', '-u', 'nobody', '--', 'python3',
            wsl_path(ROOT / 'isolate.py'), who, mode, *cmd]


def probe(who, mode):
    other = next(w for w in MODELS if w != who)
    code = f'''import os,pathlib,json
assert os.getuid()==65534
assert pathlib.Path('/workspace/canary.txt').read_text().strip()=={who!r}
blocked=['/mnt/c','/mnt/d','/run/WSL','/mnt/wsl','/proc/1/root/mnt/c','/workspace/../{other}','/workspace/../{who}','/opt/aibattle-tools/auth','/home/admin1','/workspace/../../control']
for p in blocked:assert not pathlib.Path(p).exists(),p
if {mode!r}=='engine':
 assert not pathlib.Path('/home/player/.codex').exists()
 assert not pathlib.Path('/home/player/.claude').exists()
 assert len(pathlib.Path('/proc/net/route').read_text().splitlines())==1
 try:pathlib.Path('/workspace/canary.txt').write_text('bad')
 except OSError as e:assert e.errno in (13,30)
 else:raise AssertionError('Workspace writable')
print(json.dumps({{'who':{who!r},'mode':{mode!r},'uid':os.getuid(),'blocked':blocked,'readonly':{mode!r}=='engine'}}))
'''
    p = subprocess.run(isolated(who, mode, ['python3', '-']), input=code, text=True, encoding='utf-8',
                       capture_output=True, timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return json.loads(p.stdout)


def status(phase=None, **fields):
    with GUARD:
        if phase:
            STATE['phase'] = phase
        STATE.update(fields)
        STATE['updated'] = time.strftime('%Y-%m-%dT%H:%M:%S')
        save(RUN / 'status.json', STATE)
        save(CONTROL / 'status.json', STATE)
        print(json.dumps(STATE, ensure_ascii=False), flush=True)


def public_simulation():
    """公开引擎 = 去掉练习电脑的仿真源码，与裁判同源。

    练习电脑定义在文件末尾，连同导出项一起移除，否则选手侧 require 会引用未定义变量。
    """
    source = (ROOT.parent / 'simulation.js').read_text(encoding='utf-8')
    public = source[:source.index('/* ============================ 练习用电脑')] \
        + source[source.index('module.exports = {'):]
    return re.sub(r'botInput\s*,\s*', '', public)


def build_example_window(frames=10):
    """给选手一份可以照抄的合法窗口：10 帧 × 1 名球员。"""
    out = [[{'move': 0, 'jump': False, 'swing': 0, 'charge': False, 'sprint': False}] for _ in range(frames)]
    for i in range(2, 6):
        out[i][0]['move'] = 1
    out[6][0]['swing'] = 1
    out[8][0]['charge'] = True
    return out


PROXY_PORT = 8899
PROXY = None
# WSL 内路径必须用 POSIX 字符串；Windows 的 pathlib 会把 /opt 渲染成反斜杠。
HOME_ROOT = '/opt/aibattle-tools/auth/badminton-models'


def provision_homes():
    """把宿主 Claude Code 配置写给每名选手的私有 home。

    凭据只写进 WSL 的 /opt/aibattle-tools/auth，不进入项目目录、日志或回放。
    所有选手本轮都走 Claude Code CLI；GPT 系额外指向本地流顺序修正代理。
    """
    host = pathlib.Path(os.environ.get('USERPROFILE', str(pathlib.Path.home()))) / '.claude' / 'settings.json'
    settings = json.loads(host.read_text(encoding='utf-8-sig'))
    base_env = dict(settings.get('env', {}))
    for key in ('CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'MAX_THINKING_TOKENS', 'CLAUDE_CODE_EFFORT_LEVEL'):
        base_env.pop(key, None)
    base_env['DISABLE_AUTOUPDATER'] = '1'
    base_env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1'
    settings_by_player = {}
    for who in MODELS:
        env = dict(base_env)
        if who in STREAM_PROXY:
            env['ANTHROPIC_BASE_URL'] = f'http://127.0.0.1:{PROXY_PORT}'
        entry = {'env': env, 'model': MODELS[who], 'disableAllHooks': True}
        # 自定义模型 ID 需要宿主 settings 里的 modelPicker/modelSettings，
        # 否则隔离 home 里的 Claude Code 会报 unrecognized_model。
        for key in ('modelPicker', 'modelSettings'):
            if key in settings:
                entry[key] = settings[key]
        settings_by_player[who] = entry
    if NO_ISOLATION:
        global HOMES_TMP
        HOMES_TMP = tempfile.mkdtemp(prefix='aibattle-badminton-homes-')
        for who in MODELS:
            folder = pathlib.Path(HOMES_TMP) / who
            folder.mkdir(parents=True, exist_ok=True)
            f = folder / 'settings.json'
            f.write_text(json.dumps(settings_by_player[who], ensure_ascii=False, indent=2), encoding='utf-8')
            try: os.chmod(f, 0o600)
            except OSError: pass
            SETTINGS_FILES[who] = str(f)
        save(CONTROL / 'home-paths.json', {who: str(pathlib.Path(HOMES_TMP) / who) for who in MODELS})
        save(CONTROL / 'clients.json', {who: CLIENTS.get(who, 'claude') for who in MODELS})
        return base_env

    payload = {'root': HOME_ROOT, 'players': list(MODELS), 'settings': settings_by_player,
               'clients': {who: CLIENTS.get(who, 'claude') for who in MODELS}}
    script = '''import json,os,pathlib,sys
d=json.load(sys.stdin)
import glob, shutil
for who in d['players']:
    client=d['clients'][who]
    p=pathlib.Path(d['root'])/who/('.'+client)
    p.mkdir(parents=True,exist_ok=True)
    f=p/'settings.json'
    f.write_text(json.dumps(d['settings'][who],ensure_ascii=False))
    os.chmod(f,0o600)
    # Claude Code 的全局状态文件必须在 HOME 根目录；优先恢复之前的备份，
    # 否则写一个最小的已完成引导配置，避免 unrecognized_model / 反复引导。
    home=p.parent
    backups=sorted((p/'backups').glob('.claude.json.backup.*')) if (p/'backups').exists() else []
    state=home/'.claude.json'
    if backups:
        shutil.copy2(backups[-1],state)
    else:
        state.write_text(json.dumps({'hasCompletedOnboarding':True,'lastOnboardingVersion':'2.1.296','numStartups':1,'autoUpdates':False}))
    os.chmod(state,0o600)
    for item in [home,p,f,state]:os.chown(item,65534,65534)
'''
    subprocess.run(['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'python3', '-c', script],
                   input=json.dumps(payload), text=True, encoding='utf-8', check=True,
                   creationflags=subprocess.CREATE_NO_WINDOW)
    save(CONTROL / 'home-paths.json', {who: f'{HOME_ROOT}/{who}' for who in MODELS})
    save(CONTROL / 'clients.json', {who: CLIENTS.get(who, 'claude') for who in MODELS})
    return base_env


def start_stream_proxy(env):
    """GPT 系模型经本地代理修正流式块顺序；它只转发真实 CLI 请求。"""
    global PROXY
    if not (STREAM_PROXY & set(MODELS)):
        return
    base = env.get('ANTHROPIC_BASE_URL')
    if not base:
        raise RuntimeError('Claude Code 配置缺少 ANTHROPIC_BASE_URL')
    script = str(ROOT.parents[1] / 'writing-bench' / 'cc_stream_proxy.py')
    if NO_ISOLATION:
        log = str(CONTROL / f'badminton-stream-proxy-{RUN.name}.log')
        PROXY = subprocess.Popen(
            [sys.executable, script, '--base', base, '--port', str(PROXY_PORT), '--log', log, '--normalize'],
            cwd=str(ROOT.parents[1] / 'writing-bench'),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        script = wsl_path(script)
        log = f'/tmp/badminton-stream-proxy-{RUN.name}.log'
        PROXY = subprocess.Popen(
            ['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'python3', script, '--base', base,
             '--port', str(PROXY_PORT), '--log', log, '--normalize'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    for _ in range(50):
        ok = False
        if NO_ISOLATION:
            try:
                s = socket.create_connection(('127.0.0.1', PROXY_PORT), 0.5); s.close(); ok = True
            except OSError:
                ok = False
        else:
            probe = (f"import socket;socket.create_connection(('127.0.0.1',{PROXY_PORT}),0.5).close()")
            ok = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'python3', '-c', probe],
                                capture_output=True).returncode == 0
        if ok:
            save(CONTROL / 'stream-proxy.json', {'port': PROXY_PORT, 'base': base, 'log': log})
            return
        time.sleep(0.2)
    raise RuntimeError('本地流顺序修正代理没有启动')


def stop_stream_proxy():
    global PROXY
    if PROXY is None:
        return
    if not NO_ISOLATION:
        subprocess.run(['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--', 'pkill', '-f', f'badminton-stream-proxy-{RUN.name}'],
                       check=False)
    try:
        PROXY.terminate()
    except OSError:
        pass
    PROXY = None


def bootstrap():
    env = provision_homes()
    endpoints = ['chatgpt.com', 'api.openai.com']
    host = urllib.parse.urlparse(env.get('ANTHROPIC_BASE_URL', '')).hostname
    if host:
        endpoints.append(host)
    hosts = '127.0.0.1 localhost\n::1 localhost\n' + '\n'.join(socket.gethostbyname(h) + ' ' + h for h in endpoints) + '\n'
    (CONTROL / 'network-hosts').write_text(hosts, encoding='utf-8')
    start_stream_proxy(env)

    public = public_simulation()
    created = REF.ask({'type': 'create', 'id': 'example', 'seed': 1, 'names': ['A', 'B']})
    # 交付给选手的是单方视角示例；羽毛球是侧视对打，双方看到同一块场地。
    example = created['views'][0]
    example.update(yourPlayer=0, catalog=json.loads(subprocess.check_output(
        ['node', '-e', "process.stdout.write(JSON.stringify(require('./badminton/catalog')))"],
        cwd=ROOT.parents[1], text=True, encoding='utf-8')), lastErrors=[],
        decisionWindows=True, framesPerWindow=10, exampleWindow=build_example_window())

    for who in MODELS:
        folder = RUN / 'workspaces' / who
        if who == ARGS.incumbent or ARGS.continue_both:
            previous = pathlib.Path(ARGS.from_run) / f'round-{ARGS.source_round}' / who
            manifest = json.loads((previous / 'manifest.json').read_text(encoding='utf-8'))
            for name, h in manifest.items():
                if hashed(previous / name) != h:
                    raise RuntimeError('Previous submission hash mismatch: ' + name)
            shutil.copytree(previous, folder, dirs_exist_ok=True)
            INHERITED[who] = sorted(manifest)
        else:
            folder.mkdir(parents=True, exist_ok=True)
        # 受保护资料一律按字节原样交付。用 write_text() 会让 Windows 把 \n 转成 \r\n，
        # 之后哈希比对就会把「换行符被转换」误判成「选手改了资料文件」。
        (folder / 'GAME.md').write_bytes((ROOT.parent / 'README.md').read_bytes())
        (folder / 'RULES.md').write_bytes((ROOT / 'RULES.md').read_bytes())
        shutil.copy(ROOT.parent / 'catalog.js', folder / 'catalog.js')
        (folder / 'simulation.js').write_text(public, encoding='utf-8', newline='')
        (folder / 'example.json').write_text(json.dumps(example, ensure_ascii=False, indent=2), encoding='utf-8', newline='')
        (folder / 'canary.txt').write_text(who, encoding='utf-8', newline='')
        (folder / 'public_results.json').write_text(json.dumps(HISTORY, ensure_ascii=False, indent=2), encoding='utf-8', newline='')
        PROTECTED_HASHES[who] = {name: hashed(folder / name) for name in PROTECTED if (folder / name).exists()}
        STARTING[who] = sorted(p.name for p in folder.iterdir() if p.is_file())

    save(CONTROL / 'workspace-paths.json', {w: (RUN / 'workspaces' / w).relative_to(ROOT).as_posix() for w in MODELS})
    save(RUN / 'isolation-prepare.json',
         {'mode': 'none', 'note': '本机直跑；赛前约定不读取对方工作区'} if NO_ISOLATION
         else [probe(w, 'prepare') for w in MODELS])
    save(RUN / 'config.json', {
        'game': 'badminton', 'models': MODELS, 'reasoning_effort': EFFORT, 'rounds': ARGS.rounds,
        'games_per_round': 2, 'port': ARGS.port, 'watch_port': 8809, 'fresh_start': not bool(ARGS.incumbent or ARGS.continue_both),
        'incumbent': ARGS.incumbent, 'continue_both': ARGS.continue_both, 'from_run': ARGS.from_run,
        'source_round': ARGS.source_round, 'starting_files': STARTING, 'inherited_files': INHERITED,
        'clients': {w: 'Claude Code' for w in MODELS},
        'no_isolation': NO_ISOLATION,
        'stream_proxy': sorted(STREAM_PROXY & set(MODELS)),
        'history_games': len(HISTORY), 'decision_frames': 10, 'max_windows': MAX_WINDOWS,
        'source_sha256': hashed(ROOT.parent / 'simulation.js'),
        'catalog_sha256': hashed(ROOT.parent / 'catalog.js'),
        'public_sim_sha256': hashed(RUN / 'workspaces' / next(iter(MODELS)) / 'simulation.js'),
    })


def refresh_protected(folder, who):
    """把受保护资料重写成当前交付基准的字节，并重新登记哈希。

    复用旧工作区时它们的换行符可能来自另一个平台，直接用会与新基准不符；
    这里只覆盖受保护资料，选手自己的提交文件原样保留。
    """
    (folder / 'GAME.md').write_bytes((ROOT.parent / 'README.md').read_bytes())
    (folder / 'RULES.md').write_bytes((ROOT / 'RULES.md').read_bytes())
    shutil.copy(ROOT.parent / 'catalog.js', folder / 'catalog.js')
    (folder / 'simulation.js').write_text(public_simulation(), encoding='utf-8', newline='')
    (folder / 'canary.txt').write_text(who, encoding='utf-8', newline='')
    PROTECTED_HASHES[who] = {name: hashed(folder / name) for name in PROTECTED if (folder / name).exists()}


def check_protected(folder, who):
    """确认选手没有改动受保护资料。

    比对基线是 bootstrap 交付那一刻记录下来的字节哈希，而不是「去源码重新算一遍」——
    交付过程本身可能改变字节（换行符、序列化），拿源码当基准会把这种差异误报成选手作弊。
    """
    baseline = PROTECTED_HASHES.get(who)
    if not baseline:
        return
    for name, expected in baseline.items():
        path = folder / name
        if not path.exists():
            raise RuntimeError(f'{who} deleted protected file {name}')
        if hashed(path) != expected:
            raise RuntimeError(f'{who} modified protected file {name}')


def freeze(who, iteration, usage):
    folder = RUN / 'workspaces' / who
    if not (folder / 'entry.json').exists():
        raise RuntimeError(who + ' did not submit entry.json')
    entry = json.loads((folder / 'entry.json').read_text(encoding='utf-8'))
    if entry.get('mode') not in ('program', 'direct'):
        raise RuntimeError(who + ' entry.json mode must be program or direct')
    if entry['mode'] == 'program':
        cmd = entry.get('command')
        if not isinstance(cmd, list) or not cmd or cmd[0] not in ('python3', 'python', 'py', 'node') or not all(isinstance(c, str) for c in cmd):
            raise RuntimeError(who + ' invalid command')
    target = RUN / f'round-{iteration}' / who
    target.mkdir(parents=True, exist_ok=True)
    for item in folder.iterdir():
        if item.is_symlink():
            raise RuntimeError(who + ' submitted a symlink')
        if item.is_dir():
            shutil.copytree(item, target / item.name, dirs_exist_ok=True)
        else:
            shutil.copy(item, target / item.name)
    manifest = {p.relative_to(target).as_posix(): hashed(p) for p in sorted(target.rglob('*')) if p.is_file() and p.name != 'manifest.json'}
    save(target / 'manifest.json', manifest)
    save(RUN / f'round-{iteration}-{who}-usage.json', {'usage': usage} if not isinstance(usage, list) else usage)
    config = json.loads((RUN / 'config.json').read_text(encoding='utf-8'))
    config.setdefault('frozen_paths', {})[f'{who}-r{iteration}'] = (target).relative_to(ROOT).as_posix()
    save(RUN / 'config.json', config)
    return entry


def prepare(who, iteration):
    # 冻结现任者：整个系列都不再调用模型，直接把上一系列的冻结提交原样冻结到本轮。
    # 挑战者每一轮都可以改进，现任者始终是同一套策略，这样胜率比较才有意义。
    if who == ARGS.incumbent:
        return freeze(who, iteration, [{'frozen_incumbent': True, 'from_run': ARGS.from_run,
                                       'source_round': ARGS.source_round}])

    # 复用模式：只对第一轮生效——把上一次运行里的工作区搬过来。
    # 已提交（entry.json 存在）就冻结并跳过准备；未完成则保留其文件继续准备。
    # 第 2、3 轮必须让模型真的复盘并改进，否则整场就变成同一套策略重复跑，失去迭代意义。
    # 按选手逐个生效：某一侧准备失败时，只重跑那一侧，另一侧已完成的成果继续沿用。
    resumed_workspace = False
    if ARGS.reuse_workspaces and iteration == 1:
        source = pathlib.Path(ARGS.reuse_workspaces) / 'workspaces' / who
        if source.exists():
            folder = RUN / 'workspaces' / who
            if folder.exists():
                shutil.rmtree(folder)
            shutil.copytree(source, folder)
            refresh_protected(folder, who)
            if (source / 'entry.json').exists() and (source / 'entry.json').stat().st_size > 0:
                save(RUN / f'round-{iteration}-{who}-invocation.json',
                     {'model': MODELS[who], 'reasoning_effort': EFFORT, 'reused_from': str(source), 'budget_seconds': 0})
                save(RUN / f'round-{iteration}-{who}-completion.json', {'model_completed': True, 'reused_from': str(source)})
                return freeze(who, iteration, [])
            resumed_workspace = True
            print(f'{who} 复用未完成工作区：保留已有文件，继续准备', flush=True)
        else:
            print(f'{who} 没有可复用的工作区，从零准备', flush=True)

    example_window = json.dumps(build_example_window(), ensure_ascii=False)
    direct_note = ('\n本轮为本机直跑：不要读取对方工作区、control 目录或对方进程数据；只使用自己的工作区。' if NO_ISOLATION else '')
    resume_note = ('\n注意：工作区里保留了你在上一次未完成准备中写下的文件（可能包括 agent.py、自测脚本等）。'
                   '可以直接继续修改和验证，不必从零重写；仍以最终 entry.json 为提交。\n' if resumed_workspace else '')
    budget_text = (f'准备上限 {ARGS.prepare_seconds // 60} 分钟' if ARGS.prepare_seconds > 0
                   else '准备时间不设上限，完成你认为充分的准备后再提交')
    incumbent_goal = (chr(10) * 2 + '【本轮目标】对手是**冻结的 ' + LABELS.get(ARGS.incumbent, ARGS.incumbent or '') + ' 策略**（它的代码与工作区对你不可见，禁止读取）。你的目标是在正式比赛中对它取得 **≥90% 的胜率**：用不同种子、不同座位反复自测，直到自测胜率稳定在 90% 以上再提交，并把实测胜率写进自测报告。') if ARGS.incumbent and who != ARGS.incumbent else ''
    prompt = f'''你是 {MODELS[who]}，参加「横版羽毛球」竞技比赛的正式比赛，第 {iteration} 轮（共 {ARGS.rounds} 轮）。
你通过 Claude Code CLI 运行，可以读写工作区并执行命令。{resume_note}

这是一场 1v1 侧视羽毛球：球场 13.4 格长、中间一张**每局随机高度（1.35–1.95 格）**的网，先得 11 分且领先 2 分者胜（15 分封顶）。
每局上限 240 秒；时间到按比分判定，打平则平局。

服务端以 20 Hz 推进，每 10 帧（0.5 秒）双方同时提交一次逐帧输入，收齐后统一推进。

【观察与规则】
- `batsmen[]`：两名球员（x/y/vx/vy/onGround/facing/swing/swingElapsed/swingType/stamina/hits/smashes/points）。
- 你是 `batsmen[yourPlayer]`：team 0 在左半场，team 1 在右半场，各自面向球网。
- `shuttle`：球的位置/速度/是否存活/最后触球方；`score`、`server`、`phase`、`serveLeft`、`pointLeft`、`rally`。
- **网高每局随机**（1.35–1.95 格），以观察里的 `court.netHeight` 为准；发球会自动抬弧线保证过网，
  但杀球、平抽、吊球是否能过网要自己按 `court.netHeight` 计算。
- 得分规则：球落在自己半场 → 对方得分；球从端线飞出 → 击球方失分；撞网落下按落点判定。
- 发球是自动的：得分者发球，0.8 秒后球以高弧线飞向对方半场。

【动作】
- `move` ∈ [-1,1]：左右跑动；`jump`：起跳（约 1.2 格高，落地前不能再跳）。
- `swing`：1 = 上手（从上往下挥），-1 = 下手（从下往上挑），0 = 不挥。
- `charge`：按住蓄力。蓄力时移动速度降到 45%、每秒耗 11 体力，但击球出球速度提高（满蓄力 +55%）；命中后清空。
- `sprint`：按住冲刺。移动速度 ×1.45，但每秒耗 24 体力；体力 ≤5 时无法冲刺。
- 上手挥拍：击球点越高、离网越近，越能下压成杀球；在后场会自动变成高远球（否则必出界）；
  对手在后场时还会吊网前小球。
- 下手挥拍：低位挑高球，把球送到对方后场。
- 球拍有扫掠弧线和 0.8 格判定半径；空挥会进入约 0.4 秒冷却，同一次挥拍不能连击。
- **体力**：跑动每秒 −8、站定 +8；挥拍 −6，起跳 −10，蓄力每秒 −11，冲刺每秒 −24。
  体力低会变慢、够不到球、跳不起来，也无法冲刺。

【输入格式】
- 每次提交 10 帧，每帧一名球员：
  {{"inputs":[[{{"move":0.5,"jump":false,"swing":0,"charge":false,"sprint":false}}], … 共 10 帧 …]}}
- 每帧也接受直接写对象（不包数组）。字段可省略，缺省为 0/false。
- 不足 10 帧的尾部由裁判补中立；字段非法整场判技术负。

【比赛流程】
- 每局 240 秒上限，11 分制（需领先 2 分，15 分封顶）。
- 每轮 2 局，双方交换座位；3 轮共 6 局。

你的工作目录里只有你自己的文件与规则资料：
  RULES.md / GAME.md   完整规则与 API
  catalog.js           场地、物理与规则参数
  simulation.js        去掉练习电脑的公开规则源码，可离线跑测试
  example.json         一个真实起始观察与示例输入窗口
  public_results.json  之前的公开战报

本轮使用 {EFFORT} effort，{budget_text}。
充分理解机制、编写并实际运行有对抗性的自测（重点是击球点选择、上手/下手时机、体力分配）；提前完成即可提交。

在 `entry.json` 写入你的提交：
{{"mode":"program","command":["python3","agent.py"]}}

程序通过 stdin 每行接收一个 JSON 观察，必须向 stdout 输出一行 JSON 并立即 flush。
比赛阶段输出 {{"inputs":[[10 帧 × 1 名球员]]}}。
example.json 的 exampleWindow 字段是一份可照抄的合法窗口。

程序单次响应硬上限 5 秒。准备环境可以联网，比赛执行时工作区只读且无网络。
禁止读取对方文件、禁止修改 RULES.md/GAME.md/simulation.js/catalog.js/example.json，禁止下载现成引擎。{direct_note}

把你实际采用的策略、自测结果与局限写入简体中文 review.md。没有对局前不要编造复盘结果。{incumbent_goal}'''
    out = RUN / f'round-{iteration}-{who}.jsonl'
    err = RUN / f'round-{iteration}-{who}.stderr.log'
    cmd = model_command(who, seconds=ARGS.prepare_seconds)
    save(RUN / f'round-{iteration}-{who}-invocation.json', {'model': MODELS[who], 'reasoning_effort': EFFORT, 'command': cmd, 'budget_seconds': ARGS.prepare_seconds})

    # 瞬时网关故障（524/502/503、Proxy Read Timeout 等）不该报废整条系列赛。
    # 实测遇到过 api_error_status 524「origin web server did not return a complete
    # response within the 120-second Proxy Read Timeout window」，错误体自己标了
    # retryable: true —— 这类必须退避重试，而不是当成模型失败。
    last_error = None
    # deadline 为 0 表示不限制总准备时长：模型愿意跑多久就多久。
    deadline = (time.monotonic() + ARGS.prepare_deadline_minutes * 60
                if ARGS.prepare_deadline_minutes > 0 else None)
    for attempt in range(1, ARGS.prepare_retries + 1):
        if attempt > 1:
            # 每次重试都重新计时：失败的那次可能已经烧掉大半预算。
            # 网关建议退避至少 120 秒；这里取 120 秒。
            delay = 120
            if deadline is not None and time.monotonic() + delay > deadline:
                break
            print(f'{who} 准备第 {attempt} 次尝试，先退避 {delay}s', flush=True)
            time.sleep(delay)
        # 每次尝试留各自的日志。覆盖式写入会把上一次失败的证据冲掉——
        # 排查 524 时正需要比较两次失败发生在第几轮、耗时多少。
        attempt_out = RUN / f'round-{iteration}-{who}.jsonl' if attempt == 1 else RUN / f'round-{iteration}-{who}.attempt{attempt}.jsonl'
        attempt_err = RUN / f'round-{iteration}-{who}.stderr.log' if attempt == 1 else RUN / f'round-{iteration}-{who}.attempt{attempt}.stderr.log'
        timed_out = False
        hard_timeout = None if ARGS.prepare_seconds <= 0 else ARGS.prepare_seconds + 30
        try:
            with attempt_out.open('w', encoding='utf-8') as o, attempt_err.open('w', encoding='utf-8') as e:
                if NO_ISOLATION:
                    prompt = prompt.replace('/workspace', str(RUN / 'workspaces' / who))
                    p = subprocess.run(cmd, input=prompt, stdout=o, stderr=e, text=True,
                                       encoding='utf-8', timeout=hard_timeout, cwd=str(RUN / 'workspaces' / who),
                                       creationflags=subprocess.CREATE_NO_WINDOW)
                else:
                    p = subprocess.run(isolated(who, 'prepare', cmd), input=prompt, stdout=o, stderr=e, text=True,
                                       encoding='utf-8', timeout=hard_timeout, creationflags=subprocess.CREATE_NO_WINDOW)
        except subprocess.TimeoutExpired:
            # 第二种失效形态：会话挂死——不发 524、不报错、也没有 result 事件，就一直在等。
            # 这种必须和 524 一样当成可重试的瞬时故障，否则它会把整条系列赛炸掉。
            timed_out = True
            last_error = f'{who} 准备超时（{ARGS.prepare_seconds + 30}s 内没有结束），疑似会话挂死'
            print(last_error, flush=True)
        events = [json.loads(line) for line in attempt_out.read_text(encoding='utf-8').splitlines() if line.strip().startswith('{')]
        if timed_out:
            if attempt < ARGS.prepare_retries:
                print(f'{who} 准备遭遇挂死（第 {attempt} 次），准备重试', flush=True)
                continue
            save(RUN / f'round-{iteration}-{who}-completion.json',
                 {'model_completed': False, 'error': last_error, 'attempts': attempt, 'timed_out': True})
            raise RuntimeError(last_error)
        try:
            usage = completed_usage(who, events)
        except Exception as exc:
            last_error = str(exc)
            if attempt < ARGS.prepare_retries and is_transient_failure(events):
                print(f'{who} 准备遭遇瞬时故障（第 {attempt} 次）：{last_error}', flush=True)
                continue
            save(RUN / f'round-{iteration}-{who}-completion.json',
                 {'returncode': p.returncode, 'model_completed': False, 'error': last_error, 'attempts': attempt})
            raise
        save(RUN / f'round-{iteration}-{who}-completion.json',
             {'returncode': p.returncode, 'model_completed': True, 'attempts': attempt})
        check_protected(RUN / 'workspaces' / who, who)
        return freeze(who, iteration, usage)
    raise RuntimeError(f'{who} 准备在 {ARGS.prepare_retries} 次尝试后仍然失败：{last_error}')


# 网关侧的瞬时故障特征。这些是「服务端这次没能给出完整响应」，不是模型做错了什么。
TRANSIENT_MARKERS = ('Proxy Read Timeout', '524', '502', '503', '529', 'overloaded',
                     'api_error', 'rate limit', 'timed out', 'timeout')


def is_transient_failure(events):
    """从 CLI 的事件流判断这次失败是否属于可重试的瞬时故障。"""
    for e in events:
        if e.get('type') == 'result':
            text = json.dumps(e, ensure_ascii=False)
            if any(m in text for m in TRANSIENT_MARKERS):
                return True
        if e.get('type') == 'error':
            return True
    return False


class Competitor:
    """一名选手在某局中的控制器：program 模式常驻进程，direct 模式每个窗口重开一次模型调用。"""

    def __init__(self, who, entry, iteration, game):
        self.who = who; self.entry = entry; self.iter = iteration
        self.process = None
        if entry['mode'] == 'program':
            if NO_ISOLATION:
                cmd = list(entry['command'])
                if cmd[0] in ('python3', 'python', 'py'):
                    cmd[0] = sys.executable
                elif cmd[0] == 'node':
                    cmd[0] = shutil.which('node') or 'node'
                engine_dir = RUN / f'round-{iteration}' / who
                self.process = transport.JsonProcess(cmd, RUN / f'engine-{iteration}-{game}-{who}.log',
                                                    cwd=str(engine_dir))
            else:
                self.process = transport.JsonProcess(
                    isolated(who, 'engine', ['timeout', '--signal=KILL', '7200s', *entry['command']]),
                    RUN / f'engine-{iteration}-{game}-{who}.log')

    def move(self, obs):
        if self.process:
            return self.process.ask(obs, 5)
        f = (RUN / f'direct-{self.iter}-{self.who}-{int(time.time() * 1000)}.jsonl').open('w', encoding='utf-8')
        prompt = ('继续本场横版羽毛球对局。只读取你自己的笔记和公开规则。'
                  '把本阶段输出 {"inputs":[10 帧×1 名球员]} 写入 action.json。当前状态：' + json.dumps(obs))
        try:
            if NO_ISOLATION:
                ws = RUN / 'workspaces' / self.who
                subprocess.run(model_command(self.who, 'action-summary.txt', 180), cwd=str(ws),
                               input=prompt, stdout=f, stderr=f, text=True, encoding='utf-8', timeout=200,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                subprocess.run(isolated(self.who, 'prepare', model_command(self.who, 'action-summary.txt', 180)),
                               input=prompt, stdout=f, stderr=f, text=True, encoding='utf-8', timeout=200,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            return json.loads((RUN / 'workspaces' / self.who / 'action.json').read_text(encoding='utf-8'))
        finally:
            f.close()

    def close(self):
        if self.process:
            self.process.close()


NEUTRAL_PLAYER = {'move': 0, 'jump': False, 'swing': 0, 'charge': False, 'sprint': False}


def _player_input(item):
    if item is None:
        return dict(NEUTRAL_PLAYER)
    if not isinstance(item, dict):
        raise RuntimeError('Each frame must be an object with move/jump/swing')
    out = dict(NEUTRAL_PLAYER)
    if item.get('move') is not None:
        v = item['move']
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            raise RuntimeError('move must be a finite number')
        out['move'] = min(1.0, max(-1.0, float(v)))
    out['jump'] = bool(item.get('jump', False))
    out['charge'] = bool(item.get('charge', False))
    out['sprint'] = bool(item.get('sprint', False))
    sw = item.get('swing', 0)
    if isinstance(sw, bool):
        out['swing'] = 1 if sw else 0
    elif sw is None:
        out['swing'] = 0
    else:
        v = float(sw)
        if not math.isfinite(v):
            raise RuntimeError('swing must be -1, 0, 1 or a boolean')
        out['swing'] = 1 if v > 0.1 else -1 if v < -0.1 else 0
    return out


def normalize_window(raw, frames=10):
    """10 帧 × 1 名球员；形状不对就抛错（判技术负），不静默改变输入。"""
    if isinstance(raw, dict):
        raw = raw.get('inputs')
    if not isinstance(raw, list) or not raw:
        raise RuntimeError('Window must be a non-empty array of frames')
    out = []
    for frame in raw[:frames]:
        if isinstance(frame, list):
            out.append([_player_input(frame[0] if frame else None)])
        elif isinstance(frame, dict):
            out.append([_player_input(frame)])
        else:
            raise RuntimeError('Each frame must be a player input object')
    while len(out) < frames:
        out.append([dict(NEUTRAL_PLAYER)])
    return out


def compact_frame(frame):
    """每帧去掉重复的静态目录；回放端用文件顶层的 court/rules 补齐。"""
    return {k: v for k, v in frame.items() if k not in ('court', 'rules', 'events')}


def play(iteration, entries, seat_order, game_number, pool):
    game_id = f'r{iteration}-g{game_number}'
    names = [LABELS[w] for w in seat_order]
    seed = ARGS.seed_base + iteration * 10 + game_number

    created = REF.ask({'type': 'create', 'id': game_id, 'seed': seed, 'names': names})
    state = created['state']
    views = created['views']
    controllers = {w: Competitor(w, entries[w], iteration, game_number) for w in MODELS}
    frames = [compact_frame(state)]; windows = []; errors = {w: [] for w in MODELS}
    # 逐帧快照不携带事件；裁判在每次窗口回包里给出值得记录的事件（发球/得分/撞网/结束）。
    events = {e['id']: e for e in (created.get('events') or [])}
    technical = None
    started = time.time()

    def observation(w):
        seat = seat_order.index(w)
        obs = dict(views[seat])
        obs['yourPlayer'] = seat
        obs['decisionWindows'] = True
        obs['framesPerWindow'] = 10
        obs['exampleWindow'] = build_example_window()
        obs['lastErrors'] = errors[w][-6:]
        return obs

    def ask(w):
        try:
            reply = controllers[w].move(observation(w))
            if not isinstance(reply, dict) or 'inputs' not in reply:
                raise RuntimeError('Invalid response envelope: missing inputs')
            return w, reply, None
        except Exception as exc:
            return w, None, str(exc)

    try:
        for _ in range(MAX_WINDOWS):
            if state['status'] != 'playing':
                break
            failed = {}
            answers = {}
            futures = [pool.submit(ask, w) for w in MODELS]
            for fut in futures:
                w, reply, failure = fut.result()
                if failure:
                    failed[w] = failure
                else:
                    raw = reply.get('inputs') if isinstance(reply, dict) else reply
                    answers[w] = normalize_window(raw)
            if failed:
                raise RuntimeError('; '.join(f'{w}: {m}' for w, m in failed.items()))
            ordered = [answers[w] for w in seat_order]
            result = REF.ask({'type': 'window', 'inputs': ordered, 'capture': True})
            state = result['state']; views = result['views']
            advance = result.get('frames') or [state]
            for e in result.get('events') or []:
                events[e['id']] = e
            frames.extend(compact_frame(f) for f in advance)
            windows.append({'frame': state.get('frame', 0), 'inputs': ordered, 'seconds': [0.0, 0.0]})
        if state['status'] == 'playing' and len(windows) >= MAX_WINDOWS:
            raise RuntimeError('对局超过最大窗口数')
    except Exception as exc:
        technical = str(exc)
        loser = None
        for w in MODELS:
            if w in technical:
                loser = seat_order.index(w)
                break
        state = dict(state)
        state['status'] = 'finished'
        state['reason'] = '技术中断：' + technical
        state['winner'] = None if loser is None else 1 - loser
    finally:
        for c in controllers.values():
            c.close()

    duration = round(time.time() - started, 2)
    winner = None if technical else state.get('winner')
    batsmen = state.get('batsmen') or []
    scores = {w: int((state.get('score') or [0, 0])[seat_order.index(w)]) for w in MODELS}
    hits = [int(b.get('hits', 0)) for b in batsmen][:2]
    smashes = [int(b.get('smashes', 0)) for b in batsmen][:2]
    record = {
        'id': game_id, 'round': iteration, 'game': game_number, 'seats': seat_order,
        'names': names, 'seed': seed,
        'frames': frames, 'windows': windows, 'frameMs': 50,
        'court': state.get('court'), 'rules': state.get('rules'),
        'events': sorted(events.values(), key=lambda e: e['id']),
        'final': state, 'winner': winner,
        'reason': state.get('reason', ''), 'duration': duration,
        'errors': {w: len(errors[w]) for w in MODELS},
        'technicalFailure': technical,
    }
    file = RUN / (game_id + '.json.gz')
    with gzip.open(file, 'wb') as f:
        f.write(json.dumps(record, ensure_ascii=False).encode('utf-8'))
    return {
        'id': game_id, 'round': iteration, 'game': game_number, 'seats': seat_order,
        'winner': winner if winner is None else seat_order[winner],
        'reason': record['reason'], 'duration': record['duration'],
        'errors': record['errors'],
        'technicalFailure': technical, 'frames': len(frames), 'windows': len(windows),
        'seed': seed,
        'scores': scores, 'longestRally': int(state.get('longestRally') or 0),
        'hits': hits, 'smashes': smashes,
        'sha256': hashed(file),
    }


def review(who, iteration, summary):
    if who == ARGS.incumbent:
        note = ('本系列中 ' + LABELS.get(who, who) + ' 的策略在赛前已冻结（来自 ' + str(ARGS.from_run)
                + ' 第 ' + str(ARGS.source_round) + ' 轮）：不调用模型、不做任何改动，第 ' + str(iteration)
                + ' 轮比赛沿用同一份冻结提交。\n')
        # 冻结目录里的 review.md 是上一系列留下的原件，改它会破坏清单校验。
        return
    prompt = (f'请复盘你在「横版羽毛球」第 {iteration} 轮的两场比赛。以下是公开战报：\n'
              + json.dumps(summary, ensure_ascii=False)[:20000]
              + '\n把具体对局 ID、比分、最长回合、击球/杀球数、关键分与你的改动写入工作区 review.md（简体中文）。')
    out = RUN / f'round-{iteration}-{who}-review.jsonl'
    err = RUN / f'round-{iteration}-{who}-review.stderr.log'
    try:
        with out.open('w', encoding='utf-8') as o, err.open('w', encoding='utf-8') as e:
            if NO_ISOLATION:
                ws = RUN / 'workspaces' / who
                subprocess.run(model_command(who, 'review-summary.txt', 0), cwd=str(ws),
                               input=prompt.replace('/workspace', str(ws)), stdout=o, stderr=e, text=True,
                               encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                subprocess.run(isolated(who, 'prepare', model_command(who, 'review-summary.txt', 0)),
                               input=prompt, stdout=o, stderr=e, text=True, encoding='utf-8',
                               creationflags=subprocess.CREATE_NO_WINDOW)
    except Exception as exc:
        print('review failed for', who, exc, flush=True)


def postmatch(who, iteration, summary):
    if who == ARGS.incumbent:
        note = ('本系列中 ' + LABELS.get(who, who) + ' 的策略在赛前已冻结（来自 ' + str(ARGS.from_run)
                + ' 第 ' + str(ARGS.source_round) + ' 轮），全程未参与准备、复盘与改进；'
                '本系列所有对局都由这一份冻结版本出战。\n')
        (RUN / f'postmatch-{who}.md').write_text(note, encoding='utf-8')
        return
    prompt = ('比赛已结束。请写一份简体中文赛后复盘：你实际采用的策略、关键分与回合的具体帧数与判读、'
              '你的失误与可改进之处、以及对羽毛球机制（上手/下手、起跳、击球点高度、体力）的理解变化。'
              '写入工作区 postmatch.md。\n'
              + json.dumps(summary, ensure_ascii=False)[:20000])
    out = RUN / f'postmatch-{who}.jsonl'
    err = RUN / f'postmatch-{who}.stderr.log'
    try:
        with out.open('w', encoding='utf-8') as o, err.open('w', encoding='utf-8') as e:
            if NO_ISOLATION:
                ws = RUN / 'workspaces' / who
                subprocess.run(model_command(who, 'postmatch-summary.txt', 0), cwd=str(ws),
                               input=prompt.replace('/workspace', str(ws)), stdout=o, stderr=e, text=True,
                               encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW)
            else:
                subprocess.run(isolated(who, 'prepare', model_command(who, 'postmatch-summary.txt', 0)),
                               input=prompt, stdout=o, stderr=e, text=True, encoding='utf-8',
                               creationflags=subprocess.CREATE_NO_WINDOW)
        source = RUN / 'workspaces' / who / 'postmatch.md'
        if source.exists():
            shutil.copy(source, RUN / f'postmatch-{who}.md')
    except Exception as exc:
        print('postmatch failed for', who, exc, flush=True)


def main():
    global RUN, REF, ARGS, STATE, MODELS
    parser = argparse.ArgumentParser()
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--players', nargs=2, default=['deepseek-flash', 'sol'])
    parser.add_argument('--incumbent')
    parser.add_argument('--from-run')
    parser.add_argument('--source-round', type=int, default=3)
    parser.add_argument('--continue-both', action='store_true')
    parser.add_argument('--prepare-seconds', type=int, default=0,
                        help='单次准备上限（秒）；0 表示不设上限，模型自行结束')
    # 推理网关偶发的 524/502/503 属于「服务端这次没给完整响应」，实测遇到过
    # Proxy Read Timeout（错误体自带 retryable: true）。默认给一次重试机会，
    # 否则一次瞬时抖动就会报废整条已经跑了几十分钟的系列赛。
    parser.add_argument('--prepare-retries', type=int, default=4)
    # 总时间上限（分钟）。0 表示不限制，准备多久都可以。
    parser.add_argument('--prepare-deadline-minutes', type=int, default=0)
    parser.add_argument('--port', type=int, default=8805)
    parser.add_argument('--no-isolation', action='store_true',
                        help='本机直跑：不使用 WSL/bubblewrap，只靠赛前约定不读取对方工作区')
    parser.add_argument('--seed-base', type=int, default=5000)
    parser.add_argument('--reuse-workspaces', metavar='RUN_DIR',
                        help='复用某个运行的工作区：已提交的直接冻结，未完成的保留文件继续准备（用于中断续跑）')
    ARGS = parser.parse_args()
    if len(set(ARGS.players)) != 2:
        parser.error('Two different models required')
    if any(p not in CATALOG for p in ARGS.players):
        parser.error('Unknown player')
    if ARGS.prepare_seconds != 0 and not 60 <= ARGS.prepare_seconds <= 86400:
        parser.error('Preparation budget must be 0 (unlimited) or 60–86400 seconds')
    if ARGS.incumbent and not ARGS.from_run:
        parser.error('--incumbent requires --from-run')
    if ARGS.continue_both and not ARGS.from_run:
        parser.error('--continue-both requires --from-run')
    if ARGS.incumbent and ARGS.continue_both:
        parser.error('--incumbent and --continue-both are mutually exclusive')

    global NO_ISOLATION
    NO_ISOLATION = bool(ARGS.no_isolation)
    MODELS = {w: CATALOG[w] for w in ARGS.players}
    transport.MODELS = MODELS

    CONTROL.mkdir(parents=True, exist_ok=True)
    lock = (CONTROL / '.lock').open('w')
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        raise SystemExit('另有一个系列赛正在运行（control/.lock 被占用）')
    probe_sock = socket.socket()
    try:
        probe_sock.bind(('127.0.0.1', ARGS.port))
    except OSError:
        raise SystemExit(f'端口 {ARGS.port} 已被占用，请换一个 --port')
    finally:
        probe_sock.close()

    RUN = CONTROL / time.strftime('run-%Y%m%d-%H%M%S')
    RUN.mkdir(parents=True, exist_ok=True)
    save(CONTROL / 'active-run.json', {'path': str(RUN), 'pid': os.getpid()})

    if ARGS.from_run:
        load_history(ARGS.from_run)

    # 裁判是唯一的权威引擎进程。
    REF = transport.JsonProcess(['node', str(ROOT / 'referee.js')], RUN / 'referee.stderr.log')
    budget = (f'各最多 {ARGS.prepare_seconds // 60} 分钟准备' if ARGS.prepare_seconds > 0
              else '准备时间不设上限')
    setup = (f'双方继承各自上一系列策略，继续各迭代 {ARGS.rounds} 轮，{budget}'
             if ARGS.continue_both else
             f'{LABELS[ARGS.incumbent]} 沿用上一系列冻结策略，不额外修改；挑战者从零，{budget}'
             if ARGS.incumbent else
             f'双方从零开始，{budget}')
    setup += (f'；13.4 格侧视球场、1.55 格高网；11 分制 / 240 秒；可起跳、上手/下手两种挥拍、体力；'
              f'每轮 2 局共 {ARGS.rounds} 轮；每 10 帧同步决策；'
              + ('本机直跑，赛前约定不读取对方工作区' if NO_ISOLATION else '策略代码隔离'))
    STATE = {'run': RUN.name, 'phase': '准备比赛', 'models': MODELS, 'labels': {w: LABELS[w] for w in MODELS},
             'reasoning_effort': EFFORT, 'round': 1, 'rounds': ARGS.rounds, 'games': [], 'results': [],
             'ready': [], 'setup_note': setup, 'pid': os.getpid(), 'port': ARGS.port, 'completed': False}

    try:
        status('建立本机环境' if NO_ISOLATION else '建立隔离环境')
        bootstrap()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for iteration in range(1, ARGS.rounds + 1):
                for w in MODELS:
                    (RUN / 'workspaces' / w / 'public_results.json').write_text(json.dumps(HISTORY, ensure_ascii=False, indent=2), encoding='utf-8', newline='')
                status('模型准备', round=iteration)
                futures = {w: pool.submit(prepare, w, iteration) for w in MODELS}
                entries = {w: f.result() for w, f in futures.items()}
                save(CONTROL / 'engine-paths.json', {w: (RUN / f'round-{iteration}' / w).relative_to(ROOT).as_posix() for w in MODELS})
                status('比赛进行中', round=iteration, ready=sorted(MODELS))
                save(RUN / f'isolation-engine-{iteration}.json',
                     {'mode': 'none'} if NO_ISOLATION else [probe(w, 'engine') for w in MODELS])

                round_results = []
                for game_number, order in enumerate([list(MODELS), list(reversed(MODELS))], 1):
                    result = play(iteration, entries, order, game_number, pool)
                    round_results.append(result)
                    STATE['results'].append(result)
                    STATE['games'].append({'id': result['id'], 'round': iteration, 'game': game_number,
                                           'seed': result.get('seed'),
                                           'seats': result['seats'], 'winner': result['winner'],
                                           'reason': result['reason'], 'duration': result['duration'],
                                           'scores': result.get('scores'), 'longestRally': result.get('longestRally'),
                                           'hits': result.get('hits'), 'smashes': result.get('smashes'),
                                           'errors': result['errors'],
                                           'technicalFailure': result['technicalFailure'], 'frames': result['frames'],
                                           'windows': result['windows'], 'sha256': result['sha256']})
                    save(RUN / 'results.json', STATE['results'])
                    status('比赛进行中', round=iteration, game=game_number, game_id=result['id'])
                summary = {'round': iteration, 'games': round_results}
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as rpool:
                    list(rpool.map(lambda w: review(w, iteration, summary), MODELS))
        status('赛后复盘')
        final = {'series': STATE['results']}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda w: postmatch(w, ARGS.rounds, final), MODELS))
        status('比赛完成', completed=True)
    finally:
        if REF:
            REF.close()
        stop_stream_proxy()
        if HOMES_TMP:
            shutil.rmtree(HOMES_TMP, ignore_errors=True)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        except OSError:
            pass
        lock.close()
        # 审计与报告都需要 results.json；一轮都没打完时它还不存在，跳过而不是再抛一次。
        if (RUN / 'results.json').exists():
            subprocess.run(['node', str(ROOT / 'audit.js'), str(RUN)], check=False, cwd=str(ROOT))
            subprocess.run(['python', str(ROOT / 'report.py'), str(RUN)], check=False, cwd=str(ROOT))
        else:
            print('未产生任何完成的对局，跳过审计与报告；工作区保留在 ' + str(RUN / 'workspaces'), flush=True)


if __name__ == '__main__':
    main()
