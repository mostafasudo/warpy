import json
import time
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from redis.exceptions import RedisError

from app.services.tool_cache import CachedTool, ToolCache


def test_tool_cache_load_save_roundtrip():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    eid1 = uuid4()
    eid2 = uuid4()
    cache.add_tools([eid1, eid2])
    cache.save()

    call_args = redis.setex.call_args
    assert call_args is not None
    saved_data = json.loads(call_args[0][2])
    assert str(eid1) in saved_data
    assert str(eid2) in saved_data


def test_tool_cache_load_from_redis():
    redis = MagicMock()
    conv_id = uuid4()
    eid = uuid4()
    redis.get.return_value = json.dumps({str(eid): 1000.0})

    cache = ToolCache(redis, conv_id)
    tools = cache.load()

    assert len(tools) == 1
    assert tools[0].endpoint_id == eid
    assert tools[0].last_used == 1000.0


def test_tool_cache_lru_eviction():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    old_id = uuid4()
    mid_id = uuid4()
    new_id = uuid4()

    cache._tools = {
        old_id: 100.0,
        mid_id: 200.0,
        new_id: 300.0
    }

    cache.enforce_cap(2)

    assert old_id not in cache._tools
    assert mid_id in cache._tools
    assert new_id in cache._tools


def test_tool_cache_cap_enforcement():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    ids = [uuid4() for _ in range(30)]
    for i, eid in enumerate(ids):
        cache._tools[eid] = float(i)

    cache.enforce_cap(24)

    assert len(cache._tools) == 24
    for eid in ids[:6]:
        assert eid not in cache._tools
    for eid in ids[6:]:
        assert eid in cache._tools


def test_tool_cache_remove_invalid():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    valid_id = uuid4()
    invalid_id = uuid4()
    cache._tools = {valid_id: 100.0, invalid_id: 200.0}

    cache.remove_invalid({valid_id})

    assert valid_id in cache._tools
    assert invalid_id not in cache._tools


def test_tool_cache_update_used():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    eid = uuid4()
    cache._tools = {eid: 100.0}

    before = time.time()
    cache.update_used([eid])
    after = time.time()

    assert before <= cache._tools[eid] <= after


def test_tool_cache_add_tools():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    eid1 = uuid4()
    eid2 = uuid4()
    cache._tools = {eid1: 100.0}

    cache.add_tools([eid1, eid2])

    assert eid1 in cache._tools
    assert eid2 in cache._tools
    assert cache._tools[eid1] == 100.0


def test_tool_cache_redis_unavailable_load():
    redis = MagicMock()
    redis.get.side_effect = RedisError("Connection failed")
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    tools = cache.load()

    assert tools == []


def test_tool_cache_redis_unavailable_save():
    redis = MagicMock()
    redis.setex.side_effect = RedisError("Connection failed")
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    cache.add_tools([uuid4()])
    cache.save()


def test_tool_cache_no_redis():
    conv_id = uuid4()
    cache = ToolCache(None, conv_id)

    cache.add_tools([uuid4()])
    tools = cache.load()
    cache.save()

    assert len(cache.get_endpoint_ids()) == 1


def test_tool_cache_clear():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    cache._tools = {uuid4(): 100.0}
    cache.clear()

    assert len(cache._tools) == 0
    redis.delete.assert_called_once()


def test_tool_cache_clear_redis_error():
    redis = MagicMock()
    redis.delete.side_effect = RedisError("fail")
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    cache._tools = {uuid4(): 100.0}
    cache.clear()

    assert len(cache._tools) == 0


def test_tool_cache_get_endpoint_ids():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    eid1 = uuid4()
    eid2 = uuid4()
    cache._tools = {eid1: 100.0, eid2: 200.0}

    ids = cache.get_endpoint_ids()

    assert set(ids) == {eid1, eid2}


def test_tool_cache_invalid_json():
    redis = MagicMock()
    redis.get.return_value = "not-valid-json"
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    tools = cache.load()

    assert tools == []


def test_tool_cache_enforce_cap_no_eviction_needed():
    redis = MagicMock()
    conv_id = uuid4()
    cache = ToolCache(redis, conv_id)

    eid = uuid4()
    cache._tools = {eid: 100.0}

    cache.enforce_cap(10)

    assert eid in cache._tools


