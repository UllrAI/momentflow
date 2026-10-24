"""Owner-scoped OpenRouter configuration and bounded JSON/vision requests."""

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_MODEL = "openai/gpt-6-luna"
MODELS = [DEFAULT_MODEL, "openai/gpt-6-luna-pro", "openai/gpt-5.6-luna", "openai/gpt-5.6-luna-pro"]
BASE_URL = "https://openrouter.ai/api/v1"


def config_path(store, owner):
    if not re.fullmatch(r"[a-f0-9]{32}", owner):
        raise ValueError("Invalid owner")
    return store.root / f"model-{owner}.json"


def load_config(store, owner):
    path = config_path(store, owner)
    return (
        json.loads(path.read_text()) if path.exists() else {"model": DEFAULT_MODEL, "api_key": ""}
    )


def public_config(config):
    return {
        "provider": "OpenRouter",
        "base_url": BASE_URL,
        "model": config["model"],
        "configured": bool(config.get("api_key")),
        "models": MODELS,
    }


def save_config(store, owner, model, api_key=None):
    if model not in MODELS:
        raise ValueError("请选择已支持图片输入的 Luna 模型。")
    with store.lock:
        current = load_config(store, owner)
        key = current.get("api_key", "") if api_key is None else api_key.strip()
        if key and (len(key) > 512 or not key.isascii() or any(c.isspace() for c in key)):
            raise ValueError("API Key 格式无效。")
        config = {"model": model, "api_key": key}
        path = config_path(store, owner)
        temp = Path(str(path) + ".tmp")
        descriptor = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as output:
            json.dump(config, output)
        temp.replace(path)
        return public_config(config)


def complete(config, messages, schema, max_tokens=5000):
    if not config.get("api_key"):
        raise ValueError("请先在设置中保存 OpenRouter API Key。")
    payload = {
        "model": config["model"],
        "messages": messages,
        "max_tokens": max_tokens,
        "reasoning": {"effort": "low"},
        "provider": {"require_parameters": True, "data_collection": "deny"},
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "momentflow", "strict": True, "schema": schema},
        },
    }
    request = urllib.request.Request(
        BASE_URL + "/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + config["api_key"],
            "Content-Type": "application/json",
            "X-Title": "MomentFlow Local",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("模型响应过大，请减少候选片段。")
        result = json.loads(raw)
    except urllib.error.HTTPError as error:
        # Do not persist provider response bodies, prompts or credentials in job errors.
        messages = {401: "API Key 无效", 402: "账户额度不足", 429: "请求频率受限"}
        raise ValueError(
            f"OpenRouter：{messages.get(error.code, '服务请求失败')}（{error.code}）。"
        ) from None
    except (OSError, TimeoutError):
        raise ValueError("OpenRouter 连接失败或超时；请重试，原有结果未改变。") from None
    try:
        choice = result["choices"][0]
        if choice.get("finish_reason") != "stop":
            raise ValueError()
        content = json.loads(choice["message"]["content"])
        if not isinstance(content, dict):
            raise ValueError()
        usage = result.get("usage", {})
        usage = {
            k: usage[k]
            for k in ("prompt_tokens", "completion_tokens", "total_tokens")
            if k in usage
        }
        return content, usage
    except (KeyError, IndexError, TypeError, ValueError):
        raise ValueError("模型未返回完整的结构化结果，未应用任何更改。") from None
