import hashlib
import secrets
import time
from uuid import UUID

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError

WIDGET_JWT_TTL_SECONDS = 60 * 5


class WidgetJwtError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def generate_widget_api_key() -> tuple[str, str]:
    secret_part = secrets.token_hex(24)
    last4 = f"{secrets.randbelow(10_000):04d}"
    return f"wgt_{secret_part}{last4}", last4


def hash_widget_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def mint_widget_jwt(*, agent_id: UUID, user_id: str, secret: str, ttl_seconds: int = WIDGET_JWT_TTL_SECONDS) -> str:
    now = int(time.time())
    payload = {
        "typ": "widget",
        "agentId": str(agent_id),
        "userId": user_id,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_widget_jwt(*, token: str, expected_agent_id: UUID, secret: str) -> None:
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp"]})
    except ExpiredSignatureError as exc:
        raise WidgetJwtError(code="WIDGET_AUTH_INVALID", message="Token expired") from exc
    except InvalidTokenError as exc:
        raise WidgetJwtError(code="WIDGET_AUTH_INVALID", message="Invalid token") from exc
    if payload.get("typ") != "widget":
        raise WidgetJwtError(code="WIDGET_AUTH_INVALID", message="Invalid token type")
    if payload.get("agentId") != str(expected_agent_id):
        raise WidgetJwtError(code="WIDGET_AUTH_INVALID", message="Token agent mismatch")
