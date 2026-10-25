#!/usr/bin/env python3
"""基线对手：每窗口随机方向 + 小概率放弹。"""
import sys, json, random

def main():
    rnd = random.Random(12345)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            print(json.dumps({"inputs": [{"dir": "N", "btn": None}] * 20}), flush=True)
            continue
        if obs.get('status') != 'playing':
            print(json.dumps({"inputs": [{"dir": "N", "btn": None}] * 20}), flush=True)
            continue
        d = rnd.choice(['N', 'U', 'D', 'L', 'R'])
        frames = []
        for i in range(20):
            if i % 7 == 0:
                d = rnd.choice(['N', 'U', 'D', 'L', 'R'])
            btn = 'BOMB' if (i == 3 and rnd.random() < 0.5) else None
            frames.append({"dir": d, "btn": btn})
        print(json.dumps({"inputs": frames}), flush=True)

if __name__ == '__main__':
    main()
