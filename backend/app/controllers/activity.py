from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..core.auth import require_clerk_session
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.activity import (
    ActivityActionEvent,
    ActivityActionRequest,
    ActivityConversationDetailResponse,
    ActivityConversationRow,
    ActivityConversationsResponse,
    ActivityMessage,
    ActivitySummaryResponse,
    ActivityTopAction,
)
from ..schemas.auth import ClerkSession
from ..services.activity_service import (
    action_label,
    get_activity_conversation_detail,
    get_activity_summary,
    list_activity_conversations,
    resolve_activity_range,
)

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("/summary", response_model=ActivitySummaryResponse)
def get_activity_summary_route(
    start_date: date | None = Query(None, alias="start_date"),
    end_date: date | None = Query(None, alias="end_date"),
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> ActivitySummaryResponse:
    try:
        start, end = resolve_activity_range(start_date, end_date)
        conversation_count, action_count, top_actions, has_any_conversation = get_activity_summary(
            session,
            clerk_session.user_id,
            start=start,
            end=end,
        )
        log_info("ActivityController", "get_summary", "Activity summary fetched", user_id=clerk_session.user_id)
        return ActivitySummaryResponse(
            conversationCount=conversation_count,
            actionCount=action_count,
            hasAnyConversation=has_any_conversation,
            topActions=[
                ActivityTopAction(feature=feature, action=action, count=count)
                for feature, action, count in top_actions
            ],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except HTTPException:
        raise
    except Exception as error:
        log_error("ActivityController", "get_summary", "Failed to fetch activity summary", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch activity summary")


@router.get("/conversations", response_model=ActivityConversationsResponse)
def list_activity_conversations_route(
    start_date: date | None = Query(None, alias="start_date"),
    end_date: date | None = Query(None, alias="end_date"),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> ActivityConversationsResponse:
    try:
        start, end = resolve_activity_range(start_date, end_date)
        conversations, user_message_counts, action_counts, next_cursor = list_activity_conversations(
            session,
            clerk_session.user_id,
            start=start,
            end=end,
            limit=limit,
            cursor=cursor,
        )
        log_info("ActivityController", "list_conversations", "Activity conversations fetched", user_id=clerk_session.user_id)
        return ActivityConversationsResponse(
            items=[
                ActivityConversationRow(
                    id=conversation.id,
                    participant=conversation.participant,
                    createdAt=conversation.created_at,
                    updatedAt=conversation.updated_at,
                    userMessageCount=int(user_message_counts.get(conversation.id, 0)),
                    actionCount=int(action_counts.get(conversation.id, 0)),
                )
                for conversation in conversations
            ],
            nextCursor=next_cursor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except HTTPException:
        raise
    except Exception as error:
        log_error("ActivityController", "list_conversations", "Failed to fetch conversations", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch conversations")


@router.get("/conversations/{conversation_id}", response_model=ActivityConversationDetailResponse)
def get_activity_conversation_detail_route(
    conversation_id: UUID,
    message_limit: int = Query(200, ge=1, le=500, alias="message_limit"),
    message_cursor: str | None = Query(None, alias="message_cursor"),
    action_limit: int = Query(200, ge=1, le=500, alias="action_limit"),
    action_cursor: str | None = Query(None, alias="action_cursor"),
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session),
) -> ActivityConversationDetailResponse:
    try:
        conversation, messages, next_message_cursor, actions, next_action_cursor, endpoints = get_activity_conversation_detail(
            session,
            clerk_session.user_id,
            conversation_id,
            message_limit=message_limit,
            message_cursor=message_cursor,
            action_limit=action_limit,
            action_cursor=action_cursor,
        )
        if not conversation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        return ActivityConversationDetailResponse(
            id=conversation.id,
            participant=conversation.participant,
            createdAt=conversation.created_at,
            updatedAt=conversation.updated_at,
            messages=[
                ActivityMessage(role=message.role, content=message.content, createdAt=message.created_at)
                for message in messages
            ],
            nextMessageCursor=next_message_cursor,
            actions=[
                ActivityActionEvent(
                    id=action.id,
                    createdAt=action.created_at,
                    feature=(getattr(getattr(endpoints.get(action.endpoint_id), "feature", None), "name", "") or ""),
                    action=action_label(endpoints[action.endpoint_id]) if action.endpoint_id in endpoints else "",
                    statusCode=action.status_code,
                    error=action.error,
                    request=ActivityActionRequest(
                        params=(action.request or {}).get("params") or {},
                        query=(action.request or {}).get("query") or {},
                        body=(action.request or {}).get("body") or {},
                    ),
                )
                for action in actions
            ],
            nextActionCursor=next_action_cursor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except HTTPException:
        raise
    except Exception as error:
        log_error(
            "ActivityController",
            "get_conversation",
            "Failed to fetch conversation detail",
            exc=error,
            user_id=clerk_session.user_id,
            conversation_id=str(conversation_id),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch conversation detail")
