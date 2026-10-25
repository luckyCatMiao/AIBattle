"""黑盒练习赛：用你自己的 agent.py 对冻结对手打 N 局。

用法：
    python practice.py --games 10
    python practice.py --games 20 --seed-base 9500

每局交替座位、人数 1-6 轮换；结束时打印总胜率与回放目录。

规则：不要打开对手目录里的任何文件，只能通过这个脚本与它对局。
"""
import pathlib, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
TRAIN = pathlib.Path('D:\\extraProj\\AIBattle\\soccer\\arena\\train.py')
OPPONENT = pathlib.Path('D:\\extraProj\\AIBattle\\soccer\\arena\\control\\run-20261022-200519\\round-2\\sol')

cmd = [sys.executable, str(TRAIN), "--practice", "--no-isolation",
       "--players", "deepseek-g1", "sol",
       "--practice-player", "deepseek-g1",
       "--practice-workspace", str(HERE),
       "--opponent", str(OPPONENT)] + sys.argv[1:]
raise SystemExit(subprocess.run(cmd).returncode)
