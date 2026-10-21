import sys, json
import soccer_test as T

def main():
    kind = sys.argv[1] if len(sys.argv) > 1 else 'motion'
    if kind == 'simple':
        bot = T.SimpleBot()
    else:
        bot = T.MotionBot()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            win = bot.plan(obs)
            out = json.dumps(win, separators=(',', ':'))
        except Exception as e:
            print('BOT ERR: %r' % (e,), file=sys.stderr)
            out = json.dumps({'inputs': [[{'dir': 'N', 'aim': None, 'kick': False}] * 3 for _ in range(20)]})
        sys.stdout.write(out + '\n')
        sys.stdout.flush()

if __name__ == '__main__':
    main()
