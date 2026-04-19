import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Index, JSON, Column, DateTime, Enum, ForeignKey, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from .core.database import Base
from .core.agent_custom_system_prompt import DEFAULT_CUSTOM_USER_SYSTEM_PROMPT
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


class McpAuthMode(str, enum.Enum):
    none = "none"
    static_headers = "static_headers"
    token_exchange = "token_exchange"


class WidgetRunStatus(str, enum.Enum):
    running = "running"
    waiting_for_tools = "waiting_for_tools"
    completed = "completed"
    superseded = "superseded"
    failed = "failed"


class DocumentStatus(str, enum.Enum):
    processing = "processing"
    ready = "ready"
    error = "error"


class WebsiteStatus(str, enum.Enum):
    processing = "processing"
    ready = "ready"
    partial = "partial"
    error = "error"


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
    tools = relationship(
        "Tool",
        back_populates="feature",
        cascade="all, delete-orphan",
        order_by="Tool.created_at"
    )

    @property
    def enabled_state(self):
        enabled_flags = [tool.agent_enabled for tool in self.tools]
        if not enabled_flags:
            return "disabled"
        if all(enabled_flags):
            return "enabled"
        if any(enabled_flags):
            return "partial"
        return "disabled"

    @property
    def tool_count(self):
        return len(self.tools)

    @property
    def backend_tool_count(self):
        return sum(1 for tool in self.tools if tool.tool_type == "backend")


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


class McpConnection(Base):
    __tablename__ = "mcp_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    name = Column(Text, nullable=False)
    server_url = Column(Text, nullable=False)
    auth_mode = Column(
        Enum(McpAuthMode, name="mcp_auth_mode", native_enum=True, validate_strings=True),
        nullable=False,
        server_default=McpAuthMode.none.value,
        default=McpAuthMode.none,
    )
    static_headers = Column(json_type, nullable=True)
    token_exchange_path = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class UserStats(Base):
    __tablename__ = "user_stats"

    user_id = Column(Text, primary_key=True)
    tool_count = Column(Integer, nullable=False, server_default="0")
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


class UserOnboardingState(Base):
    __tablename__ = "user_onboarding_states"

    user_id = Column(Text, primary_key=True)
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Tool(Base):
    __tablename__ = "tools"
    __table_args__ = (
        UniqueConstraint("user_id", "path", "method", name="uq_tool_user_path_method"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    tool_type = Column(Text, nullable=False, server_default="backend", default="backend")
    path = Column(Text, nullable=True)
    method = Column(Enum(HttpMethod, name="http_method", native_enum=True, validate_strings=True), nullable=True)
    tool = Column(json_type, nullable=False)
    feature_id = Column(UUID(as_uuid=True), ForeignKey("features.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_enabled = Column(Boolean, nullable=False, server_default=func.true(), default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    feature = relationship("Feature", back_populates="tools")
    embedding = relationship("ToolEmbedding", back_populates="tool", uselist=False, cascade="all, delete-orphan")


class ToolEmbedding(Base):
    __tablename__ = "tool_embeddings"
    __table_args__ = (
        UniqueConstraint("tool_id", name="uq_tool_embedding_tool"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tool_id = Column(UUID(as_uuid=True), ForeignKey("tools.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Text, nullable=False, index=True)
    embedding = Column(Vector(llm_config.embedding_dimensions), nullable=False)
    content_hash = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tool = relationship("Tool", back_populates="embedding")


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
    widget_icon_url = Column(Text, nullable=True)
    widget_appearance_mode = Column(Text, nullable=False, server_default="infer", default="infer")
    widget_theme = Column(json_type, nullable=True)
    widget_behavior = Column(Text, nullable=False, server_default="overlay", default="overlay")
    widget_empty_title = Column(Text, nullable=False, server_default="What would you like to do?")
    widget_empty_description = Column(
        Text,
        nullable=False,
        server_default="Ask a question, request help, or describe what you want to get done.",
    )
    widget_input_placeholder = Column(Text, nullable=False, server_default="Ask Warpy…")
    widget_suggestions_enabled = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    widget_starter_suggestions = Column(json_type, nullable=False, server_default=text("'[]'"), default=list)
    widget_install_framework = Column(Text, nullable=False, server_default="react")
    widget_install_package_manager = Column(Text, nullable=False, server_default="npm")
    widget_security_disclosure_enabled = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    frontend_capability_enabled = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    knowledge_base_enabled = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    custom_user_system_prompt = Column(
        Text,
        nullable=False,
        server_default=DEFAULT_CUSTOM_USER_SYSTEM_PROMPT,
        default=DEFAULT_CUSTOM_USER_SYSTEM_PROMPT,
    )
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
    widget_runs = relationship("WidgetRun", back_populates="conversation", cascade="all, delete-orphan")


class WidgetRun(Base):
    __tablename__ = "widget_runs"
    __table_args__ = (
        UniqueConstraint("agent_id", "request_id", name="uq_widget_runs_agent_request"),
        Index("ix_widget_runs_conversation_request", "conversation_id", "request_id"),
        Index("ix_widget_runs_conversation_status", "conversation_id", "status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id = Column(Text, nullable=False)
    status = Column(
        Enum(WidgetRunStatus, name="widget_run_status", native_enum=False, validate_strings=True),
        nullable=False,
        server_default=WidgetRunStatus.running.value,
        default=WidgetRunStatus.running,
    )
    owner_token = Column(Text, nullable=True)
    user_message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    assistant_message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    conversation = relationship("Conversation", back_populates="widget_runs")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "sequence", name="uq_messages_conversation_sequence"),
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
        Index("ix_conversation_actions_user_tool_created_at", "user_id", "tool_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_type = Column(Text, nullable=False, server_default="backend", default="backend")
    tool_id = Column(UUID(as_uuid=True), ForeignKey("tools.id", ondelete="CASCADE"), nullable=True, index=True)
    feature_id = Column(UUID(as_uuid=True), ForeignKey("features.id", ondelete="CASCADE"), nullable=True, index=True)
    frontend_goal = Column(Text, nullable=True)
    frontend_url = Column(Text, nullable=True)
    frontend_actions = Column(json_type, nullable=True)
    tool_call_id = Column(Text, nullable=False)
    request = Column(json_type, nullable=False)
    response_body = Column(json_type, nullable=True)
    status_code = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (
        UniqueConstraint("website_id", "source_url", name="uq_knowledge_documents_website_source_url"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    file_name = Column(Text, nullable=False)
    file_type = Column(Text, nullable=False)
    file_size = Column(Integer, nullable=False)
    source_kind = Column(Text, nullable=False, server_default="file", default="file")
    website_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_websites.id", ondelete="CASCADE"), nullable=True, index=True)
    source_url = Column(Text, nullable=True)
    source_hash = Column(Text, nullable=True)
    content_language = Column(Text, nullable=True)
    is_searchable = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    status = Column(
        Enum(DocumentStatus, name="document_status", native_enum=True, validate_strings=True),
        nullable=False,
        server_default="processing",
    )
    chunk_count = Column(Integer, nullable=False, server_default="0")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    chunks = relationship("KnowledgeChunk", back_populates="document", cascade="all, delete-orphan")
    website = relationship("KnowledgeWebsite", back_populates="documents")


class KnowledgeWebsite(Base):
    __tablename__ = "knowledge_websites"
    __table_args__ = (
        UniqueConstraint("user_id", "scope_url", name="uq_knowledge_websites_user_scope_url"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=False, index=True)
    input_url = Column(Text, nullable=False)
    scope_url = Column(Text, nullable=False)
    status = Column(
        Enum(WebsiteStatus, name="knowledge_website_status", native_enum=False, validate_strings=True),
        nullable=False,
        server_default="processing",
    )
    error_message = Column(Text, nullable=True)
    last_crawled_at = Column(DateTime(timezone=True), nullable=True)
    last_successful_crawled_at = Column(DateTime(timezone=True), nullable=True)
    next_refresh_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    documents = relationship("KnowledgeDocument", back_populates="website", cascade="all, delete-orphan")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_chunks_document_index", "document_id", "chunk_index"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Text, nullable=False, index=True)
    content = Column(Text, nullable=False)
    section_title = Column(Text, nullable=True)
    search_text = Column(Text, nullable=True)
    chunk_index = Column(Integer, nullable=False)
    chunk_metadata = Column("metadata", json_type, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    document = relationship("KnowledgeDocument", back_populates="chunks")
    embedding = relationship("KnowledgeEmbedding", back_populates="chunk", uselist=False, cascade="all, delete-orphan")


class KnowledgeEmbedding(Base):
    __tablename__ = "knowledge_embeddings"
    __table_args__ = (
        UniqueConstraint("chunk_id", name="uq_knowledge_embedding_chunk"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_chunks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Text, nullable=False, index=True)
    embedding = Column(Vector(llm_config.embedding_dimensions), nullable=False)
    content_hash = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    chunk = relationship("KnowledgeChunk", back_populates="embedding")
