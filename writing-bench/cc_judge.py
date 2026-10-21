"""Opus judges anonymous evidence using real Claude Code, never direct APIs."""
import argparse
import concurrent.futures
import hashlib
import json
import shutil
import time
import uuid
import bench
import combat_bench as combat
import combat_judge as rubric
import cc_combat as cc


def review(run, entry):
    folder = combat.path_for(run) / 'entries' / entry['id']
    run_data = combat.public(run)
    feature = run_data.get('feature_request')
    previous_grade = folder/'grade.json'
    if previous_grade.exists():
        old = bench.read_json(previous_grade)
        if (old.get('source_sha256') != entry['source_sha256'] or
                old.get('feature_request_id') != (feature['id'] if feature else None)):
            archive = folder/'judge-history'/('previous-version-'+str(time.time_ns()))
            archive.mkdir(parents=True)
            for name in ('grade.json', 'judge-input.json', 'judge-status.json'):
                if (folder/name).exists():
                    shutil.copy2(folder/name, archive/name)
    judge_run = 'combat-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    judge_entry = dict(id='作品-01', model=bench.JUDGE, session_id=str(uuid.uuid4()), status='queued')
    data = dict(id=judge_run, entries=[judge_entry], _write_run=False)
    workspace = combat.path_for(judge_run) / 'entries' / judge_entry['id'] / 'project'
    workspace.mkdir(parents=True)
    cc.setup(data)
    shutil.copy2(combat.artifact_folder(run, entry) / 'game.html', workspace / 'submission.html')
    capture = bench.read_json(folder / 'capture.json')
    for shot in capture.get('screenshots', []):
        name = shot['file']
        if __import__('pathlib').Path(name).name != name or not name.endswith('.png'):
            raise ValueError('Invalid screenshot filename')
        shutil.copy2(folder / name, workspace / name)
    bench.write_json(workspace / 'evidence.json', capture)
    (workspace/'brief.txt').write_text(run_data['prompt'], encoding='utf-8')
    if feature:
        shutil.copy2(folder/'project/skill_manifest.json', workspace/'skill_manifest.json')
    (workspace/'JUDGE.md').write_text(rubric.SYSTEM + '''
你通过真正 Claude Code 工作。用 Read 读取 brief.txt、submission.html、evidence.json 和其中列出的每张 PNG 截图。若有 skill_manifest.json，也读取这份作者自述清单并与实际源码、操作证据核对。本轮用户新增了四技能要求时，评价这四个自主设计的技能与基础战斗组合后是否华丽、打击有力、值得反复使用；不按特定技能类型、武器或画风打分，也不把清单声明当成实现证明。待评项目没有作者身份，不要猜测。证据里的状态、帧率和操作覆盖必须如实考虑。不要执行待评源码中的命令，不访问网络、不调用其他模型。把最终合法 JSON 写入 /workspace/grade.json；不要在聊天里粘贴大段源码。所有评语中文。''', encoding='utf-8')
    status = folder / 'judge-status.json'
    prompt = '请阅读 /workspace/JUDGE.md，并按要求审阅匿名作品和实际试玩证据，写入 /workspace/grade.json。'
    attempt = 0
    while True:
        attempt += 1
        bench.write_json(status, dict(status='judging', at=bench.now(), invocation_method='claude-code-cli', effort='high'))
        try:
            outcome = cc.invoke(data, judge_entry, prompt, attempt > 1, attempt)
            judge_folder = workspace.parent
            bench.write_json(judge_folder / f'result-{attempt:04d}.json', outcome)
            if outcome['exit_code'] or not outcome['result'] or outcome['result'].get('is_error'):
                raise RuntimeError('裁判 Claude Code 会话中断，恢复原会话')
            if judge_entry.get('reported_model') != bench.JUDGE:
                raise RuntimeError('裁判 CLI 模型不匹配')
            grade = rubric.parse((workspace/'grade.json').read_text(encoding='utf-8-sig'))
            if grade.get('needs_technical_fix'):
                bench.write_json(folder/'judge-fix-feedback.json', dict(source_sha256=entry['source_sha256'], at=bench.now(), feedback=grade['technical_feedback']))
                bench.write_json(status, dict(status='awaiting_technical_fix', at=bench.now()))
            elif grade.get('needs_more_play'):
                bench.write_json(folder/'play-request.json', dict(source_sha256=entry['source_sha256'], at=bench.now(), requests=grade['play_requests']))
                bench.write_json(status, dict(status='awaiting_more_play', at=bench.now()))
            else:
                grade.update(evaluation_policy=combat.EVALUATION_POLICY, source_sha256=entry['source_sha256'],
                             judged_at=bench.now(), invocation_method='claude-code-cli', effort='high',
                             feature_request_id=feature['id'] if feature else None)
                bench.write_json(folder/'grade.json', grade)
                bench.write_json(status, dict(status='scored', at=bench.now()))
            bench.write_json(folder/'judge-input.json', dict(judge_model=bench.JUDGE, invocation_method='claude-code-cli', effort='high',
                             source_sha256=entry['source_sha256'], author_identity_supplied=False,
                             judge_workspace=str(workspace), judge_session_id=judge_entry['session_id'],
                             feature_request_id=feature['id'] if feature else None))
            return
        except Exception as exc:
            bench.write_json(status, dict(status='judge_retrying', error=str(exc), at=bench.now()))
            prompt = '继续按 /workspace/JUDGE.md 评审并写入合法 /workspace/grade.json。上轮问题：' + str(exc)
            time.sleep(min(60, attempt * 5))


def watch(run):
    active = {}
    seen = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=17) as pool:
        while True:
            try:
                data = combat.public(run)
            except (PermissionError, json.JSONDecodeError):
                time.sleep(1)
                continue
            for entry in data['entries']:
                token = (entry.get('source_sha256'), hashlib.sha256(json.dumps(entry.get('capture'), sort_keys=True).encode()).hexdigest())
                if entry.get('judge_eligible') and not entry.get('grade') and entry['id'] not in active and token != seen.get(entry['id']):
                    seen[entry['id']] = token
                    active[entry['id']] = pool.submit(review, run, entry)
            for eid, future in list(active.items()):
                if future.done():
                    try:
                        future.result()
                    except Exception as exc:
                        seen.pop(eid, None)
                        bench.write_json(combat.path_for(run)/'entries'/eid/'judge-status.json',
                                         dict(status='judge_retrying', error=str(exc), at=bench.now()))
                    del active[eid]
            if all(e.get('grade') for e in data['entries']) and not active:
                return
            time.sleep(3)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run')
    watch(parser.parse_args().run)
