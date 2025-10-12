from functools import lru_cache

from redis import Redis
from rq import Queue

from ..core.config import get_settings


@lru_cache
def get_redis_connection() -> Redis:
    settings = get_settings()
    return Redis.from_url(settings.redis_url)


def get_queue(name: str = "default") -> Queue:
    return Queue(name, connection=get_redis_connection())
