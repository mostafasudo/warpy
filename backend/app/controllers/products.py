# This controller is only for the purpose of testing the widget/agent
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..core.auth import require_clerk_session
from ..core.logger import log_error, log_info
from ..schemas.auth import ClerkSession

router = APIRouter(tags=["products"])

_FAKESTORE_BASE = "https://fakestoreapi.com"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


@router.get("/products")
def list_products(
    limit: int | None = Query(default=None, ge=1),
    clerk_session: ClerkSession = Depends(require_clerk_session)
):
    try:
        params = {"limit": limit} if limit is not None else None
        response = httpx.get(
            f"{_FAKESTORE_BASE}/products",
            params=params,
            timeout=_TIMEOUT,
            follow_redirects=True
        )
        response.raise_for_status()
        log_info("ProductsController", "list_products", "Products fetched", user_id=clerk_session.user_id, limit=limit)
        return response.json()
    except httpx.HTTPStatusError as error:
        log_error(
            "ProductsController",
            "list_products",
            "Upstream returned error",
            exc=error,
            user_id=clerk_session.user_id,
            status_code=error.response.status_code
        )
        raise HTTPException(status_code=error.response.status_code, detail="Upstream error")
    except httpx.RequestError as error:
        log_error("ProductsController", "list_products", "Upstream request failed", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Upstream request failed")


@router.get("/products/{product_id}")
def get_product(
    product_id: int,
    clerk_session: ClerkSession = Depends(require_clerk_session)
):
    try:
        response = httpx.get(
            f"{_FAKESTORE_BASE}/products/{product_id}",
            timeout=_TIMEOUT,
            follow_redirects=True
        )
        response.raise_for_status()
        log_info("ProductsController", "get_product", "Product fetched", user_id=clerk_session.user_id, product_id=product_id)
        return response.json()
    except httpx.HTTPStatusError as error:
        log_error(
            "ProductsController",
            "get_product",
            "Upstream returned error",
            exc=error,
            user_id=clerk_session.user_id,
            status_code=error.response.status_code,
            product_id=product_id
        )
        raise HTTPException(status_code=error.response.status_code, detail="Upstream error")
    except httpx.RequestError as error:
        log_error("ProductsController", "get_product", "Upstream request failed", exc=error, user_id=clerk_session.user_id, product_id=product_id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Upstream request failed")

