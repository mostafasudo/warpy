# This controller is only for the purpose of testing the widget/agent
# Never remove it.
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..core.auth import require_clerk_session
from ..core.logger import log_error, log_info
from ..schemas.auth import ClerkSession

router = APIRouter(tags=["products"])

_DUMMYJSON_PRODUCTS = "https://dummyjson.com/products"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


@router.get("/products")
def list_products(
    limit: int | None = Query(None, ge=1, le=250),
    clerk_session: ClerkSession = Depends(require_clerk_session),
):
    params = {"limit": limit} if limit is not None else None
    try:
        response = httpx.get(
            _DUMMYJSON_PRODUCTS,
            params=params,
            timeout=_TIMEOUT,
            follow_redirects=True,
        )
        response.raise_for_status()
        log_info(
            "ProductsController",
            "list_products",
            "Products fetched",
            user_id=clerk_session.user_id,
            limit=limit,
        )
        return response.json()
    except httpx.HTTPStatusError as error:
        log_error(
            "ProductsController",
            "list_products",
            "Upstream returned error",
            exc=error,
            user_id=clerk_session.user_id,
            status_code=error.response.status_code,
            limit=limit,
        )
        raise HTTPException(status_code=error.response.status_code, detail="Upstream error")
    except httpx.RequestError as error:
        log_error(
            "ProductsController",
            "list_products",
            "Upstream request failed",
            exc=error,
            user_id=clerk_session.user_id,
            limit=limit,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Upstream request failed")
