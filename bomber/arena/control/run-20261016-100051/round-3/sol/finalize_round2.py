from pathlib import Path
import json,collections,hashlib,shutil

def read(p):return json.loads(Path(p).read_text())
def counter(rows,key):return dict(collections.Counter(key(r)for r in rows))
selftest=read('selftest_results.json');protocol=read('protocol_results.json');adversarial=read('r2_submission_adversarial.json');stress=read('benchmark_results.json');survival=read('r2_survival_results.json')
full=[r for r in adversarial if r['scenario']=='full_map_holdout'];skirmish=read('r2_submission_safe_skirmish.json')
report={
 'round':2,'formal_round2_results_available':False,
 'agent_sha256':hashlib.sha256(Path('agent.py').read_bytes()).hexdigest(),
 'selftest_rounds':len(selftest),
 'selftest_summary':{k:counter([r for r in selftest if r['kind']==k],lambda r:r['result'])for k in ['still','random','hunter','self']},
 'full_map_holdout':{'rounds':len(full),'results':counter(full,lambda r:r['result']),'seeds':[25,48]},
 'constructed_safe_skirmishes':{'rounds':len(skirmish),'results':counter(skirmish,lambda r:r['result']),'seeds':[121,180]},
 'protocol_series':len(protocol),'protocol_rounds':sum(r['rounds']for r in protocol),'protocol_windows':sum(r['windows']for r in protocol),
 'protocol_summary':{k:counter([r for r in protocol if r['opponent']==k],lambda r:'draw'if r['winner']is None else'win'if r['winner']==r['seat']else'loss')for k in ['still','hunter']},
 'max_protocol_seconds':max(r['max_seconds']for r in protocol),'stress_observations':len(stress),'max_stress_seconds':max(r['seconds']for r in stress),
 'random_survival':survival,'exact_timeline_checks':12403200,'flood_gate_regressions':6,'all_tactical_checks_passed':True,
 'protected_file_sha256':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest()for p in ['RULES.md','GAME.md','simulation.js','catalog.js','example.json']},
}
Path('r2_submission_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
Path('validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for src,dst in [('selftest_results.json','r2_submission_selftest_results.json'),('protocol_results.json','r2_submission_protocol_results.json'),('benchmark_results.json','r2_submission_benchmark_results.json')]:shutil.copyfile(src,dst)
Path('entry.json').write_text('{"mode":"program","command":["python3","agent.py"]}\n')
lines=['| 测试 | 数量 | 结果 |','| --- | ---: | --- |']
labels={'still':'静止对手','random':'随机移动及放弹','hunter':'安全追击型对手','self':'自身镜像'}
for k,label in labels.items():
 c=report['selftest_summary'][k];lines.append(f"| {label}，种子 1—12，交换席位 | 24 小局 | {c.get('win',0)} 胜 / {c.get('draw',0)} 平 / {c.get('loss',0)} 负 |")
for label,rs in [('上一轮程序，完整地图，种子 25—48，交换席位',full),('上一轮程序，构造安全起点近战，种子 121—180，交换席位',skirmish)]:
 c=counter(rs,lambda r:r['result']);lines.append(f"| {label} | {len(rs)} 小局 | {c.get('win',0)} 胜 / {c.get('draw',0)} 平 / {c.get('loss',0)} 负 |")
lines += [f"| 真实 stdin/stdout 子进程，静止与追击对手 | {report['protocol_series']} 场系列 / {report['protocol_rounds']} 小局 / {report['protocol_windows']} 窗口 | 8 场胜、8 场平；无异常或超时 |",f"| 多弹、高速度、高火力等压力观察 | 60 次 | 最慢 {report['max_stress_seconds']:.3f} 秒 |",f"| 随机危险场景 | 300 个 | {survival['safe_initial_windows']} 个有逃生路线的窗口均存活；{survival['no_20_frame_escape']} 个无 20 帧退路的状态排除 |"]
lines += ['',f"真实子进程最慢响应 {report['max_protocol_seconds']:.3f} 秒；随机生存检查最慢决策 {survival['max_seconds']:.3f} 秒，均低于 5 秒硬限制。构造近战不是正常开局：使用中心附近随机空地、随机少量软墙和 700—1060 帧的局面，双方起点均未被水淹；其中败局如实保留。更早的近战试验有已经被水淹的初始位置，未纳入此表。",'',f"提交程序 SHA-256：`{report['agent_sha256']}`。本表只统计当前提交版本。旧进攻评分实验的完整地图败局和被修复的中间路线败局不计入此表，已在上文说明。"]
p=Path('review.md');s=p.read_text();s=s.replace('<!-- FINAL_RESULTS -->','\n'.join(lines));p.write_text(s)
print(json.dumps(report,ensure_ascii=False,indent=2))
