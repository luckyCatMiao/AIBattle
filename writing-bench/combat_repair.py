"""One uniform self-repair stage for syntactically incomplete submissions only."""
import argparse
import concurrent.futures
import json
import time
import bench
import combat_bench as c

def repair(run_id,entry):
    folder=c.path_for(run_id)/'entries'/entry['id']
    target=folder/'repair'
    target.mkdir(exist_ok=True)
    status=folder/'repair.json'
    if status.exists() and json.loads(status.read_text(encoding='utf-8')).get('status')!='interrupted':
        return
    source=(folder/'original.txt').read_text(encoding='utf-8')
    feedback='你的上一份提交未通过交付检查：'+entry.get('error','')+'。完成原因：'+str(entry.get('writer',{}).get('stop_reason'))+'''。
现在请自行修复交付问题。只看你自己的上份作品，游戏要求与按键保持原题不变，优先完成好玩的核心战斗。本轮不设置本地总输出额度和总时长限制；单次请求先申请100万 tokens，接口如强制更低上限，程序会在触顶时自动请求续写。无需为代码长度牺牲实现，也无需为填满额度堆砌内容。请从 <!DOCTYPE html> 到 </html> 重新输出完整独立文件，不要只输出补丁、解释或 Markdown；若被截断，后续按续写请求继续。'''
    messages=[{'role':'user','content':c.load(run_id)['prompt']},{'role':'assistant','content':source},
              {'role':'user','content':feedback}]
    bench.write_json(target/'writer-input.json',dict(prompt=c.load(run_id)['prompt'],feedback=feedback,
        own_source_supplied=True,other_authors_supplied=False,max_tokens=c.MAX_TOKENS,system=c.SYSTEM))
    bench.write_json(status,dict(status='repairing',at=bench.now()))
    for attempt in (1,2):
        result=c.request(entry['model'],messages=messages,progress_dir=target/'stream'/str(attempt))
        bench.write_json(target/f'writer-attempt-{attempt}.json',result)
        if result['status']=='ok':
            (target/'original.txt').write_bytes(result['text'].encode())
            try:
                validation=c.prepare(result['text'],target)
                bench.write_json(status,dict(status='ready',at=bench.now(),validation=validation,
                    writer={k:v for k,v in result.items() if k!='text'},self_repair=True))
                print(json.dumps(dict(entry=entry['id'],repair='ready'),ensure_ascii=False),flush=True)
                return
            except Exception as exc:
                bench.write_json(status,dict(status='invalid',at=bench.now(),error=str(exc),self_repair=True))
                print(json.dumps(dict(entry=entry['id'],repair='invalid'),ensure_ascii=False),flush=True)
                return
        if result.get('http_status') in (400,401,403,404,422):
            break
    bench.write_json(status,dict(status='failed',at=bench.now(),error=result.get('error'),self_repair=True))

def watch(run_id):
    bench.initialize_credentials()
    submitted=set()
    futures={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        while True:
            data=c.load(run_id)
            for e in data['entries']:
                if e['status']=='invalid' and e['id'] not in submitted:
                    submitted.add(e['id'])
                    futures[e['id']]=pool.submit(repair,run_id,e)
            for eid,future in list(futures.items()):
                if future.done():
                    try:future.result()
                    except Exception as exc:
                        bench.write_json(c.path_for(run_id)/'entries'/eid/'repair.json',dict(status='failed',error=bench.sanitize(exc),at=bench.now()))
                    del futures[eid]
            if data['state'] in ('complete','complete_with_errors','cancelled') and not futures:
                print('REPAIR COMPLETE '+run_id,flush=True)
                return
            time.sleep(3)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('run_id');a=p.parse_args();watch(a.run_id)
