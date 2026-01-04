import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..services.lemon_squeezy_service import handle_lemon_webhook, verify_lemon_webhook_signature

router = APIRouter(tags=["webhooks"])


@router.post("/webhooks/lemon-squeezy", status_code=status.HTTP_204_NO_CONTENT)
async def lemon_squeezy_webhook(
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    settings = get_settings()
    secret = (settings.lemon_squeezy_webhook_secret or "").strip()
    if not secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Webhook secret missing")

    raw = await request.body()
    signature = request.headers.get("X-Signature")
    if not verify_lemon_webhook_signature(secret, raw, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as error:
        log_error("LemonSqueezyWebhook", "lemon_squeezy_webhook", "Invalid JSON payload", exc=error)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    try:
        handle_lemon_webhook(session, settings, payload)
        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        log_info(
            "LemonSqueezyWebhook",
            "lemon_squeezy_webhook",
            "Webhook processed",
            event_name=str(meta.get("event_name") or ""),
            test_mode=bool(meta.get("test_mode")),
        )
        return None
    except HTTPException:
        raise
    except Exception as error:
        log_error("LemonSqueezyWebhook", "lemon_squeezy_webhook", "Failed to process webhook", exc=error)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process webhook")
