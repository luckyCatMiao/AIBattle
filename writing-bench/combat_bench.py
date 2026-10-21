"""Isolated, resumable HTML combat prototypes. No model code executes on the host."""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import random
import re
import subprocess
import threading
import time
from urllib.parse import urlparse, unquote
import uuid
import bench

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / 'combat-runs'
STATIC = ROOT / 'combat-public'
LOCK = threading.RLock()
MAX_TOKENS = 1_000_000
DEADLINE = None
EVALUATION_POLICY = 'feel-only-v2'
SYSTEM = '你是独立动作游戏开发者。完成用户的战斗系统试玩作品。只交付完整的单文件 HTML，不要解释、自评、署名或显示模型身份。'
PROMPT = '''制作一个可以直接在桌面浏览器玩的横版动作战斗系统试玩。核心目标：亲手操作时非常爽，动作炫酷，命中有力，操作与反馈构成有吸引力的战斗体验。只需要一个打磨好的战斗场景，不需要完整游戏、剧情、经营、复杂菜单或很多关卡。世界观、角色、美术风格、战斗节奏和动作设计由你决定，自行创作。

这是一道没有唯一标准答案的开放创作题。神之天平、彩虹岛 Online、胧村正、死亡细胞、武士零只是说明横版动作游戏可以有很多种好手感，并不是要求模仿其中任何一款。快节奏连斩、沉重蓄力、精确反击或其他自洽的路线都可以。没有预定的动作方向、固定的连招答案或必须堆满的特效配方；请设计你认为最让人想反复战斗的系统。

必须实际实现并能在交战中体验：
1. 横版移动、跳跃、攻击与机动能力，并设计有意思的攻击衔接或攻防决策。轻重攻击、连段、挑空追击、蓄力、弹反等是可选思路，具体组合由你决定，不要求全部实现。角色动作要有可读的准备、出招和收招，体现精彩的动作姿态与运动，不能只是方块接触掉血。
2. 命中顿帧（hit stop）是重点：命中才停、时长有力度差别，之后顺畅恢复；配合有节制的震屏、刀光、命中特效、敌人受击动作、击退或击飞和落地反馈。不要用连续震屏或满屏闪白掩盖手感。
3. 可战斗的敌人，会主动接近、攻击并有可观察的攻击前兆，玩家能闪避和受伤；至少两种有区别的敌人行为。不能只有静止靶子。
4. 可见、能触发的肢体破坏：敌人有分段肢体，被强力攻击或连段打断时肢体会断裂、飞散或碎裂，且影响其后续动作或战斗能力。可用怪物、机甲、木偶等对象；艺术表现自定。不能只写提示文字或用普通死亡粒子冒充肢体破坏。
5. 适合不断试玩：敌人持续刷新或每波后很快继续，有清楚的玩家血量/状态，死亡可一键重开。首次进入几秒内就能开始打。重视输入响应、连击衔接和相机，不要让玩家频繁等候、追敌或被无限硬直。
6. 有浏览器合成的命中/挥击/冲刺等音效，首次点击或按键后启用，提供静音按钮。没有音频也不能阻止游戏运行。

统一按键（具体招式由你设计，必须在屏幕上清楚显示）：A/D 或左右箭头移动；Space 跳跃；J 主攻击；K 副攻击（如重击/蓄力/另一种攻击）；L 机动（如冲刺/闪避）；I 特色能力（如挑空/弹反/特殊招式，自行选择）；R 重新开始；Enter 开始/确认。鼠标只用于点击开始、静音等按钮。阻止这些游戏按键让外层页面滚动，失去焦点时清空按键以免卡住。不要强制全屏或锁定鼠标。场景适配至少 960×540 的显示区域，也能适应宽屏。

技术交付：一个完整独立的 HTML，内联 CSS 和 JavaScript，优先使用 Canvas 2D。不得依赖任何外部文件、网络、CDN、库、安装或构建。绘制图形与合成音效均在本文件实现；禁止调用生图接口。禁止 fetch、XMLHttpRequest、WebSocket、EventSource、sendBeacon、Service Worker、iframe、弹窗及对父页面的访问。作品运行在只有 allow-scripts 权限的沙箱 iframe 中，无法使用 localStorage、父窗口、下载或外部资源，请确保不会因此崩溃。不要添加模型身份或自评。

为方便核对启动情况，提供只读函数 window.combatBenchState()，返回简单 JSON 兼容对象，至少含 ready（布尔）、playerAlive（布尔）、enemyCount（整数）、hitCount（成功命中次数）、limbBreakCount（断肢次数）、playing（布尔）。这些值必须来自真实游戏状态；检查接口不参与游戏逻辑，也不要求为检查简化战斗。优先保证可玩和手感，完整闭合所有标签和脚本。

本题不限制字数、代码行数、总输出量或总耗时。你可以写到自己认为战斗系统足够打磨为止，不需要精简代码或为了输出预算删减设计。若接口单次输出触顶，后续会继续请求剩余源码，直到完整交付；请保持自己的完整设计，不压缩成简化演示。篇幅长短本身不加分或扣分，最终只看战斗体验。

只输出从 <!DOCTYPE html> 到 </html> 的完整文件，不要 Markdown 围栏、解释或评分。'''

def path_for(run_id):
    if not re.fullmatch(r'combat-\d{8}-\d{6}-[a-f0-9]{6}', run_id):
        raise ValueError('Invalid run ID')
    return RUNS / run_id

def load(run_id):
    with LOCK:
        return bench.read_json(path_for(run_id) / 'run.json')

def save(data):
    with LOCK:
        data['updated_at'] = bench.now()
        bench.write_json(path_for(data['id']) / 'run.json', data)

def create():
    models = bench.model_ids()
    random.SystemRandom().shuffle(models)
    rid = 'combat-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    data = dict(id=rid, title='一场好打的战斗', created_at=bench.now(), state='queued',
                prompt=PROMPT, system=SYSTEM, prompt_sha256=hashlib.sha256(PROMPT.encode()).hexdigest(),
                parameters=dict(max_tokens=MAX_TOKENS, deadline_seconds=DEADLINE, concurrency=4,
                                total_output_limit=None, automatic_continuation=True,
                                technical_attempts=2, effort='provider_default', tools=False),
                entries=[dict(id=f'作品-{i+1:02d}', model=m, status='queued') for i,m in enumerate(models)])
    save(data)
    (ROOT/'latest-combat-run.txt').write_text(rid, encoding='utf-8')
    return data

class Stream(bench.RecordedStream):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.deadline = None

    @property
    def text_stream(self):
        def events():
            for kind, data in bench.proxy._iter_sse_events(self._resp, deadline=self.deadline):
                event = data.get('type') or kind
                if event == 'message_start':
                    self.response_model = data.get('message', {}).get('model')
                    self.response_id = data.get('message', {}).get('id')
                if event == 'message_stop':
                    self.saw_message_stop = True
                yield kind, data
        yield from bench.proxy._accumulate_sse(events(), self.result)

def token_ceiling(error, current):
    """Only negotiate a token parameter rejected by the provider, never model/auth errors."""
    if not re.search(r'max[_ -]?tokens|maximum.{0,20}(?:output|tokens)|output.{0,20}(?:limit|tokens)|最大.{0,15}(?:输出|token)',error,re.I):
        return None
    if not re.search(r'exceed|maximum|at most|less than|too (?:large|high)|<=|最多|最大|超出|超过|不超过|range|between',error,re.I):
        return None
    numbers=[int(x.replace(',','')) for x in re.findall(r'\b\d[\d,]*\b',error)]
    candidates=[n for n in numbers if 1024<=n<current]
    if candidates:
        return min(candidates)
    return next((n for n in (262144,131072,65536,32768,16384,8192,4096,1024) if n<current),None)

CONTINUE = '上一条回复因接口单次输出上限中断。本任务没有本地总输出额度和总时长限制。请从断点原样继续，只输出还未输出的剩余内容，不重复前文、不加解释或代码围栏，直到完整交付。若确需替换整份作品，请明确以新的 <!DOCTYPE html> 开头输出完整文件。'
CONTINUE_DOCUMENT = '继续交付紧接断点的下一个完整函数及其必要的相邻声明，保持原设计，不重复前文。这一段先在该函数的自然边界结束，后续会自动继续请求其余函数，不需要一次性交付整个剩余文件。如果已经到文档末尾，则补齐脚本与HTML的闭合标签直到 </html>。只输出源码，不加解释、围栏或分段标记。没有总输出、函数数量或总时长限制。'

def request(model, *, messages=None, system=None, progress_dir=None, continue_output=True, token_cap=None, continue_incomplete_document=False):
    start = time.monotonic()
    record = dict(requested_model=model, started_at=bench.now(), max_tokens=MAX_TOKENS,
                  deadline_seconds=None,total_output_limit=None,segments=[],token_negotiations=[])
    history=list(messages) if messages is not None else [{'role':'user','content':PROMPT}]
    cap=MAX_TOKENS
    if token_cap is not None:
        if type(token_cap) is not int or not 1024<=token_cap<=MAX_TOKENS:
            raise ValueError('Invalid tested provider token cap')
        cap=token_cap
        record['provider_tested_token_cap']=cap
    assembled=''
    total_input=total_output=thinking_count=0
    stream=None
    chunks=[]
    segment=1
    progress_dir=Path(progress_dir) if progress_dir else None
    def checkpoint(path, value):
        try:
            bench.write_json(path,value)
        except OSError as exc:
            warnings=record.setdefault('checkpoint_warnings',dict(count=0))
            warnings.update(count=warnings['count']+1,last_error=bench.sanitize(exc))
    try:
        while True:
            chunks=[]
            stream=Stream(messages=history,model=model,system=SYSTEM if system is None else system,
                          max_tokens=cap,timeout=None)
            last_checkpoint=0
            try:
                with stream:
                    for chunk in stream.text_stream:
                        chunks.append(chunk)
                        if progress_dir and time.monotonic()-last_checkpoint>5:
                            checkpoint(progress_dir/f'segment-{segment}-progress.json',
                                dict(requested_model=model,max_tokens=cap,at=bench.now(),text=bench.sanitize(''.join(chunks))))
                            last_checkpoint=time.monotonic()
            except Exception as exc:
                smaller=token_ceiling(str(exc),cap) if getattr(exc,'status_code',None) in (400,422) else None
                if smaller:
                    record['token_negotiations'].append(dict(requested=cap,accepted_ceiling=smaller,error=bench.sanitize(exc)))
                    cap=smaller
                    continue
                raise
            finally:
                if stream._resp_ctx is not None:
                    try:stream._resp_ctx.__exit__(None,None,None)
                    except Exception:pass
            text=''.join(chunks)
            if not text.strip():
                raise ValueError('接口没有返回作品正文')
            if not stream.result.stop_reason:
                raise ValueError('响应流缺少完成标记')
            meta=dict(index=segment,max_tokens=cap,stop_reason=stream.result.stop_reason,
                      input_tokens=stream.result.input_tokens,output_tokens=stream.result.output_tokens,
                      response_model=stream.response_model,response_id=stream.response_id,
                      sha256=hashlib.sha256(text.encode()).hexdigest())
            record['segments'].append(meta)
            if progress_dir:
                checkpoint(progress_dir/f'segment-{segment}.json',dict(**meta,text=bench.sanitize(text)))
            total_input+=stream.result.input_tokens or 0
            total_output+=stream.result.output_tokens or 0
            thinking_count+=len(stream.result.thinking)
            # A model may deliberately deliver a new full document on continuation.
            if segment>1 and re.match(r'\s*(?:```html\s*)?<!doctype\s+html',text,re.I):
                assembled=text
            else:
                assembled+=text
            # A fully closed document need not generate meaningless extra code.
            if re.search(r'</html\s*>\s*(?:```)?\s*$',assembled,re.I):
                break
            if not continue_output or stream.result.stop_reason!='max_tokens' and not continue_incomplete_document:
                break
            history.extend([{'role':'assistant','content':text},{'role':'user','content':CONTINUE_DOCUMENT if continue_incomplete_document else CONTINUE}])
            segment+=1
        record.update(status='ok',text=bench.sanitize(assembled),effective_max_tokens=cap)
    except Exception as exc:
        record.update(status='error', error=bench.sanitize(exc), error_type=type(exc).__name__,
                      http_status=getattr(exc,'status_code',None),partial_text=bench.sanitize(assembled+''.join(chunks)))
        if progress_dir:
            checkpoint(progress_dir/'interrupted.json',dict(at=bench.now(),error=record['error'],partial_text=record['partial_text']))
    record.update(elapsed_seconds=round(time.monotonic()-start,2),response_model=getattr(stream,'response_model',None),
                  response_id=getattr(stream,'response_id',None),stop_reason=stream.result.stop_reason if stream else None,
                  input_tokens=total_input,output_tokens=total_output,
                  message_stop=getattr(stream,'saw_message_stop',False),thinking_char_count=thinking_count)
    return record

class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts=[]
        self.current=None
        self.errors=[]

    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag in ('iframe','object','embed','base'):
            self.errors.append('不允许的嵌入元素：'+tag)
        if tag=='script':
            if attrs.get('src'):
                self.errors.append('不允许外部脚本')
            if attrs.get('type','').lower() in ('','text/javascript','application/javascript','module'):
                self.current=dict(type=attrs.get('type',''), text='')
        for k,v in attrs.items():
            if k in ('src','href','action') and v and re.match(r'^(?:https?:|//|file:)',v.strip(),re.I):
                self.errors.append('不允许外部资源：'+k)

    def handle_data(self, data):
        if self.current is not None:
            self.current['text']+=data

    def handle_endtag(self, tag):
        if tag=='script' and self.current is not None:
            self.scripts.append(self.current)
            self.current=None

def prepare(text, folder):
    match=re.search(r'(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*?</html\s*>',text,re.I)
    if not match:
        raise ValueError('未交付完整 HTML 文档')
    html=match.group(0)
    parser=Scripts()
    parser.feed(html)
    if parser.errors:
        raise ValueError('；'.join(dict.fromkeys(parser.errors)))
    if not parser.scripts:
        raise ValueError('没有可运行的内联 JavaScript')
    for i,script in enumerate(parser.scripts):
        result=subprocess.run(['node','--check','--input-type='+('module' if script['type']=='module' else 'commonjs')],
                              input=script['text'],text=True,capture_output=True,timeout=20,encoding='utf-8')
        if result.returncode:
            raise ValueError(f'脚本 {i+1} 语法检查未通过：'+result.stderr[:1800])
    (folder/'game.html').write_bytes(html.encode('utf-8'))
    return dict(html_sha256=hashlib.sha256(html.encode()).hexdigest(), scripts=len(parser.scripts),
                syntax_checked=True, runtime_tested=False, extracted_only=True)

def generate(data, entry):
    folder=path_for(data['id'])/'entries'/entry['id']
    folder.mkdir(parents=True, exist_ok=True)
    bench.write_json(folder/'writer-input.json',dict(prompt=PROMPT,system=SYSTEM,parameters=data['parameters'],
                                                   prompt_sha256=data['prompt_sha256']))
    with LOCK:
        entry['status']='building'
        save(data)
    for attempt in range(1,3):
        record=request(entry['model'],progress_dir=folder/'stream'/str(attempt))
        bench.write_json(folder/f'writer-attempt-{attempt}.json',record)
        with LOCK:
            entry['attempts']=attempt
            if record['status']=='ok':
                (folder/'original.txt').write_bytes(record['text'].encode('utf-8'))
                entry['writer']={k:v for k,v in record.items() if k!='text'}
                try:
                    entry['validation']=prepare(record['text'], folder)
                    entry['status']='ready'
                    entry.pop('error',None)
                except Exception as exc:
                    entry.update(status='invalid',error=bench.sanitize(exc))
                save(data)
                print(json.dumps(dict(entry=entry['id'],status=entry['status'],seconds=record['elapsed_seconds']),ensure_ascii=False),flush=True)
                return
            entry.update(error=record['error'],status='building')
            save(data)
        if record.get('http_status') in (400,401,403,404,422):
            break
    with LOCK:
        entry['status']='failed'
        save(data)
    print(json.dumps(dict(entry=entry['id'],status='failed',error=entry.get('error','')[:180]),ensure_ascii=False),flush=True)

def run(data):
    bench.initialize_credentials()
    data['state']='building'
    save(data)
    pending=[e for e in data['entries'] if e['status'] in ('queued','building','failed')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda e:generate(data,e),pending))
    data['state']='complete' if all(e['status']=='ready' for e in data['entries']) else 'complete_with_errors'
    save(data)
    print('COMPLETE '+data['id'],flush=True)

def artifact_folder(run_id, entry):
    folder=path_for(run_id)/'entries'/entry['id']
    relative=entry.get('development',{}).get('artifact')
    if relative is None:
        return folder/'repair' if entry.get('repaired') else folder
    if relative not in ('.','repair') and not re.fullmatch(r'versions/v\d{4,}',relative):
        raise ValueError('Invalid artifact version')
    return folder/relative

def source_hash(run_id,entry):
    path=artifact_folder(run_id,entry)/'game.html'
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None

def public(run_id):
    data=load(run_id)
    terminal_path=path_for(run_id)/'terminal-results.json'
    terminal=bench.read_json(terminal_path) if terminal_path.exists() else {}
    feature_path=path_for(run_id)/'feature-request.json'
    feature=bench.read_json(feature_path) if feature_path.exists() else None
    if feature and feature.get('status')=='cancelled':
        data['cancelled_feature_request']=feature
        feature=None
    if feature:
        data['feature_request']=feature
        data['prompt']+='\n\n用户最新追加需求：\n'+feature['prompt']
    p=path_for(run_id)/'human.json'
    ratings=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
    policy_path=path_for(run_id)/'evaluation-policy.json'
    if policy_path.exists():
        data['evaluation_policy']=json.loads(policy_path.read_text(encoding='utf-8'))
    for e in data['entries']:
        e['human']=ratings.get(e['id'])
        folder=path_for(run_id)/'entries'/e['id']
        skill_path=folder/'skill-update.json'
        if skill_path.exists():
            e['skill_update']=bench.read_json(skill_path)
        if (folder/'repair.json').exists():
            repair=json.loads((folder/'repair.json').read_text(encoding='utf-8'))
            e['repair']=repair
            if repair.get('status')=='ready':
                e['initial_status']=e['status']
                e['initial_writer']=e.get('writer')
                e.update(status='ready',validation=repair['validation'],writer=repair['writer'],repaired=True)
                e.pop('error',None)
        if (folder/'development.json').exists():
            dev=json.loads((folder/'development.json').read_text(encoding='utf-8'))
            e['development']=dev
            if dev.get('validation') and (artifact_folder(run_id,e)/'game.html').exists():
                e.update(status='ready',validation=dev['validation'])
                e.pop('error',None)
                if not e.get('writer') and dev.get('writer'):
                    e['writer']=dev['writer']
        for filename,key in [('grade.json','grade'),('capture.json','capture'),('judge-status.json','judge_meta'),('runtime-observation.json','runtime')]:
            if (folder/filename).exists():
                e[key]=json.loads((folder/filename).read_text(encoding='utf-8'))
        if e.get('judge_meta'):
            e['judge_status']=e['judge_meta'].get('status')
            e['judge_error']=e['judge_meta'].get('error')
        e['source_sha256']=source_hash(run_id,e)
        check_path=folder/'combat-check.json'
        check=json.loads(check_path.read_text(encoding='utf-8')) if check_path.exists() else {}
        e['combat_check']=check if check.get('source_sha256')==e['source_sha256'] else None
        for key in ('capture','runtime'):
            if e.get(key) and e[key].get('source_sha256')!=e['source_sha256']:
                e.pop(key,None)
        e['judge_eligible']=bool(e['source_sha256'] and e.get('capture') and (e.get('combat_check') or {}).get('passed')
                                and (e.get('runtime') or {}).get('status')!='error'
                                and e.get('development',{}).get('status') not in ('needs_fix','fixing','awaiting_service'))
        if feature:
            skill=e.get('skill_update') or {}
            e['judge_eligible']=bool(e['judge_eligible'] and skill.get('status')=='delivered'
                                    and skill.get('source_sha256')==e['source_sha256']
                                    and (e.get('combat_check') or {}).get('verified_skill_count')==feature['required_skills'])
        if e.get('grade') and (e['grade'].get('evaluation_policy')!=EVALUATION_POLICY or
                              e['grade'].get('source_sha256')!=e['source_sha256'] or not e['judge_eligible'] or
                              (feature and e['grade'].get('feature_request_id')!=feature['id'])):
            e['previous_grade_available']=True
            e.pop('grade',None)
        decision=terminal.get('entries',{}).get(e['id'])
        if decision:
            e['administrative_result']=decision
            e['judge_eligible']=False
            e.pop('grade',None)
        e['combat_verified']=e['judge_eligible']
        if data.get('grading_cancelled'):
            e['judge_eligible']=False
            e['judge_status']='cancelled'
    data['rated_count']=len(ratings)
    data['verified_count']=sum(e['combat_verified'] for e in data['entries'])
    if feature:
        data['skill_delivered_count']=sum((e.get('skill_update') or {}).get('status')=='delivered' and
                                         (e.get('skill_update') or {}).get('source_sha256')==e['source_sha256']
                                         for e in data['entries'])
    return data

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def send(self,data,status=200,mime='application/json; charset=utf-8',game=False,attachment=None):
        body=json.dumps(data,ensure_ascii=False).encode() if mime.startswith('application/json') else data
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts; frame-ancestors 'self'" if game else "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        self.send_header('Content-Security-Policy',csp)
        if attachment:
            self.send_header('Content-Disposition','attachment; filename="'+attachment+'"')
        self.end_headers()
        self.wfile.write(body)

    def local(self):
        return self.headers.get('Host','').split(':')[0] in ('localhost','127.0.0.1')

    def do_GET(self):
        if not self.local():
            return self.send({'error':'Local host required'},403)
        path=urlparse(self.path).path
        try:
            if path=='/api/runs':
                return self.send([dict(id=d['id'],title=d['title'],state=d['state'],total=len(d['entries']))
                    for p in sorted(RUNS.glob('combat-*/run.json'),reverse=True)
                    for d in [json.loads(p.read_text(encoding='utf-8'))]])
            if path.startswith('/api/runs/'):
                parts=path.removeprefix('/api/runs/').split('/')
                data=public(parts[0])
                if len(parts)==1:
                    return self.send(data)
                if len(parts)==4 and parts[1]=='entries':
                    entry=next((e for e in data['entries'] if e['id']==unquote(parts[2])),None)
                    if not entry:
                        return self.send({'error':'Not found'},404)
                    folder=path_for(data['id'])/'entries'/entry['id']
                    source_folder=artifact_folder(data['id'],entry)
                    if parts[3]=='game' and entry['status']=='ready':
                        html=(source_folder/'game.html').read_bytes()
                        if 'sample=1' in urlparse(self.path).query.split('&'):
                            html+=b'<script>'+ (ROOT/'combat-sample.js').read_bytes()+b'</script>'
                        return self.send(html,mime='text/html; charset=utf-8',game=True)
                    if parts[3]=='source' and (source_folder/'game.html').exists():
                        return self.send((source_folder/'game.html').read_bytes(),mime='application/octet-stream',attachment=entry['id'].split('-')[-1]+'.html')
            name={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}.get(path)
            if name:
                mime={'html':'text/html','js':'text/javascript','css':'text/css'}[name.split('.')[-1]]
                return self.send((STATIC/name).read_bytes(),mime=mime+'; charset=utf-8')
            self.send({'error':'Not found'},404)
        except (ValueError,KeyError,FileNotFoundError) as exc:
            self.send({'error':str(exc)},404)

    def do_POST(self):
        origin=self.headers.get('Origin')
        if not self.local() or (origin and origin!='http://'+self.headers.get('Host','')) or self.headers.get('Sec-Fetch-Site')=='cross-site':
            return self.send({'error':'Origin rejected'},403)
        if 'application/json' not in self.headers.get('Content-Type',''):
            return self.send({'error':'JSON required'},415)
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=12000:
                raise ValueError('Invalid request size')
            body=json.loads(self.rfile.read(length))
            parts=urlparse(self.path).path.removeprefix('/api/runs/').split('/')
            if len(parts)!=2 or parts[1]!='human-grade':
                return self.send({'error':'Not found'},404)
            with LOCK:
                data=public(parts[0])
                e=next((e for e in data['entries'] if e['id']==body.get('entry_id')),None)
                if not e or e['status']!='ready':
                    raise ValueError('作品尚未交付')
                score=body.get('score')
                note=body.get('note','')
                if type(score) is not int or not 0<=score<=100 or not isinstance(note,str) or len(note)>2000:
                    raise ValueError('请输入 0～100 的整数分数，评语最多 2000 字')
                p=path_for(parts[0])/'human.json'
                ratings=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
                ratings[e['id']]=dict(score=score,note=note,source_sha256=e.get('source_sha256'),updated_at=bench.now())
                bench.write_json(p,ratings)
                return self.send(public(parts[0]))
        except (ValueError,KeyError,FileNotFoundError) as exc:
            self.send({'error':str(exc)},400)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--create',action='store_true')
    parser.add_argument('--run')
    parser.add_argument('--serve',action='store_true')
    parser.add_argument('--port',type=int,default=8805)
    args=parser.parse_args()
    if args.create:
        print(create()['id'])
    if args.run:
        run(load(args.run))
    if args.serve:
        print(f'Combat Bench http://127.0.0.1:{args.port}',flush=True)
        ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()

if __name__=='__main__':
    main()
