import os
from dataclasses import dataclass
from pathlib import Path


def load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[3] / ".env"

    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file()


@dataclass(frozen=True)
class LlmConfig:
    api_key: str
    base_url: str
    enabled: bool
    model: str
    provider: str
    thinking_enabled: bool
    timeout_seconds: int


def get_bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name)

    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_int_env(name: str, default: int) -> int:
    value = os.environ.get(name)

    if value is None:
        return default

    try:
        return int(value)
    except ValueError:
        return default


def get_llm_config() -> LlmConfig:
    provider = os.environ.get("BI_AGENT_LLM_PROVIDER", "openai").strip() or "openai"
    model = os.environ.get("BI_AGENT_LLM_MODEL", "").strip()
    api_key = os.environ.get("BI_AGENT_LLM_API_KEY", "").strip()
    base_url = os.environ.get("BI_AGENT_LLM_BASE_URL", "").strip()
    enabled = get_bool_env("BI_AGENT_LLM_ENABLED", bool(api_key and model))
    thinking_enabled = get_bool_env("BI_AGENT_LLM_THINKING_ENABLED", False)

    return LlmConfig(
        api_key=api_key,
        base_url=base_url,
        enabled=enabled,
        model=model,
        provider=provider,
        thinking_enabled=thinking_enabled,
        timeout_seconds=get_int_env("BI_AGENT_LLM_TIMEOUT_SECONDS", 30),
    )
