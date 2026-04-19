import json
import time
from dataclasses import dataclass
from uuid import UUID

from redis import Redis
from redis.exceptions import RedisError

from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from .mcp_runtime import make_db_tool_ref


@dataclass
class CachedTool:
    tool_id: str
    last_used: float


class ToolCache:
    KEY_PREFIX = "tool_cache:"

    def __init__(self, redis: Redis | None, conversation_id: UUID):
        self._redis = redis
        self._conversation_id = conversation_id
        self._key = f"{self.KEY_PREFIX}{conversation_id}"
        self._tools: dict[str, float] = {}

    def _load_from_redis(self) -> None:
        if not self._redis:
            return
        try:
            data = self._redis.get(self._key)
            if data:
                parsed = json.loads(data)
                self._tools = {str(k): float(v) for k, v in parsed.items()}
        except (RedisError, json.JSONDecodeError) as exc:
            log_error("ToolCache", "_load_from_redis", "Failed to load cache", exc=exc)
            self._tools = {}

    def _save_to_redis(self) -> None:
        if not self._redis:
            return
        try:
            data = {str(k): v for k, v in self._tools.items()}
            self._redis.setex(self._key, llm_config.tool_cache_ttl, json.dumps(data))
        except RedisError as exc:
            log_error("ToolCache", "_save_to_redis", "Failed to save cache", exc=exc)

    def load(self) -> list[CachedTool]:
        self._load_from_redis()
        return [CachedTool(tool_id=k, last_used=v) for k, v in self._tools.items()]

    def save(self) -> None:
        self._save_to_redis()

    def get_tool_ids(self) -> list[str]:
        return list(self._tools.keys())

    def update_used(self, tool_ids: list[str]) -> None:
        now = time.time()
        for tool_id in tool_ids:
            normalized = str(tool_id)
            if normalized in self._tools:
                self._tools[normalized] = now

    def add_tools(self, tool_ids: list[str]) -> None:
        now = time.time()
        for tool_id in tool_ids:
            normalized = str(tool_id)
            if normalized not in self._tools:
                self._tools[normalized] = now

    def remove_invalid(self, valid_ids: set[str]) -> None:
        normalized_valid_ids: set[str] = set()
        for tool_id in valid_ids:
            normalized_valid_ids.add(str(tool_id))
            if isinstance(tool_id, UUID):
                normalized_valid_ids.add(make_db_tool_ref(tool_id))
        to_remove = [tool_id for tool_id in self._tools if tool_id not in normalized_valid_ids]
        for tool_id in to_remove:
            del self._tools[tool_id]
        if to_remove:
            log_info(
                "ToolCache",
                "remove_invalid",
                f"Removed {len(to_remove)} invalid tools"
            )

    def enforce_cap(self, max_tools: int) -> None:
        if len(self._tools) <= max_tools:
            return
        sorted_items = sorted(self._tools.items(), key=lambda x: x[1])
        evict_count = len(self._tools) - max_tools
        for tool_id, _ in sorted_items[:evict_count]:
            del self._tools[tool_id]
        log_info("ToolCache", "enforce_cap", f"Evicted {evict_count} tools via LRU")

    def clear(self) -> None:
        self._tools = {}
        if self._redis:
            try:
                self._redis.delete(self._key)
            except RedisError as exc:
                log_error("ToolCache", "clear", "Failed to clear cache", exc=exc)
