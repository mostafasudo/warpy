"""
User rate limiting service using Redis for counter tracking.

Implements daily and monthly rate limits per IP address per agent.
Uses Redis with automatic TTL for counter expiration.
"""
from datetime import date, datetime, UTC
from uuid import UUID

from redis import Redis
from redis.exceptions import RedisError

from ..core.logger import log_error, log_info


# TTL with buffer: 25 hours for daily, 32 days for monthly
DAILY_TTL_SECONDS = 25 * 60 * 60
MONTHLY_TTL_SECONDS = 32 * 24 * 60 * 60


def _get_daily_key(agent_id: UUID, ip_address: str) -> str:
    today = date.today().isoformat()
    return f"rate:{agent_id}:daily:{ip_address}:{today}"


def _get_monthly_key(agent_id: UUID, ip_address: str) -> str:
    month = date.today().strftime("%Y-%m")
    return f"rate:{agent_id}:monthly:{ip_address}:{month}"


def get_rate_limit_usage(
    redis_client: Redis | None,
    agent_id: UUID,
    ip_address: str,
) -> tuple[int, int]:
    """
    Get current usage counts for an IP.
    
    Returns:
        Tuple of (daily_usage, monthly_usage)
    """
    if not redis_client:
        return 0, 0
    
    try:
        daily_key = _get_daily_key(agent_id, ip_address)
        monthly_key = _get_monthly_key(agent_id, ip_address)
        
        daily_count = redis_client.get(daily_key)
        monthly_count = redis_client.get(monthly_key)
        
        return (
            int(daily_count) if daily_count else 0,
            int(monthly_count) if monthly_count else 0,
        )
    except RedisError as exc:
        log_error("UserRateLimitService", "get_rate_limit_usage", "Redis error", exc=exc)
        return 0, 0


def is_rate_limited(
    redis_client: Redis | None,
    agent_id: UUID,
    ip_address: str,
    daily_limit: int | None,
    monthly_limit: int | None,
) -> bool:
    """
    Check if an IP address has exceeded rate limits.
    
    Args:
        redis_client: Redis connection (if None, rate limiting is disabled)
        agent_id: The agent UUID
        ip_address: Client IP address
        daily_limit: Maximum daily actions (None = unlimited)
        monthly_limit: Maximum monthly actions (None = unlimited)
    
    Returns:
        True if rate limited, False if allowed
    """
    if not redis_client:
        return False
    
    if daily_limit is None and monthly_limit is None:
        return False
    
    daily_usage, monthly_usage = get_rate_limit_usage(redis_client, agent_id, ip_address)
    
    if daily_limit is not None and daily_usage >= daily_limit:
        log_info(
            "UserRateLimitService",
            "is_rate_limited",
            "Daily limit exceeded",
            agent_id=str(agent_id),
            ip=ip_address,
            usage=daily_usage,
            limit=daily_limit,
        )
        return True
    
    if monthly_limit is not None and monthly_usage >= monthly_limit:
        log_info(
            "UserRateLimitService",
            "is_rate_limited",
            "Monthly limit exceeded",
            agent_id=str(agent_id),
            ip=ip_address,
            usage=monthly_usage,
            limit=monthly_limit,
        )
        return True
    
    return False


def increment_rate_limit_usage(
    redis_client: Redis | None,
    agent_id: UUID,
    ip_address: str,
    count: int = 1,
) -> None:
    """
    Increment usage counters after successful actions.
    
    Args:
        redis_client: Redis connection
        agent_id: The agent UUID
        ip_address: Client IP address
        count: Number of actions to add
    """
    if not redis_client or count <= 0:
        return
    
    try:
        daily_key = _get_daily_key(agent_id, ip_address)
        monthly_key = _get_monthly_key(agent_id, ip_address)
        
        pipe = redis_client.pipeline()
        pipe.incrby(daily_key, count)
        pipe.expire(daily_key, DAILY_TTL_SECONDS)
        pipe.incrby(monthly_key, count)
        pipe.expire(monthly_key, MONTHLY_TTL_SECONDS)
        pipe.execute()
        
        log_info(
            "UserRateLimitService",
            "increment_rate_limit_usage",
            "Usage incremented",
            agent_id=str(agent_id),
            ip=ip_address,
            count=count,
        )
    except RedisError as exc:
        log_error("UserRateLimitService", "increment_rate_limit_usage", "Redis error", exc=exc)


def extract_client_ip(request: "Request") -> str:
    """
    Extract client IP address from request.
    
    Checks X-Forwarded-For header first (for proxied requests),
    then falls back to direct client host.
    
    Warning: X-Forwarded-For can be spoofed by clients. Only trust this
    header when running behind a trusted reverse proxy that sets it correctly.
    """
    from starlette.requests import Request as StarletteRequest
    if not isinstance(request, StarletteRequest):
        return "unknown"
    
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # X-Forwarded-For can contain multiple IPs; first is the original client
        return forwarded.split(",")[0].strip()
    
    if request.client and request.client.host:
        return request.client.host
    
    return "unknown"
