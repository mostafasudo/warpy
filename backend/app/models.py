import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from .core.database import Base
from .core.llm_config import llm_config


json_type = JSON().with_variant(JSONB, "postgresql")


class StorageSource(str, enum.Enum):
    local_storage = "localStorage"
    session_storage = "sessionStorage"
    cookies = "cookies"


class AuthType(str, enum.Enum):
    bearer = "bearer"
    basic = "basic"
    none = "none"


class HttpMethod(str, enum.Enum):
    get = "GET"
    post = "POST"
    put = "PUT"
    patch = "PATCH"
    delete = "DELETE"


class Environment(Base):
    __tablename__ = "environments"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_environments_user_name"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    name = Column(Text, nullable=False)
    base_url = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SessionHeader(Base):
    __tablename__ = "session_headers"
    __table_args__ = (
        UniqueConstraint("user_id", "header_name", "source", "key", name="uq_session_headers_user_header_source_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    header_name = Column(Text, nullable=False)
    source = Column(Enum(StorageSource, name="storage_source", native_enum=True, validate_strings=True), nullable=False)
    key = Column(Text, nullable=False)
    auth_type = Column(Enum(AuthType, name="auth_type", native_enum=True, validate_strings=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class UserStats(Base):
    __tablename__ = "user_stats"

    user_id = Column(Text, primary_key=True)
    endpoint_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Endpoint(Base):
    __tablename__ = "endpoints"
    __table_args__ = (
        UniqueConstraint("user_id", "path", "method", name="uq_endpoint_user_path_method"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    path = Column(Text, nullable=False)
    method = Column(Enum(HttpMethod, name="http_method", native_enum=True, validate_strings=True), nullable=False)
    tool = Column(json_type, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    embedding = relationship("EndpointEmbedding", back_populates="endpoint", uselist=False, cascade="all, delete-orphan")


class EndpointEmbedding(Base):
    __tablename__ = "endpoint_embeddings"
    __table_args__ = (
        UniqueConstraint("endpoint_id", name="uq_endpoint_embedding_endpoint"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    endpoint_id = Column(UUID(as_uuid=True), ForeignKey("endpoints.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Text, nullable=False, index=True)
    embedding = Column(Vector(llm_config.embedding_dimensions), nullable=False)
    content_hash = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    endpoint = relationship("Endpoint", back_populates="embedding")


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_agent_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    conversations = relationship("Conversation", back_populates="agent", cascade="all, delete-orphan")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    participant = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    agent = relationship("Agent", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation = relationship("Conversation", back_populates="messages")
