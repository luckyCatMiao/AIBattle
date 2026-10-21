"""Independent model competitors; frozen revisions; durable frame-by-frame replays."""
import argparse, concurrent.futures, gzip, hashlib, importlib.util, json, msvcrt, os, pathlib, shutil, socket, subprocess, threading, time, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
CONTROL = ROOT / 'control'
# 复用 rts 系列已经写好并验证过的模型客户端与沙箱传输层。
spec = importlib.util.spec_from_file_location('legacy_transport', ROOT.parents[1] / 'rts' / 'arena' / 'train.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
CATALOG = {'sol': 'gpt-6.1-sol', 'luna': 'gpt-6-luna', 'astra': 'gpt-6-astra', 'opus': 'claude-opus-5-5'}
MODELS = {w: CATALOG[w] for w in ('opus', 'sol')}
LABELS = transport.LABELS
transport.MODELS = MODELS
RUN = None; REF = None; STATE = {}; GUARD = threading.Lock(); ARGS = None
STARTING = {}; INHERITED = {}; HISTORY = []; PROTECTED_HASHES = {}
PROTECTED = ['RULES.md', 'GAME.md', 'simulation.js', 'catalog.js', 'example.json', 'canary.txt']
# 一次对局最多推进多少个决策窗口；超过即判超时（约 300 秒游戏时间）。
MAX_WINDOWS = 4000


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
            '/mnt/c/Users/Admin/Desktop/AIBattle/fighting/arena/isolate.py', who, mode, *cmd]


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


def bootstrap():
    endpoints = ['chatgpt.com', 'api.openai.com']
    if 'opus' in MODELS:
        host = urllib.parse.urlparse(os.environ.get('ANTHROPIC_BASE_URL', '')).hostname
        if host:
            endpoints.append(host)
    hosts = '127.0.0.1 localhost\n::1 localhost\n' + '\n'.join(socket.gethostbyname(h) + ' ' + h for h in endpoints) + '\n'
    (CONTROL / 'network-hosts').write_text(hosts, encoding='utf-8')

    # 公开引擎去掉练习电脑：选手看到的规则源码与裁判同源，但没有可抄的控制器。
    public = public_simulation()
    example = REF.ask({'type': 'create', 'id': 'example', 'seed': 1,
                       'names': ['A', 'B'], 'teams': [['aegis', 'vex', 'kestrel'], ['torv', 'nyx', 'sable']]})['state']
    example.update(yourPlayer=0, catalog=json.loads(subprocess.check_output(
        ['node', '-e', "process.stdout.write(JSON.stringify(require('./fighting/catalog')))"],
        cwd=ROOT.parents[1], text=True, encoding='utf-8')), lastErrors=[],
        decisionWindows=True, framesPerWindow=15, exampleWindow=build_example_window())

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
        # 交付时的字节哈希就是这一轮的比对基线：选手只要没动过，就应该完全一致。
        PROTECTED_HASHES[who] = {name: hashed(folder / name) for name in PROTECTED if (folder / name).exists()}
        STARTING[who] = sorted(p.name for p in folder.iterdir() if p.is_file())

    save(CONTROL / 'workspace-paths.json', {w: (RUN / 'workspaces' / w).relative_to(ROOT).as_posix() for w in MODELS})
    save(RUN / 'isolation-prepare.json', [probe(w, 'prepare') for w in MODELS])
    save(RUN / 'config.json', {
        'game': 'fighting', 'models': MODELS, 'reasoning_effort': 'medium', 'rounds': ARGS.rounds,
        'games_per_round': 2, 'port': ARGS.port, 'fresh_start': not bool(ARGS.incumbent or ARGS.continue_both),
        'incumbent': ARGS.incumbent, 'continue_both': ARGS.continue_both, 'from_run': ARGS.from_run,
        'source_round': ARGS.source_round, 'starting_files': STARTING, 'inherited_files': INHERITED,
        'clients': {w: 'Claude Code' if w == 'opus' else 'Codex CLI' for w in MODELS},
        'history_games': len(HISTORY), 'decision_frames': 15, 'max_windows': MAX_WINDOWS,
        'source_sha256': hashed(ROOT.parent / 'simulation.js'),
        'catalog_sha256': hashed(ROOT.parent / 'catalog.js'),
        'public_sim_sha256': hashed(RUN / 'workspaces' / next(iter(MODELS)) / 'simulation.js'),
    })


def build_example_window():
    """给选手一份可以照抄的合法窗口，省掉格式猜测。"""
    return [{'dir': 'F', 'btn': None}, {'dir': 'F', 'btn': None},
            {'dir': 'D', 'btn': None}, {'dir': 'DF', 'btn': None},
            {'dir': 'F', 'btn': 'HP'}] + [{'dir': 'N', 'btn': None}] * 10


def refresh_protected(folder, who):
    """把受保护资料重写成当前交付基准的字节，并重新登记哈希。

    复用旧工作区时它们的换行符可能来自另一个平台，直接用会与新基准不符；
    这里只覆盖受保护资料，选手自己的提交文件原样保留。
    """
    (folder / 'GAME.md').write_bytes((ROOT.parent / 'README.md').read_bytes())
    (folder / 'RULES.md').write_bytes((ROOT / 'RULES.md').read_bytes())
    shutil.copy(ROOT.parent / 'catalog.js', folder / 'catalog.js')
    public = public_simulation()
    (folder / 'simulation.js').write_text(public, encoding='utf-8', newline='')
    (folder / 'canary.txt').write_text(who, encoding='utf-8', newline='')
    PROTECTED_HASHES[who] = {name: hashed(folder / name) for name in PROTECTED if (folder / name).exists()}


def public_simulation():
    """公开引擎 = 去掉练习电脑的仿真源码，与裁判同源。"""
    source = (ROOT.parent / 'simulation.js').read_text(encoding='utf-8')
    return source[:source.index('/* ============================ 练习电脑')]         + source[source.index('/* ---------- 导出 ---------- */'):]


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
        if not isinstance(cmd, list) or not cmd or cmd[0] not in ('python3', 'node') or not all(isinstance(c, str) for c in cmd):
            raise RuntimeError(who + ' invalid command')
    team = entry.get('team')
    if not isinstance(team, list) or len(team) != 3 or len(set(team)) != 3 or any(c not in team_ids() for c in team):
        raise RuntimeError(who + ' entry.json team must list three distinct catalog characters')
    target = RUN / f'round-{iteration}' / who
    target.mkdir(parents=True, exist_ok=True)
    for item in folder.iterdir():
        if item.is_symlink():
            raise RuntimeError(who + ' submitted a symlink')
        if item.is_dir():
            shutil.copytree(item, target / item.name, dirs_exist_ok=True)
        else:
            shutil.copy(item, target / item.name)
    manifest = {p.relative_to(target).as_posix(): hashed(p) for p in sorted(target.rglob('*')) if p.is_file()}
    save(target / 'manifest.json', manifest)
    save(RUN / f'round-{iteration}-{who}-usage.json', {'usage': usage} if not isinstance(usage, list) else usage)
    config = json.loads((RUN / 'config.json').read_text(encoding='utf-8'))
    config.setdefault('frozen_paths', {})[f'{who}-r{iteration}'] = (target).relative_to(ROOT).as_posix()
    save(RUN / 'config.json', config)
    return entry


def team_ids():
    catalog = json.loads(subprocess.check_output(
        ['node', '-e', "process.stdout.write(JSON.stringify(Object.keys(require('./fighting/catalog').characters)))"],
        cwd=ROOT.parents[1], text=True, encoding='utf-8'))
    return catalog


def prepare(who, iteration):
    # 复用模式：只对第一轮生效——把上一次运行里已完成的提交搬过来，跳过模型准备。
    # 第 2、3 轮必须让模型真的复盘并改进，否则整场就变成同一套策略重复跑，失去迭代意义。
    if ARGS.reuse_workspaces and iteration == 1:
        source = pathlib.Path(ARGS.reuse_workspaces) / 'workspaces' / who
        if not (source / 'entry.json').exists():
            raise RuntimeError(f'{who} 在 {source} 里没有可复用的 entry.json')
        folder = RUN / 'workspaces' / who
        if folder.exists():
            shutil.rmtree(folder)
        shutil.copytree(source, folder)
        refresh_protected(folder, who)
        entry = json.loads((folder / 'entry.json').read_text(encoding='utf-8'))
        save(RUN / f'round-{iteration}-{who}-invocation.json',
             {'model': MODELS[who], 'reasoning_effort': 'medium', 'reused_from': str(source), 'budget_seconds': 0})
        save(RUN / f'round-{iteration}-{who}-completion.json', {'model_completed': True, 'reused_from': str(source)})
        return freeze(who, iteration, [])

    example_window = json.dumps(build_example_window(), ensure_ascii=False)
    prompt = f'''你是 {MODELS[who]}，参加「铁拳谱」1v1 格斗游戏的正式比赛，第 {iteration} 轮（共 {ARGS.rounds} 轮）。

这是一个帧精确的 2D 横版格斗游戏，服务端以 20 Hz 推进，双方每 15 帧（0.75 秒）同时提交一次逐帧输入，收齐后统一推进。
比赛结构：双方各派 3 名角色车轮战，败者换人、胜者保留剩余生命继续，一方三人全灭即落败。
每轮打两局，两局交换座位（先手方互换）。

你的工作目录是 /workspace，只包含你自己的文件与规则资料：
  RULES.md / GAME.md   完整规则与 API
  catalog.js           六名角色的招式与帧数据（重要：所有数值都在这里）
  simulation.js        去掉练习电脑的公开规则源码，可离线跑测试
  example.json         一个真实起始观察与示例输入窗口
  public_results.json  之前的公开战报

请阅读帧数据，理解每名角色的起手帧、判定帧、收招帧、命中硬直、取消窗口、防御方式与必杀指令。
本轮使用 medium effort，准备上限 {ARGS.prepare_seconds // 60} 分钟。充分理解机制、编写并实际运行有对抗性的自测；提前完成即可提交。

在 /workspace/entry.json 写入你的提交，必须包含：
{{"mode":"program","command":["python3","agent.py"],"team":["角色1","角色2","角色3"]}}
team 是三名不同角色的出场顺序（同一方不能重复，双方可以重复选同一角色）。

程序通过 stdin 每行接收一个 JSON 观察，必须向 stdout 输出一行 JSON 并立即 flush。
你只提交自己席位的 15 帧：
{{"inputs":[{{"dir":"F","btn":null}},{{"dir":"F","btn":null}},{{"dir":"D","btn":null}},{{"dir":"DF","btn":null}},{{"dir":"F","btn":"HP"}},…共 15 帧…],"note":"可选简注"}}
dir ∈ N/F/B/U/D/UF/UB/DF/DB（相对朝向，F 永远是你面前那一侧），btn ∈ LP/HP/LK/HK/G 或 null。
不足 15 帧的尾部由裁判补中立；超过 15 帧、帧不是对象、方向或按钮名不合法，整场判技术负。
example.json 的 exampleWindow 字段是一份可照抄的合法窗口（{example_window}）。

必杀技为「方向序列 + 按钮」，最后一段方向必须与按钮同帧：qcf = ↓ ↓↘ →，qcb = ↓ ↓↙ ←，dp = → ↓ ↓↘，hcb = → ↘ ↓ ↙ ←。
序列在 12 帧内完成即成立，中间可夹入无关方向帧。普通技命中后的取消窗口内同样可以取消成必杀，这是连段的核心。

程序单次响应硬上限 5 秒。准备环境可以联网，比赛执行时工作区只读且无网络。
禁止读取对方文件、禁止修改 RULES.md/GAME.md/simulation.js/catalog.js/example.json，禁止下载现成引擎。

把你实际采用的策略、自测结果与局限写入简体中文 review.md。没有对局前不要编造复盘结果。'''
    out = RUN / f'round-{iteration}-{who}.jsonl'
    err = RUN / f'round-{iteration}-{who}.stderr.log'
    cmd = transport.model_command(who, seconds=ARGS.prepare_seconds)
    save(RUN / f'round-{iteration}-{who}-invocation.json', {'model': MODELS[who], 'reasoning_effort': 'medium', 'command': cmd, 'budget_seconds': ARGS.prepare_seconds})
    with out.open('w', encoding='utf-8') as o, err.open('w', encoding='utf-8') as e:
        p = subprocess.run(isolated(who, 'prepare', cmd), input=prompt, stdout=o, stderr=e, text=True,
                           encoding='utf-8', timeout=ARGS.prepare_seconds + 30, creationflags=subprocess.CREATE_NO_WINDOW)
    events = [json.loads(line) for line in out.read_text(encoding='utf-8').splitlines() if line.strip().startswith('{')]
    usage = None
    try:
        usage = transport.completed_usage(who, events)
    except Exception as exc:
        save(RUN / f'round-{iteration}-{who}-completion.json', {'returncode': p.returncode, 'model_completed': False, 'error': str(exc)})
        raise
    save(RUN / f'round-{iteration}-{who}-completion.json', {'returncode': p.returncode, 'model_completed': True})
    check_protected(RUN / 'workspaces' / who, who)
    return freeze(who, iteration, usage)


class Competitor:
    """一名选手在某局中的控制器：program 模式常驻进程，direct 模式每个窗口重开一次模型调用。"""

    def __init__(self, who, entry, iteration, game):
        self.who = who; self.entry = entry; self.iter = iteration
        self.process = transport.JsonProcess(
            isolated(who, 'engine', ['timeout', '--signal=KILL', '7200s', *entry['command']]),
            RUN / f'engine-{iteration}-{game}-{who}.log') if entry['mode'] == 'program' else None

    def move(self, obs):
        if self.process:
            reply = self.process.ask(obs, 5)
            if not isinstance(reply, dict) or not isinstance(reply.get('inputs'), (list, dict)):
                raise RuntimeError('Invalid response envelope')
            return reply
        f = (RUN / f'direct-{self.iter}-{self.who}-{int(time.time() * 1000)}.jsonl').open('w', encoding='utf-8')
        prompt = ('继续本场格斗对局。只读取你自己的笔记和公开规则。把本窗口输出 '
                  '{"inputs":[15 帧的 {"dir":…,"btn":…}]} 写入 action.json。当前状态：\n' + json.dumps(obs))
        try:
            p = subprocess.run(isolated(self.who, 'prepare', transport.model_command(self.who, 'action-summary.txt', 180)),
                               input=prompt, stdout=f, stderr=f, text=True, encoding='utf-8', timeout=200,
                               creationflags=subprocess.CREATE_NO_WINDOW)
            action = json.loads((RUN / 'workspaces' / self.who / 'action.json').read_text(encoding='utf-8'))
        finally:
            f.close()
        return action

    def close(self):
        if self.process:
            self.process.close()


def normalize_window(raw, frames=15):
    """把选手输出收敛成裁判能接受的 15 帧；形状不对就抛错（判技术负），不静默补齐。"""
    if isinstance(raw, dict):
        raw = raw.get('inputs')
    if not isinstance(raw, list) or not raw:
        raise RuntimeError('Window must be a non-empty array of frame objects')
    if raw and isinstance(raw[0], list):
        raw = raw[0]
    out = []
    for frame in raw[:frames]:
        if not isinstance(frame, dict):
            raise RuntimeError('Each frame must be an object with dir and btn')
        out.append({'dir': frame.get('dir', 'N'), 'btn': frame.get('btn')})
    while len(out) < frames:
        out.append({'dir': 'N', 'btn': None})
    return out


def play(iteration, entries, seat_order, game_number, pool):
    game_id = f'r{iteration}-g{game_number}'
    names = [LABELS[w] for w in seat_order]
    teams = [entries[w]['team'] for w in seat_order]
    seed = ARGS.seed_base + iteration * 10 + game_number

    created = REF.ask({'type': 'create', 'id': game_id, 'seed': seed, 'names': names, 'teams': teams})
    state = created['state']
    controllers = {w: Competitor(w, entries[w], iteration, game_number) for w in MODELS}
    frames = [state]; windows = []; errors = {w: [] for w in MODELS}
    technical = None
    scores = {}
    started = time.time()

    try:
        for _ in range(MAX_WINDOWS):
            if state['status'] != 'playing':
                break
            answers = {}
            failed = {}

            def ask(w):
                obs = dict(state)
                obs['yourPlayer'] = seat_order.index(w)
                obs['decisionWindows'] = True
                obs['framesPerWindow'] = 15
                obs['exampleWindow'] = build_example_window()
                obs['lastErrors'] = errors[w][-6:]
                obs['yourTeam'] = teams[seat_order.index(w)]
                t0 = time.time()
                try:
                    return w, controllers[w].move(obs), time.time() - t0, None
                except Exception as exc:
                    # 单侧失败不能连累另一侧：记录原因，由外层判技术负。
                    return w, None, time.time() - t0, str(exc)

            futures = [pool.submit(ask, w) for w in MODELS]
            for fut in futures:
                w, reply, seconds, failure = fut.result()
                if failure:
                    failed[w] = failure
                else:
                    answers[w] = (normalize_window(reply.get('inputs') if isinstance(reply, dict) else reply), seconds)
            if failed:
                raise RuntimeError('; '.join(f'{w}: {m}' for w, m in failed.items()))

            ordered = [answers[w][0] for w in seat_order]
            seconds = [round(answers[w][1], 3) for w in seat_order]
            state = REF.ask({'type': 'window', 'inputs': ordered})['state']
            frames.append(state)
            windows.append({'frame': state['frame'], 'inputs': ordered, 'seconds': seconds})
    except Exception as exc:
        # 协议失败、崩溃或超时：判技术负，并且明确指出是哪一侧，不冒充游戏内胜负。
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
    scores = {w: (state['players'][seat_order.index(w)]['score'] if state.get('players') else 0) for w in MODELS}
    record = {
        'id': game_id, 'round': iteration, 'game': game_number, 'seats': seat_order,
        'names': names, 'teams': teams, 'seed': seed,
        'frames': frames, 'windows': windows,
        'final': state, 'winner': winner,
        'reason': state.get('reason', ''), 'duration': duration,
        'scores': scores, 'errors': {w: len(errors[w]) for w in MODELS},
        'technicalFailure': technical,
    }
    file = RUN / (game_id + '.json.gz')
    with gzip.open(file, 'wb') as f:
        f.write(json.dumps(record, ensure_ascii=False).encode('utf-8'))
    return {
        'id': game_id, 'round': iteration, 'game': game_number, 'seats': seat_order,
        'winner': winner if winner is None else seat_order[winner],
        'reason': record['reason'], 'duration': record['duration'],
        'scores': scores, 'errors': record['errors'],
        'technicalFailure': technical, 'frames': len(frames), 'windows': len(windows),
        'sha256': hashed(file),
    }


def review(who, iteration, summary):
    prompt = (f'请复盘你在「铁拳谱」第 {iteration} 轮的两局比赛。以下是公开战报：\n'
              + json.dumps(summary, ensure_ascii=False)[:20000]
              + '\n把具体对局 ID、模拟帧数/秒数与你的改动写入 /workspace/review.md（简体中文）。')
    out = RUN / f'round-{iteration}-{who}-review.jsonl'
    err = RUN / f'round-{iteration}-{who}-review.stderr.log'
    try:
        with out.open('w', encoding='utf-8') as o, err.open('w', encoding='utf-8') as e:
            subprocess.run(isolated(who, 'prepare', transport.model_command(who, 'review-summary.txt', 600)),
                           input=prompt, stdout=o, stderr=e, text=True, encoding='utf-8', timeout=630,
                           creationflags=subprocess.CREATE_NO_WINDOW)
    except Exception as exc:
        print('review failed for', who, exc, flush=True)


def postmatch(who, iteration, summary):
    prompt = ('比赛已结束。请写一份简体中文赛后复盘：你实际采用的策略、关键对局的具体帧数与判读、'
              '你的失误与可改进之处、以及对游戏机制的理解变化。写入 /workspace/postmatch.md。\n'
              + json.dumps(summary, ensure_ascii=False)[:20000])
    out = RUN / f'postmatch-{who}.jsonl'
    err = RUN / f'postmatch-{who}.stderr.log'
    try:
        with out.open('w', encoding='utf-8') as o, err.open('w', encoding='utf-8') as e:
            subprocess.run(isolated(who, 'prepare', transport.model_command(who, 'postmatch-summary.txt', 600)),
                           input=prompt, stdout=o, stderr=e, text=True, encoding='utf-8', timeout=630,
                           creationflags=subprocess.CREATE_NO_WINDOW)
        source = RUN / 'workspaces' / who / 'postmatch.md'
        if source.exists():
            shutil.copy(source, RUN / f'postmatch-{who}.md')
    except Exception as exc:
        print('postmatch failed for', who, exc, flush=True)


def main():
    global RUN, REF, ARGS, STATE
    parser = argparse.ArgumentParser()
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--players', nargs=2, default=['opus', 'sol'])
    parser.add_argument('--incumbent')
    parser.add_argument('--from-run')
    parser.add_argument('--source-round', type=int, default=3)
    parser.add_argument('--continue-both', action='store_true')
    parser.add_argument('--prepare-seconds', type=int, default=1800)
    parser.add_argument('--port', type=int, default=8796)
    parser.add_argument('--seed-base', type=int, default=1000)
    parser.add_argument('--reuse-workspaces', metavar='RUN_DIR',
                        help='复用某个已完成运行的选手提交，跳过模型准备（用于上一次因非选手原因中断时续跑）')
    ARGS = parser.parse_args()
    if len(set(ARGS.players)) != 2:
        parser.error('Two different models required')
    if any(p not in CATALOG for p in ARGS.players):
        parser.error('Unknown player')
    if not 60 <= ARGS.prepare_seconds <= 3600:
        parser.error('Preparation budget must be 60–3600 seconds')
    if ARGS.incumbent and not ARGS.from_run:
        parser.error('--incumbent requires --from-run')
    if ARGS.continue_both and not ARGS.from_run:
        parser.error('--continue-both requires --from-run')
    if ARGS.incumbent and ARGS.continue_both:
        parser.error('--incumbent and --continue-both are mutually exclusive')

    global MODELS
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
    setup = (f'双方继承各自上一系列策略，继续各迭代 {ARGS.rounds} 轮，每轮各最多 {ARGS.prepare_seconds // 60} 分钟准备'
             if ARGS.continue_both else
             f'{LABELS[ARGS.incumbent]} 沿用上一系列冻结策略，不额外修改；挑战者从零，最多 {ARGS.prepare_seconds // 60} 分钟准备'
             if ARGS.incumbent else
             f'双方从零开始，各最多 {ARGS.prepare_seconds // 60} 分钟准备')
    setup += '；每轮交换座位打两局；每 15 帧（0.75 秒）同步决策，等待双方响应期间游戏不推进；策略代码隔离'
    STATE = {'run': RUN.name, 'phase': '准备比赛', 'models': MODELS, 'labels': {w: LABELS[w] for w in MODELS},
             'reasoning_effort': 'medium', 'round': 1, 'rounds': ARGS.rounds, 'games': [], 'results': [],
             'ready': [], 'setup_note': setup, 'pid': os.getpid(), 'port': ARGS.port, 'completed': False}

    try:
        status('建立隔离环境')
        bootstrap()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for iteration in range(1, ARGS.rounds + 1):
                status('模型准备', round=iteration)
                futures = {w: pool.submit(prepare, w, iteration) for w in MODELS}
                entries = {w: f.result() for w, f in futures.items()}
                save(CONTROL / 'engine-paths.json', {w: (RUN / f'round-{iteration}' / w).relative_to(ROOT).as_posix() for w in MODELS})
                status('比赛进行中', round=iteration, ready=sorted(MODELS))
                save(RUN / f'isolation-engine-{iteration}.json', [probe(w, 'engine') for w in MODELS])

                round_results = []
                for game_number, order in enumerate([list(MODELS), list(reversed(MODELS))], 1):
                    result = play(iteration, entries, order, game_number, pool)
                    round_results.append(result)
                    STATE['results'].append(result)
                    STATE['games'].append({'id': result['id'], 'round': iteration, 'game': game_number,
                                           'seats': result['seats'], 'winner': result['winner'],
                                           'reason': result['reason'], 'duration': result['duration'],
                                           'scores': result['scores'], 'errors': result['errors'],
                                           'technicalFailure': result['technicalFailure'], 'frames': result['frames'],
                                           'sha256': result['sha256']})
                    save(RUN / 'results.json', STATE['results'])
                    status('比赛进行中', round=iteration, game=game_number, game_id=result['id'])
                summary = {'round': iteration, 'games': round_results}
                for w in MODELS:
                    futures = {w: pool.submit(review, w, iteration, summary)}
                    for f in futures.values():
                        f.result()
        status('赛后复盘')
        final = {'series': STATE['results']}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            for w in MODELS:
                pool.submit(postmatch, w, ARGS.rounds, final).result()
        status('比赛完成', completed=True)
    finally:
        if REF:
            REF.close()
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
