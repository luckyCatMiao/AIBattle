"""以继承的标准输入输出启动逐帧赛车策略。"""
import pathlib
import subprocess

if __name__ == "__main__":
    script = pathlib.Path(__file__).resolve().with_name("agent.js")
    raise SystemExit(subprocess.call(["node", str(script)]))
