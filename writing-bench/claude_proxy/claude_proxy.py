"""
claude_proxy.py  v2.0
=====================
工作区共享工具：通过代理调用 Claude API

版本历史：
  v1.0  基础实现：call_claude / call_claude_json / ClaudeClient
  v2.0  参考官方 anthropic-sdk-python 重构：
          - ClaudeAPIError：统一异常类（含 status_code / error_body）
          - StreamResult：流式完成后的完整结果（usage / stop_reason / tool_inputs）
          - _iter_sse_events()：完整 SSE 解析（error / ping / 全部 delta 类型）
          - input_json_delta：流式工具输入 JSON 累积
          - thinking_delta：Extended Thinking 支持
          - ClaudeStream：官方 SDK 风格上下文管理器
          - 全部公开 API 向后兼容

依赖环境变量：
  ANTHROPIC_BASE_URL   代理地址（如 https://co.yes.vg/team）
  ANTHROPIC_AUTH_TOKEN 认证 token

依赖包：
  httpx（uv add httpx）

快速示例：
  from claude_proxy import call_claude, call_claude_stream, ClaudeStream

  # 单轮（含系统提示词）
  text = call_claude("你好", system="你是 PyHelper")

  # 流式
  for chunk in call_claude_stream("写首诗"):
      print(chunk, end="", flush=True)

  # 高级流式（获取 usage / stop_reason）
  with ClaudeStream("写首诗") as s:
      for chunk in s.text_stream:
          print(chunk, end="", flush=True)
  print(s.result.stop_reason, s.result.output_tokens)

  # 多轮
  from claude_proxy import call_claude_messages
  history = [{"role": "user", "content": "你好"}, ...]
  reply = call_claude_messages(history)

  # 工具调用
  from claude_proxy import call_claude_with_tools
  reply = call_claude_with_tools("现在几点？", tools, registry)

  # 自动维护历史
  from claude_proxy import ClaudeClient
  client = ClaudeClient()
  client.chat_multi_turn("我叫小明")
  reply = client.chat_multi_turn("你还记得我叫什么？")
"""

import json
import os
import re
import subprocess
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any

import httpx


# ── 异常 ───────────────────────────────────────────────────────────────

class ClaudeAPIError(RuntimeError):
    """
    Claude API 调用异常。

    属性：
      status_code  HTTP 状态码（非流式错误时填充，流式 error 事件时为 0）
      error_body   原始错误响应（dict 或 str）
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 0,
        error_body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_body = error_body

    def __repr__(self) -> str:
        return f"ClaudeAPIError({self.args[0]!r}, status_code={self.status_code})"


# ── 流式结果 ───────────────────────────────────────────────────────────

@dataclass
class StreamResult:
    """
    流式输出完成后的完整结果。

    字段：
      text          完整文本回复（各 text_delta 拼接）
      thinking      Extended Thinking 内容（各 thinking_delta 拼接）
      stop_reason   停止原因（"end_turn" / "tool_use" / "max_tokens" 等）
      input_tokens  输入 token 数
      output_tokens 输出 token 数
      tool_inputs   工具调用参数 {block_index: parsed_input_dict}
                    仅当流中含 input_json_delta 时填充
    """
    text: str = ""
    thinking: str = ""
    stop_reason: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    tool_inputs: dict[int, Any] = field(default_factory=dict)


# ── User-Agent 检测 ────────────────────────────────────────────────────

def _detect_claude_version() -> str:
    """从 `claude --version` 输出中提取版本号，失败时返回 fallback。"""
    try:
        out = subprocess.check_output(
            ["claude", "--version"], text=True, timeout=5,
            stderr=subprocess.DEVNULL,
        )
        m = re.search(r"(\d+\.\d+\.\d+)", out)
        if m:
            return m.group(1)
    except Exception:
        pass
    return "2.1.63"


_CLAUDE_VERSION = _detect_claude_version()
_USER_AGENT = f"claude-cli/{_CLAUDE_VERSION} (external, cli)"


# ── 内部工具函数 ───────────────────────────────────────────────────────

def _build_headers() -> dict[str, str]:
    """读取环境变量，构建请求头。"""
    base_url = os.environ.get("ANTHROPIC_BASE_URL", "").strip()
    token = os.environ.get("ANTHROPIC_AUTH_TOKEN", "").strip()
    if not base_url:
        raise EnvironmentError("环境变量 ANTHROPIC_BASE_URL 未设置")
    if not token:
        raise EnvironmentError("环境变量 ANTHROPIC_AUTH_TOKEN 未设置")
    return {
        "x-api-key": token,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "user-agent": _USER_AGENT,
    }


def _base_url() -> str:
    return os.environ["ANTHROPIC_BASE_URL"].rstrip("/")


def _build_payload(
    messages: list[dict],
    model: str,
    max_tokens: int,
    system: str,
    extra: dict | None = None,
) -> dict[str, Any]:
    """构建请求体（公共逻辑）。"""
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        payload["system"] = system
    if extra:
        payload.update(extra)
    return payload


def _check_response(r: httpx.Response) -> None:
    """
    检查响应，4xx/5xx 时先读取错误体，再解析并抛出 ClaudeAPIError。
    替代 r.raise_for_status()，提供更详细的错误信息。
    """
    if r.status_code < 400:
        return
    # Streaming HTTP failures have unread bodies. Reading only failed responses
    # preserves the successful SSE stream and retains the real HTTP error.
    r.read()
    try:
        body = r.json()
        err = body.get("error", body)
        msg = err.get("message", str(body)) if isinstance(err, dict) else str(err)
    except Exception:
        msg = r.text or f"HTTP {r.status_code}"
    raise ClaudeAPIError(msg, status_code=r.status_code, error_body=r.text)


def _iter_sse_events(resp: httpx.Response, *, deadline: float | None = None) -> Iterator[tuple[str, dict]]:
    """
    解析 SSE 流（参考官方 SDK _streaming.py 实现）。

    yield (event_name, data_dict) 元组。
    event_name 优先取 `event:` 行，回退到 data["type"]。

    处理规则：
      - `event: ping` / `type: ping`  → 跳过
      - `event: error` / `type: error` → 抛出 ClaudeAPIError
      - `data: [DONE]`                → 停止迭代
      - JSON 解析失败的行             → 静默跳过

    官方处理的全部事件类型：
      message_start, content_block_start, content_block_delta,
      content_block_stop, message_delta, message_stop,
      ping, error, completion（旧版）
    """
    current_event = ""
    for raw_line in resp.iter_lines():
        # Check before filtering keepalive pings, which otherwise conceal a
        # stalled request indefinitely while resetting the HTTP read timeout.
        if deadline is not None and time.monotonic() > deadline:
            raise TimeoutError('Request exceeded 600 seconds')
        line = raw_line.strip()
        if not line:
            current_event = ""
            continue

        if line.startswith("event:"):
            current_event = line[6:].strip()
            continue

        if line.startswith("data:"):
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                return
            if not data_str:
                continue
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                current_event = ""
                continue

            # event_name：优先用 event: 行，其次用 data["type"]
            event_name = current_event or data.get("type", "")
            current_event = ""

            # ping：官方行为是 continue
            if event_name == "ping" or data.get("type") == "ping":
                continue

            # error：解析并抛出 ClaudeAPIError
            if event_name == "error" or data.get("type") == "error":
                err = data.get("error", data)
                msg = (
                    err.get("message", str(data))
                    if isinstance(err, dict) else str(err)
                )
                raise ClaudeAPIError(msg, error_body=data)

            yield event_name, data


def _accumulate_sse(
    events: Iterator[tuple[str, dict]],
    result: StreamResult,
) -> Iterator[str]:
    """
    从 SSE 事件流中 yield 文本增量，同时填充 StreamResult。

    处理的 delta.type（参考官方 _messages.py accumulate_event）：
      text_delta       → yield 文本，追加 result.text
      thinking_delta   → 追加 result.thinking（不 yield）
      input_json_delta → 累积 partial JSON 到 json_bufs，content_block_stop 时解析
      signature_delta  → 忽略（Extended Thinking 签名）
      citations_delta  → 忽略（引用，暂不追踪）
    """
    json_bufs: dict[int, str] = {}  # block_index -> 累积的 partial_json

    for event_name, data in events:
        etype = data.get("type") or event_name

        # ── message_start：提取 input_tokens ──────────────────────────
        if etype == "message_start":
            usage = data.get("message", {}).get("usage", {})
            result.input_tokens = usage.get("input_tokens", 0)

        # ── content_block_delta：核心增量处理 ─────────────────────────
        elif etype == "content_block_delta":
            idx = data.get("index", 0)
            delta = data.get("delta", {})
            dtype = delta.get("type", "")

            if dtype == "text_delta":
                text = delta.get("text", "")
                result.text += text
                yield text

            elif dtype == "thinking_delta":
                result.thinking += delta.get("thinking", "")

            elif dtype == "input_json_delta":
                # 官方实现：累积 bytes，每次增量到来即尝试 partial 解析
                # 简化版：只累积字符串，在 content_block_stop 时一次性解析
                json_bufs[idx] = json_bufs.get(idx, "") + delta.get("partial_json", "")

            # signature_delta / citations_delta：当前版本忽略

        # ── content_block_stop：解析完整工具 input ────────────────────
        elif etype == "content_block_stop":
            idx = data.get("index", 0)
            buf = json_bufs.pop(idx, "")
            if buf:
                try:
                    result.tool_inputs[idx] = json.loads(buf)
                except json.JSONDecodeError:
                    result.tool_inputs[idx] = buf  # 保留原始字符串

        # ── message_delta：stop_reason + output_tokens ────────────────
        elif etype == "message_delta":
            delta = data.get("delta", {})
            result.stop_reason = delta.get("stop_reason", "")
            usage = data.get("usage", {})
            result.output_tokens = usage.get("output_tokens", 0)


# ── ClaudeStream：官方 SDK 风格上下文管理器 ────────────────────────────

class ClaudeStream:
    """
    官方 SDK 风格的流式上下文管理器（参考 anthropic-sdk-python stream 接口）。

    用法：
      # 单轮
      with ClaudeStream("写首诗") as s:
          for chunk in s.text_stream:
              print(chunk, end="", flush=True)
      print()
      print(f"stop_reason={s.result.stop_reason}, tokens={s.result.output_tokens}")

      # 多轮
      with ClaudeStream(messages=[...]) as s:
          for chunk in s.text_stream:
              ...

      # 含工具定义（流式查看 Claude 响应，工具 input 会在 result.tool_inputs 中）
      with ClaudeStream("现在几点？", tools=tools) as s:
          for chunk in s.text_stream:
              print(chunk, end="", flush=True)
      if s.result.stop_reason == "tool_use":
          print("工具参数:", s.result.tool_inputs)

    属性：
      result  StreamResult，流结束后可读取完整结果
    """

    def __init__(
        self,
        prompt: str = "",
        *,
        messages: list[dict] | None = None,
        model: str = "claude-sonnet-4-6",
        max_tokens: int = 1024,
        system: str = "",
        timeout: int = 60,
        tools: list[dict] | None = None,
    ) -> None:
        if messages is not None:
            msgs = messages
        elif prompt:
            msgs = [{"role": "user", "content": prompt}]
        else:
            raise ValueError("必须提供 prompt 或 messages 之一")

        extra: dict[str, Any] = {"stream": True}
        if tools:
            extra["tools"] = tools

        self._payload = _build_payload(msgs, model, max_tokens, system, extra)
        self._timeout = timeout
        self._resp_ctx: Any = None
        self._resp: httpx.Response | None = None
        self.result = StreamResult()

    def __enter__(self) -> "ClaudeStream":
        self._resp_ctx = httpx.stream(
            "POST",
            f"{_base_url()}/v1/messages",
            json=self._payload,
            headers=_build_headers(),
            timeout=self._timeout,
        )
        self._resp = self._resp_ctx.__enter__()
        _check_response(self._resp)
        return self

    def __exit__(self, *args: Any) -> None:
        if self._resp_ctx is not None:
            self._resp_ctx.__exit__(*args)

    @property
    def text_stream(self) -> Iterator[str]:
        """
        逐 chunk yield 文本增量，同时在后台填充 self.result。

        消费完整个迭代器后，self.result 包含完整的元数据。
        """
        if self._resp is None:
            raise RuntimeError("必须在 with 块内使用 text_stream")
        yield from _accumulate_sse(_iter_sse_events(self._resp), self.result)


# ── 1. 单轮调用（含系统提示词）─────────────────────────────────────────

def call_claude(
    prompt: str,
    *,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 1024,
    system: str = "",
    timeout: int = 30,
) -> str:
    """
    单轮调用：发送一条用户消息，返回 Claude 的文本回复。

    参数：
      prompt     用户消息内容
      model      模型 ID
      max_tokens 最大输出 token 数
      system     系统提示词（可选）
      timeout    请求超时秒数

    抛出：
      ClaudeAPIError  API 返回 4xx/5xx 时
      EnvironmentError  环境变量未设置时
    """
    payload = _build_payload(
        [{"role": "user", "content": prompt}],
        model, max_tokens, system,
    )
    r = httpx.post(
        f"{_base_url()}/v1/messages",
        json=payload,
        headers=_build_headers(),
        timeout=timeout,
    )
    _check_response(r)
    return r.json()["content"][0]["text"]


def call_claude_json(
    prompt: str,
    *,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 1024,
    system: str = "",
    timeout: int = 30,
) -> Any:
    """
    单轮调用，将回复解析为 JSON。

    Claude 返回内容须为合法 JSON（提示词中应明确要求）。
    若解析失败，尝试从文本中提取第一个 {...} 或 [...] 块。

    抛出：
      ClaudeAPIError  API 错误
      ValueError      无法解析为 JSON
    """
    raw = call_claude(prompt, model=model, max_tokens=max_tokens,
                      system=system, timeout=timeout)
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        m = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", raw)
        if m:
            return json.loads(m.group(1))
        raise ValueError(f"Claude 返回内容无法解析为 JSON：\n{raw}")


# ── 2. 多轮对话 ────────────────────────────────────────────────────────

def call_claude_messages(
    messages: list[dict],
    *,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 1024,
    system: str = "",
    timeout: int = 30,
) -> str:
    """
    多轮对话：接受完整 messages 列表，返回 Claude 文本回复。

    messages 格式：
      [
          {"role": "user",      "content": "第一轮问题"},
          {"role": "assistant", "content": "第一轮回复"},
          {"role": "user",      "content": "第二轮问题"},
      ]

    抛出：
      ClaudeAPIError  API 错误
    """
    payload = _build_payload(messages, model, max_tokens, system)
    r = httpx.post(
        f"{_base_url()}/v1/messages",
        json=payload,
        headers=_build_headers(),
        timeout=timeout,
    )
    _check_response(r)
    return r.json()["content"][0]["text"]


# ── 3. 流式输出 ────────────────────────────────────────────────────────

def call_claude_stream(
    prompt: str,
    *,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 1024,
    system: str = "",
    timeout: int = 60,
) -> Iterator[str]:
    """
    单轮流式输出：逐 chunk yield 文本增量。

    内部使用完整的 SSE 解析器（_iter_sse_events）：
      - error 事件 → ClaudeAPIError
      - ping 事件  → 跳过
      - thinking_delta → 跳过（不 yield）

    用法：
      for chunk in call_claude_stream("写首诗"):
          print(chunk, end="", flush=True)
      print()

    若需要 stop_reason / usage，改用 ClaudeStream：
      with ClaudeStream("写首诗") as s:
          for chunk in s.text_stream:
              print(chunk, end="", flush=True)
      print(s.result.stop_reason)
    """
    with ClaudeStream(prompt, model=model, max_tokens=max_tokens,
                      system=system, timeout=timeout) as s:
        yield from s.text_stream


def call_claude_stream_messages(
    messages: list[dict],
    *,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 1024,
    system: str = "",
    timeout: int = 60,
) -> Iterator[str]:
    """
    多轮流式输出：接受完整 messages 列表，流式 yield 回复。

    用法：
      for chunk in call_claude_stream_messages(history):
          print(chunk, end="", flush=True)
    """
    with ClaudeStream(messages=messages, model=model, max_tokens=max_tokens,
                      system=system, timeout=timeout) as s:
        yield from s.text_stream


# ── 4. 工具调用 ────────────────────────────────────────────────────────

def call_claude_with_tools(
    prompt: str,
    tools: list[dict],
    tool_registry: dict[str, Callable[[dict], Any]],
    *,
    model: str = "claude-sonnet-4-6",
    max_tokens: int = 1024,
    system: str = "",
    timeout: int = 30,
    max_rounds: int = 10,
) -> str:
    """
    工具调用：Claude 自动决定调用哪些工具，本函数自动执行并返回最终文本回复。

    参数：
      tools          工具定义列表（Anthropic tools 格式）
      tool_registry  工具名 → callable 的映射；callable 接受 input dict，返回任意值
      max_rounds     最大工具调用轮次（防止无限循环），默认 10
      其余参数同 call_claude()

    tools 格式示例：
      [{
          "name": "get_weather",
          "description": "获取城市天气",
          "input_schema": {
              "type": "object",
              "properties": {"city": {"type": "string"}},
              "required": ["city"],
          },
      }]

    tool_registry 示例：
      {"get_weather": lambda inp: f"{inp['city']} 晴，25°C"}

    工作流程（官方 tool use loop 模式）：
      1. 发送请求（含 tools 定义）
      2. 若 stop_reason == "tool_use"：
           a. 提取所有 tool_use content block
           b. 调用 tool_registry 中对应函数，捕获异常
           c. 构造 tool_result，追加为 user 消息
           d. 继续下一轮
      3. stop_reason == "end_turn" → 返回最终文本

    抛出：
      ClaudeAPIError  API 错误
      RuntimeError    超过最大轮次
    """
    messages: list[dict] = [{"role": "user", "content": prompt}]

    for _ in range(max_rounds):
        payload = _build_payload(
            messages, model, max_tokens, system,
            extra={"tools": tools},
        )
        r = httpx.post(
            f"{_base_url()}/v1/messages",
            json=payload,
            headers=_build_headers(),
            timeout=timeout,
        )
        _check_response(r)
        resp_body = r.json()

        stop_reason = resp_body.get("stop_reason", "")
        content_blocks = resp_body.get("content", [])

        # 把本轮 assistant 回复加入历史
        messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "end_turn":
            for block in content_blocks:
                if block.get("type") == "text":
                    return block["text"]
            return ""

        if stop_reason == "tool_use":
            tool_results = []
            for block in content_blocks:
                if block.get("type") != "tool_use":
                    continue
                tool_name = block["name"]
                tool_input = block.get("input", {})
                tool_use_id = block["id"]

                if tool_name in tool_registry:
                    try:
                        result_str = str(tool_registry[tool_name](tool_input))
                    except Exception as e:
                        result_str = f"工具执行错误: {e}"
                else:
                    result_str = f"未找到工具: {tool_name}"

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": result_str,
                })

            messages.append({"role": "user", "content": tool_results})

        else:
            # 未知 stop_reason，直接返回文本
            for block in content_blocks:
                if block.get("type") == "text":
                    return block["text"]
            return ""

    raise RuntimeError(f"工具调用超过最大轮次 {max_rounds}")


# ── ClaudeClient：复用连接、固定模型、自动历史管理 ───────────────────

class ClaudeClient:
    """
    Claude 客户端类。

    特性：
      chat()                单轮调用（含系统提示词）
      chat_json()           单轮调用，返回 JSON
      chat_multi_turn()     自动维护多轮对话历史
      chat_stream()         流式单轮输出
      chat_stream_multi_turn()  多轮 + 流式
      chat_with_tools()     工具调用（自动执行循环）
      reset_history()       清空对话历史

    用法：
      client = ClaudeClient()
      client.chat_multi_turn("我叫小明")
      reply = client.chat_multi_turn("你还记得我叫什么？")

      for chunk in client.chat_stream("写首诗"):
          print(chunk, end="", flush=True)

      with client.stream("解释一下量子纠缠") as s:
          for chunk in s.text_stream:
              print(chunk, end="", flush=True)
      print(s.result.output_tokens)
    """

    def __init__(
        self,
        model: str = "claude-sonnet-4-6",
        max_tokens: int = 1024,
        timeout: int = 30,
    ) -> None:
        self.model = model
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.history: list[dict] = []

    # ── 单轮 ──────────────────────────────────────────────────────────

    def chat(self, prompt: str, *, system: str = "") -> str:
        """单轮调用，返回文本。不影响 history。"""
        return call_claude(
            prompt,
            model=self.model, max_tokens=self.max_tokens,
            system=system, timeout=self.timeout,
        )

    def chat_json(self, prompt: str, *, system: str = "") -> Any:
        """单轮调用，返回解析后的 JSON 对象。不影响 history。"""
        return call_claude_json(
            prompt,
            model=self.model, max_tokens=self.max_tokens,
            system=system, timeout=self.timeout,
        )

    # ── 多轮 ──────────────────────────────────────────────────────────

    def chat_multi_turn(self, prompt: str, *, system: str = "") -> str:
        """
        多轮对话：自动在 history 中维护上下文。
        每次调用将用户消息和 Claude 回复追加到 self.history。
        """
        self.history.append({"role": "user", "content": prompt})
        reply = call_claude_messages(
            self.history,
            model=self.model, max_tokens=self.max_tokens,
            system=system, timeout=self.timeout,
        )
        self.history.append({"role": "assistant", "content": reply})
        return reply

    def reset_history(self) -> None:
        """清空对话历史，开始新会话。"""
        self.history = []

    # ── 流式 ──────────────────────────────────────────────────────────

    def chat_stream(self, prompt: str, *, system: str = "") -> Iterator[str]:
        """
        流式单轮输出。不影响 history。

        用法：
          for chunk in client.chat_stream("写首诗"):
              print(chunk, end="", flush=True)
          print()
        """
        return call_claude_stream(
            prompt,
            model=self.model, max_tokens=self.max_tokens,
            system=system, timeout=max(self.timeout, 60),
        )

    def chat_stream_multi_turn(self, prompt: str, *, system: str = "") -> Iterator[str]:
        """
        多轮 + 流式：自动维护历史，同时流式 yield 回复。

        注意：assistant 消息在整个流收完后追加到 history。
        """
        self.history.append({"role": "user", "content": prompt})
        chunks: list[str] = []
        for chunk in call_claude_stream_messages(
            self.history,
            model=self.model, max_tokens=self.max_tokens,
            system=system, timeout=max(self.timeout, 60),
        ):
            chunks.append(chunk)
            yield chunk
        self.history.append({"role": "assistant", "content": "".join(chunks)})

    def stream(
        self,
        prompt: str,
        *,
        system: str = "",
        tools: list[dict] | None = None,
    ) -> "ClaudeStream":
        """
        返回 ClaudeStream 上下文管理器（高级流式接口）。

        用法：
          with client.stream("写首诗") as s:
              for chunk in s.text_stream:
                  print(chunk, end="", flush=True)
          print(s.result.stop_reason, s.result.output_tokens)
        """
        return ClaudeStream(
            prompt,
            model=self.model, max_tokens=self.max_tokens,
            system=system, timeout=max(self.timeout, 60),
            tools=tools,
        )

    # ── 工具调用 ──────────────────────────────────────────────────────

    def chat_with_tools(
        self,
        prompt: str,
        tools: list[dict],
        tool_registry: dict[str, Callable[[dict], Any]],
        *,
        system: str = "",
    ) -> str:
        """工具调用（自动执行循环），返回最终文本。不影响 history。"""
        return call_claude_with_tools(
            prompt, tools, tool_registry,
            model=self.model, max_tokens=self.max_tokens,
            system=system, timeout=self.timeout,
        )

    # ── 资源管理 ──────────────────────────────────────────────────────

    def close(self) -> None:
        pass  # httpx 函数式调用无需手动关闭

    def __enter__(self) -> "ClaudeClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()
