"""Deliver a user feature update through each author's existing Claude Code worker."""
import argparse
import json
import time

import bench
import combat_bench as combat

REQUEST_ID = 'user-four-skills-20261019'
PROMPT = '''用户最新追加需求，优先于旧题面中的动作示例：
在你自己的现有横版战斗项目里新增 4 个实际实现的技能。请自己构思华丽、有打击感、能在真实战斗中使用的技能。技能名称、机制、动作、视觉、风格、节奏、触发条件和操作方式都由你自行决定。旧题面里的可选动作举例不构成设计方向要求，统一键位以及鼠标只用于菜单的旧条款不限制这 4 个新技能。保留你自己的创作，不看其他模型的项目。

撤销旧题面中“图形和音效必须自行绘制或合成”的额外约束。技能的表现素材和实现方式也自行选择，可使用有权使用的素材与库。离线 game.html 是当前本地试玩容器的兼容交付方式，不是美术或技能设计方向。继续由你自己通过 Claude Code 完成项目，不调用其他模型代做。

继续直接修改、构建和自测自己的完整项目，交付 /workspace/game.html。若还有实际运行故障，一并修好。本轮继续使用原模型、原 Claude Code 会话和 high 推理，不增加输出、总时长或工具轮数上限。只评最终打起来是否爽。

在游戏内清楚展示这 4 个技能的触发或操作方式。交付时另外写 /workspace/skill_manifest.json，格式为 {"request_id":"user-four-skills-20261019","skills":[{"name":"你构思的名称","controls":"实际触发或操作方式","description":"简要说明实际效果"}]}，skills 数组恰好 4 项。清单只是方便试玩，真实技能必须实现于可运行游戏；保留项目源码。结束时中文简要说明。'''


def manifest_valid(project):
    path = project/'skill_manifest.json'
    try:
        data = bench.read_json(path)
        skills = data['skills']
        return (data.get('request_id') == REQUEST_ID and isinstance(skills, list) and
                len(skills) == 4 and len({s['name'] for s in skills}) == 4 and
                all(isinstance(s.get(k), str) and s[k].strip()
                    for s in skills for k in ('name', 'controls', 'description')))
    except (OSError, ValueError, KeyError, TypeError):
        return False


def initialize(run):
    data = combat.load(run)
    root = combat.path_for(run)
    bench.write_json(root/'feature-request.json', dict(
        id=REQUEST_ID, at=bench.now(), prompt=PROMPT, required_skills=4,
        origin='explicit-user-request', invocation_method='claude-code-cli', effort='high'))
    for entry in data['entries']:
        folder = root/'entries'/entry['id']
        project = folder/'project'
        (project/'USER_UPDATE_4_SKILLS.md').write_text(PROMPT, encoding='utf-8')
        instructions = project/'CLAUDE.md'
        old = instructions.read_text(encoding='utf-8') if instructions.exists() else ''
        if REQUEST_ID not in old:
            instructions.write_text(old+'\n\n# '+REQUEST_ID+'\n请优先阅读 /workspace/USER_UPDATE_4_SKILLS.md，这是用户最新追加需求。\n', encoding='utf-8')
        state = folder/'skill-update.json'
        if not state.exists():
            bench.write_json(state, dict(request_id=REQUEST_ID, status='pending', at=bench.now(), sequence=0))


def watch(run):
    initialize(run)
    root = combat.path_for(run)
    while True:
        try:
            entries = combat.public(run)['entries']
        except (PermissionError, json.JSONDecodeError):
            time.sleep(1)
            continue
        complete = 0
        for entry in entries:
            if entry.get('administrative_result'):
                complete += 1
                continue
            folder = root/'entries'/entry['id']
            path = folder/'skill-update.json'
            state = bench.read_json(path)
            dev = entry.get('development') or {}
            sha = entry.get('source_sha256')
            if state['status'] == 'delivered' and state.get('source_sha256') == sha:
                complete += 1
                continue
            if dev.get('status') == 'fixing':
                if state['status'] == 'requested':
                    state.update(status='working', at=bench.now())
                    bench.write_json(path, state)
                continue
            if entry['status'] != 'ready' or dev.get('status') != 'awaiting_check':
                continue
            valid = manifest_valid(folder/'project')
            changed = not state.get('posted_sha256') or state['posted_sha256'] != sha
            if valid and changed:
                state.update(status='delivered', source_sha256=sha, at=bench.now(),
                             manifest=bench.read_json(folder/'project/skill_manifest.json'),
                             note='原模型已交付四技能版本，仍需实际试玩验证技能效果')
                bench.write_json(path, state)
                print(entry['model']+' four skills delivered', flush=True)
                complete += 1
                continue
            if state['status'] == 'requested':
                # A very short continuation can publish between two polls.
                if sha == state.get('posted_sha256') and dev.get('at', '') <= state.get('at', ''):
                    continue
                state['status'] = 'working'
            state['sequence'] += 1
            note = PROMPT + '\n交付核对序号：' + str(state['sequence'])
            if state['sequence'] > 1:
                note += '\n上一版尚未同时满足新增四技能清单及实际游戏重新构建，请继续完成自己的项目。'
            existing = folder/'judge-fix-feedback.json'
            value = bench.read_json(existing) if existing.exists() else {}
            notes = value.get('feedback', []) if value.get('source_sha256') == sha and value.get('origin') != 'user-feature-request' else []
            # The existing worker serializes all continuations for an author.
            # Keep its established feedback transport; mark the real origin explicitly.
            bench.write_json(existing, dict(source_sha256=sha, at=bench.now(),
                origin='user-feature-request', request_id=REQUEST_ID, feedback=notes+[note]))
            state.update(status='requested', posted_sha256=sha, at=bench.now())
            bench.write_json(path, state)
            print(entry['model']+' four skills requested', flush=True)
        if complete == len(entries):
            print('ALL FOUR-SKILL PROJECTS DELIVERED', flush=True)
            return
        time.sleep(3)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run')
    watch(parser.parse_args().run)
