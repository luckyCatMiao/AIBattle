"""Prepare missing SVG submissions off to the side; never change the live run."""
import concurrent.futures
import copy
import json
import hashlib
import sys
from pathlib import Path
import bench


def main(run_id, only_ids=None):
    live=bench.load_run(run_id)
    if only_ids and not only_ids <= {e['id'] for e in live['entries']}:raise ValueError('Unknown entry ID')
    human=bench.human_results(run_id)
    staging=bench.ROOT/'recovery-staging'
    entries=[copy.deepcopy(e) for e in live['entries'] if e['status']=='writer_failed' and not e.get('text')
             and (not only_ids or e['id'] in only_ids)
             and e.get('writer_error')=='Empty text response' and e['id'] not in human
             and not (staging/run_id/'entries'/e['id']/'recovery-result.json').exists()]
    bench.RUNS=staging
    data=copy.deepcopy(live)
    data['parameters'].update(writer_max_tokens=32768,writer_attempts_per_stage=1)
    bench.initialize_credentials()
    def prepare(entry):
        folder=bench.run_path(run_id)/'entries'/entry['id']
        entry['budget_recovery']={'new_cap':32768,'initial_cap':12000,'reason':'empty delivery at initial cap','staged':True,
            'prompt_sha256':live['prompt_sha256'],'system_sha256':hashlib.sha256(live['writer_system'].encode()).hexdigest()}
        bench.generate(data,entry)
        if entry['status']=='written':bench.judge(data,entry)
        bench.write_json(folder/'recovery-result.json',entry)
        print(json.dumps({'id':entry['id'],'status':entry['status'],'render':entry.get('render_status'),'scores':'sealed'},ensure_ascii=True),flush=True)
    print(json.dumps({'staging_empty_entries':len(entries),'cap':32768,'live_run_unchanged':True}),flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for f in concurrent.futures.as_completed([pool.submit(prepare,e) for e in entries]):f.result()


if __name__=='__main__':main(sys.argv[1],set(sys.argv[2:]) or None)
