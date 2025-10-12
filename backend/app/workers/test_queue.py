from unittest.mock import MagicMock, patch

from app.workers.queue import get_queue, get_redis_connection


def test_get_queue_uses_cached_connection(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/1")
    from app.core.config import get_settings

    get_settings.cache_clear()
    get_redis_connection.cache_clear()
    with patch("app.workers.queue.Redis.from_url") as redis_from_url:
        redis_instance = MagicMock()
        redis_from_url.return_value = redis_instance
        queue_one = get_queue("default")
        queue_two = get_queue("critical")
    assert queue_one.connection is redis_instance
    assert queue_two.connection is redis_instance
    redis_from_url.assert_called_once_with("redis://localhost:6379/1")

