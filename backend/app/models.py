import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Index, JSON, Column, DateTime, Enum, ForeignKey, Integer, Text, UniqueConstraint, func, text
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


class Feature(Base):
    __tablename__ = "features"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_feature_user_name"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    name = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    endpoints = relationship(
        "Endpoint",
        back_populates="feature",
        cascade="all, delete-orphan",
        order_by="Endpoint.created_at"
    )

    @property
    def enabled_state(self):
        enabled_flags = [endpoint.agent_enabled for endpoint in self.endpoints]
        if not enabled_flags:
            return "disabled"
        if all(enabled_flags):
            return "enabled"
        if any(enabled_flags):
            return "partial"
        return "disabled"

    @property
    def endpoint_count(self):
        return len(self.endpoints)


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


class BillingPlan(str, enum.Enum):
    free = "free"
    basic = "basic"
    pro = "pro"
    enterprise = "enterprise"


class BillingAccount(Base):
    __tablename__ = "billing_accounts"

    user_id = Column(Text, primary_key=True)
    plan = Column(Enum(BillingPlan, name="billing_plan", native_enum=True, validate_strings=True), nullable=False)
    monthly_action_quota = Column(Integer, nullable=False, server_default="0")
    monthly_actions_remaining = Column(Integer, nullable=False, server_default="0")
    topup_actions_remaining = Column(Integer, nullable=False, server_default="0")
    lifetime_actions_remaining = Column(Integer, nullable=False, server_default="0")
    lemon_customer_id = Column(Text, nullable=True, index=True)
    lemon_subscription_id = Column(Text, nullable=True, index=True)
    lemon_subscription_status = Column(Text, nullable=True)
    lemon_subscription_variant_id = Column(Text, nullable=True)
    lemon_subscription_renews_at = Column(DateTime(timezone=True), nullable=True)
    lemon_subscription_ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class BillingTopUpCredit(Base):
    __tablename__ = "billing_topup_credits"
    __table_args__ = (
        UniqueConstraint("lemon_order_id", name="uq_billing_topup_credits_lemon_order_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    lemon_order_id = Column(Text, nullable=False)
    actions = Column(Integer, nullable=False)
    refunded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BillingActionConsumption(Base):
    __tablename__ = "billing_action_consumptions"
    __table_args__ = (
        UniqueConstraint("user_id", "conversation_id", "tool_call_id", name="uq_billing_action_consumptions_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    conversation_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    tool_call_id = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


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
    feature_id = Column(UUID(as_uuid=True), ForeignKey("features.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_enabled = Column(Boolean, nullable=False, server_default=func.true(), default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    feature = relationship("Feature", back_populates="endpoints")
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
    widget_auth_enabled = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    widget_refresh_endpoint_path = Column(Text, nullable=False, server_default="/widget-token")
    widget_api_key_hash = Column(Text, nullable=True, index=True, unique=True)
    widget_api_key_last4 = Column(Text, nullable=True)
    widget_auth_enabled_draft = Column(Boolean, nullable=True)
    widget_refresh_endpoint_path_draft = Column(Text, nullable=True)
    widget_api_key_hash_draft = Column(Text, nullable=True)
    widget_api_key_last4_draft = Column(Text, nullable=True)
    widget_title = Column(Text, nullable=False, server_default="Warpy")
    widget_subtitle = Column(Text, nullable=False, server_default="Ready to act")
    widget_icon_url = Column(Text, nullable=True)
    widget_empty_title = Column(Text, nullable=False, server_default="What would you like to do?")
    widget_empty_description = Column(
        Text,
        nullable=False,
        server_default="Ask a question, request help, or describe what you want to get done.",
    )
    widget_input_placeholder = Column(Text, nullable=False, server_default="Ask Warpy…")
    widget_install_framework = Column(Text, nullable=False, server_default="react")
    widget_install_package_manager = Column(Text, nullable=False, server_default="npm")
    widget_security_disclosure_enabled = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    user_rate_limit_enabled = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    user_rate_limit_daily = Column(Integer, nullable=True)
    user_rate_limit_monthly = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    conversations = relationship("Conversation", back_populates="agent", cascade="all, delete-orphan")


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        Index("ix_conversations_agent_updated_at", "agent_id", "updated_at"),
        Index("ix_conversations_agent_created_at", "agent_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    participant = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    agent = relationship("Agent", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.sequence")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conversation_sequence", "conversation_id", "sequence"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    sequence = Column(Integer, nullable=False, server_default="0", default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation = relationship("Conversation", back_populates="messages")


class ConversationAction(Base):
    __tablename__ = "conversation_actions"
    __table_args__ = (
        UniqueConstraint("user_id", "conversation_id", "tool_call_id", name="uq_conversation_actions_key"),
        Index("ix_conversation_actions_user_created_at", "user_id", "created_at"),
        Index("ix_conversation_actions_conversation_created_at", "conversation_id", "created_at"),
        Index("ix_conversation_actions_user_endpoint_created_at", "user_id", "endpoint_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint_id = Column(UUID(as_uuid=True), ForeignKey("endpoints.id", ondelete="CASCADE"), nullable=False, index=True)
    feature_id = Column(UUID(as_uuid=True), ForeignKey("features.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_call_id = Column(Text, nullable=False)
    request = Column(json_type, nullable=False)
    status_code = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
