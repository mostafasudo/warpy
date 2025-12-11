import json
import time
from dataclasses import dataclass
from uuid import UUID

from redis import Redis
from redis.exceptions import RedisError

from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info


@dataclass
class CachedTool:
    endpoint_id: UUID
    last_used: float


class ToolCache:
    KEY_PREFIX = "tool_cache:"

    def __init__(self, redis: Redis | None, conversation_id: UUID):
        self._redis = redis
        self._conversation_id = conversation_id
        self._key = f"{self.KEY_PREFIX}{conversation_id}"
        self._tools: dict[UUID, float] = {}

    def _load_from_redis(self) -> None:
        if not self._redis:
            return
        try:
            data = self._redis.get(self._key)
            if data:
                parsed = json.loads(data)
                self._tools = {UUID(k): v for k, v in parsed.items()}
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
        return [CachedTool(endpoint_id=k, last_used=v) for k, v in self._tools.items()]

    def save(self) -> None:
        self._save_to_redis()

    def get_endpoint_ids(self) -> list[UUID]:
        return list(self._tools.keys())

    def update_used(self, endpoint_ids: list[UUID]) -> None:
        now = time.time()
        for eid in endpoint_ids:
            if eid in self._tools:
                self._tools[eid] = now

    def add_tools(self, endpoint_ids: list[UUID]) -> None:
        now = time.time()
        for eid in endpoint_ids:
            if eid not in self._tools:
                self._tools[eid] = now

    def remove_invalid(self, valid_ids: set[UUID]) -> None:
        to_remove = [eid for eid in self._tools if eid not in valid_ids]
        for eid in to_remove:
            del self._tools[eid]
        if to_remove:
            log_info(
                "ToolCache",
                "remove_invalid",
                f"Removed {len(to_remove)} invalid endpoints"
            )

    def enforce_cap(self, max_tools: int) -> None:
        if len(self._tools) <= max_tools:
            return
        sorted_items = sorted(self._tools.items(), key=lambda x: x[1])
        evict_count = len(self._tools) - max_tools
        for eid, _ in sorted_items[:evict_count]:
            del self._tools[eid]
        log_info("ToolCache", "enforce_cap", f"Evicted {evict_count} tools via LRU")

    def clear(self) -> None:
        self._tools = {}
        if self._redis:
            try:
                self._redis.delete(self._key)
            except RedisError as exc:
                log_error("ToolCache", "clear", "Failed to clear cache", exc=exc)
