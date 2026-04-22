import base64
import hashlib
import secrets
from datetime import UTC, datetime
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.logger import log_info
from ..models import UserApiKey

API_KEY_PREFIX = "wrk_"


def _insert_factory(session: Session):
    dialect = getattr(getattr(session, "bind", None), "dialect", None)
    if dialect and dialect.name == "postgresql":
        return pg_insert
    return sqlite_insert


def generate_api_key() -> tuple[str, str]:
    api_key = f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"
    return api_key, api_key[-4:]


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def is_warpy_api_key(token: str) -> bool:
    return token.startswith(API_KEY_PREFIX)


@lru_cache(maxsize=8)
def _get_fernet(secret: str) -> Fernet:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def _build_fernet() -> Fernet:
    settings = get_settings()
    secret = settings.api_key_encryption_secret.strip()
    if not secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="API key encryption secret missing")
    return _get_fernet(secret)


def encrypt_api_key(api_key: str) -> str:
    return _build_fernet().encrypt(api_key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(ciphertext: str) -> str:
    try:
        return _build_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Stored API key is invalid") from exc


def get_user_api_key(session: Session, user_id: str, *, for_update: bool = False) -> UserApiKey | None:
    query = select(UserApiKey).where(UserApiKey.user_id == user_id)
    if for_update:
        query = query.with_for_update()
    return session.scalar(query)


def get_user_api_key_by_secret(session: Session, api_key: str) -> UserApiKey | None:
    return session.scalar(select(UserApiKey).where(UserApiKey.key_hash == hash_api_key(api_key)))


def ensure_user_api_key(session: Session, user_id: str, *, for_update: bool = False) -> UserApiKey:
    existing = get_user_api_key(session, user_id, for_update=for_update)
    if existing is not None:
        return existing

    api_key, last4 = generate_api_key()
    insert_fn = _insert_factory(session)
    result = session.execute(
        insert_fn(UserApiKey)
        .values(
            user_id=user_id,
            key_hash=hash_api_key(api_key),
            key_ciphertext=encrypt_api_key(api_key),
            key_last4=last4,
        )
        .on_conflict_do_nothing(index_elements=[UserApiKey.user_id])
    )
    session.flush()
    record = get_user_api_key(session, user_id, for_update=for_update)
    if record is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create API key")
    if result.rowcount:
        log_info("ApiKeyService", "ensure_user_api_key", "API key created", user_id=user_id)
    return record


def reveal_user_api_key(session: Session, user_id: str) -> tuple[UserApiKey, str]:
    record = ensure_user_api_key(session, user_id, for_update=True)
    return record, decrypt_api_key(record.key_ciphertext)


def rotate_user_api_key(session: Session, user_id: str) -> tuple[UserApiKey, str]:
    record = ensure_user_api_key(session, user_id, for_update=True)
    api_key, last4 = generate_api_key()
    record.key_hash = hash_api_key(api_key)
    record.key_ciphertext = encrypt_api_key(api_key)
    record.key_last4 = last4
    record.rotated_at = datetime.now(tz=UTC)
    session.flush()
    log_info("ApiKeyService", "rotate_user_api_key", "API key rotated", user_id=user_id)
    return record, api_key
