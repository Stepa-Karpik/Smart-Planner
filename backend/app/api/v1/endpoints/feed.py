from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.enums import FeedItemType
from app.core.responses import success_response
from app.repositories.feed_item import FeedItemRepository
from app.schemas.feed import FeedItemRead

router = APIRouter(prefix="/feed", tags=["Feed"])


def _serialize_feed_item(item) -> FeedItemRead:
    return FeedItemRead(
        id=str(item.id),
        type=item.type,
        title=item.title,
        body=item.body,
        target_username=item.target_username,
        published_at=item.published_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        created_by_user_id=str(item.created_by_user_id) if item.created_by_user_id else None,
    )


@router.get("")
async def list_feed_items(
    request: Request,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    types: list[FeedItemType] = Query(default=[]),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    repo = FeedItemRepository(session)
    items = await repo.list_visible_for_user(
        username=getattr(current_user, "username", None),
        types=[item.value for item in types] if types else None,
        limit=limit,
        offset=offset,
    )
    data = [_serialize_feed_item(item).model_dump() for item in items]
    return success_response(data=data, request=request)

