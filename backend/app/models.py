import enum
import uuid

from sqlalchemy import JSON, Column, DateTime, Enum, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from .core.database import Base


json_type = JSON().with_variant(JSONB, "postgresql")


class StorageSource(str, enum.Enum):
    local_storage = "localStorage"
    session_storage = "sessionStorage"
    cookies = "cookies"


class HttpMethod(str, enum.Enum):
    get = "GET"
    post = "POST"
    put = "PUT"
    patch = "PATCH"
    delete = "DELETE"


class Environment(Base):
    __tablename__ = "environments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, unique=True, nullable=False)
    base_url = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SessionHeader(Base):
    __tablename__ = "session_headers"
    __table_args__ = (
        UniqueConstraint("header_name", "source", "key", name="uq_session_headers_header_source_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    header_name = Column(Text, nullable=False)
    source = Column(Enum(StorageSource, name="storage_source", native_enum=True, validate_strings=True), nullable=False)
    key = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Endpoint(Base):
    __tablename__ = "endpoints"
    __table_args__ = (
        UniqueConstraint("path", "method", name="uq_endpoint_path_method"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    path = Column(Text, nullable=False)
    method = Column(Enum(HttpMethod, name="http_method", native_enum=True, validate_strings=True), nullable=False)
    tool = Column(json_type, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
