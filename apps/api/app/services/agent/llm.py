import json
from typing import Any

import httpx

from app.config import LlmConfig


def chat_completion(
    *,
    config: LlmConfig,
    max_tokens: int | None = None,
    messages: list[dict[str, str]],
    response_format: bool = True,
    temperature: float = 0.2,
) -> str | None:
    if not config.enabled or not config.api_key or not config.model:
        return None

    base_url = config.base_url.rstrip("/") or "https://api.openai.com/v1"
    url = f"{base_url}/chat/completions"

    try:
        payload: dict[str, Any] = {
            "messages": messages,
            "model": config.model,
            "temperature": temperature,
        }

        if response_format:
            payload["response_format"] = {"type": "json_object"}

        if config.provider == "deepseek" and not config.thinking_enabled:
            payload["thinking"] = {"type": "disabled"}

        if max_tokens:
            payload["max_tokens"] = max_tokens

        response = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=config.timeout_seconds,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return None

    data = response.json()
    choices = data.get("choices")

    if not isinstance(choices, list) or not choices:
        return None

    first_choice = choices[0]

    if not isinstance(first_choice, dict):
        return None

    message = first_choice.get("message")

    if not isinstance(message, dict):
        return None

    content = message.get("content")

    return content if isinstance(content, str) and content.strip() else None


def chat_completion_with_tools(
    *,
    config: LlmConfig,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    temperature: float = 0.2,
    tool_choice: str = "auto",
) -> dict[str, Any] | None:
    if not config.enabled or not config.api_key or not config.model:
        return None

    base_url = config.base_url.rstrip("/") or "https://api.openai.com/v1"
    url = f"{base_url}/chat/completions"

    payload: dict[str, Any] = {
        "messages": messages,
        "model": config.model,
        "temperature": temperature,
    }

    if tools:
        payload["tool_choice"] = tool_choice
        payload["tools"] = tools

    if config.provider == "deepseek" and not config.thinking_enabled:
        payload["thinking"] = {"type": "disabled"}

    try:
        response = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=config.timeout_seconds,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return None

    data = response.json()
    choices = data.get("choices")

    if not isinstance(choices, list) or not choices:
        return None

    first_choice = choices[0]

    if not isinstance(first_choice, dict):
        return None

    message = first_choice.get("message")

    return message if isinstance(message, dict) else None


def stream_chat_completion(
    *,
    config: LlmConfig,
    messages: list[dict[str, str]],
    temperature: float = 0.3,
):
    if not config.enabled or not config.api_key or not config.model:
        return

    base_url = config.base_url.rstrip("/") or "https://api.openai.com/v1"
    url = f"{base_url}/chat/completions"

    try:
        with httpx.stream(
            "POST",
            url,
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "messages": messages,
                "model": config.model,
                "stream": True,
                "temperature": temperature,
            },
            timeout=config.timeout_seconds,
        ) as response:
            response.raise_for_status()

            for line in response.iter_lines():
                if not line.startswith("data: "):
                    continue

                payload = line.removeprefix("data: ").strip()

                if payload == "[DONE]":
                    break

                parsed = parse_json_object(payload)

                if not parsed:
                    continue

                choices = parsed.get("choices")

                if not isinstance(choices, list) or not choices:
                    continue

                first_choice = choices[0]

                if not isinstance(first_choice, dict):
                    continue

                delta = first_choice.get("delta")

                if not isinstance(delta, dict):
                    continue

                content = delta.get("content")

                if isinstance(content, str) and content:
                    yield content
    except httpx.HTTPError:
        return


def parse_json_object(content: str | None) -> dict[str, Any] | None:
    if not content:
        return None

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(content[start : end + 1])
        except json.JSONDecodeError:
            return None

    return parsed if isinstance(parsed, dict) else None
