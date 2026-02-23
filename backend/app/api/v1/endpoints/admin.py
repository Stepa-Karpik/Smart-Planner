from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin_user, get_db_session, get_effective_user_role
from app.core.enums import FeedItemType, UserRole
from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.responses import success_response
from app.core.security import hash_password
from app.repositories.feed_item import FeedItemRepository
from app.repositories.user import UserRepository
from app.schemas.admin import AdminUserRead, AdminUserUpdate
from app.schemas.feed import AdminFeedItemCreate, AdminFeedItemUpdate, FeedItemRead

router = APIRouter(prefix="/admin", tags=["Admin"])


def _serialize_user(user) -> AdminUserRead:
    return AdminUserRead(
        user_id=str(user.id),
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        role=get_effective_user_role(user),
        is_active=bool(user.is_active),
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


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


@router.get("/users")
async def admin_list_users(
    request: Request,
    current_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    _ = current_user
    repo = UserRepository(session)
    items = await repo.list_users(q=q, limit=limit, offset=offset)
    total = await repo.count_users(q=q)
    data = [_serialize_user(item).model_dump() for item in items]
    return success_response(data=data, request=request, pagination={"total": total, "limit": limit, "offset": offset})


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    request: Request,
    admin_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)
    if user is None:
        raise NotFoundError("User not found")

    if payload.username and payload.username != user.username:
        existing = await repo.get_by_username(payload.username)
        if existing and existing.id != user.id:
            raise ConflictError("Username already registered", details={"field": "username"})

    if payload.role == UserRole.USER and str(user.id) == str(admin_user.id):
        # Prevent accidental self-demotion of the current admin session.
        raise ValidationAppError("You cannot remove your own admin role")

    await repo.admin_update_user(
        user,
        username=payload.username if "username" in payload.model_fields_set else None,
        display_name=payload.display_name if "display_name" in payload.model_fields_set else None,
        display_name_set="display_name" in payload.model_fields_set,
        role=payload.role,
        is_active=payload.is_active,
    )

    if payload.new_password:
        await repo.set_password_hash(user, hash_password(payload.new_password))

    await session.commit()
    return success_response(data=_serialize_user(user).model_dump(), request=request)


@router.get("/feed")
async def admin_list_feed(
    request: Request,
    current_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
    q: str | None = Query(default=None),
    target_username: str | None = Query(default=None, description="Use empty string for broadcast items only"),
    types: list[FeedItemType] = Query(default=[]),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    _ = current_user
    repo = FeedItemRepository(session)
    items = await repo.list_all(
        q=q,
        types=[item.value for item in types] if types else None,
        target_username=target_username,
        limit=limit,
        offset=offset,
    )
    total = await repo.count_all(q=q, types=[item.value for item in types] if types else None, target_username=target_username)
    data = [_serialize_feed_item(item).model_dump() for item in items]
    return success_response(data=data, request=request, pagination={"total": total, "limit": limit, "offset": offset})


@router.post("/feed")
async def admin_create_feed_item(
    payload: AdminFeedItemCreate,
    request: Request,
    current_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    user_repo = UserRepository(session)
    if payload.target_username:
        target = await user_repo.get_by_username(payload.target_username)
        if target is None:
            raise NotFoundError("Target user not found", details={"field": "target_username"})

    repo = FeedItemRepository(session)
    item = await repo.create(
        type=payload.type.value,
        title=payload.title,
        body=payload.body,
        target_username=payload.target_username,
        created_by_user_id=current_user.id,
        published_at=payload.published_at,
    )
    await session.commit()
    return success_response(data=_serialize_feed_item(item).model_dump(), request=request)


@router.patch("/feed/{item_id}")
async def admin_update_feed_item(
    item_id: UUID,
    payload: AdminFeedItemUpdate,
    request: Request,
    current_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    _ = current_user
    repo = FeedItemRepository(session)
    item = await repo.get_by_id(item_id)
    if item is None:
        raise NotFoundError("Feed item not found")

    if "target_username" in payload.model_fields_set and payload.target_username:
        target = await UserRepository(session).get_by_username(payload.target_username)
        if target is None:
            raise NotFoundError("Target user not found", details={"field": "target_username"})

    await repo.update(
        item,
        type=payload.type.value if payload.type else None,
        title=payload.title if "title" in payload.model_fields_set else None,
        body=payload.body if "body" in payload.model_fields_set else None,
        target_username=payload.target_username,
        target_username_set="target_username" in payload.model_fields_set,
        published_at=payload.published_at if "published_at" in payload.model_fields_set else None,
    )
    await session.commit()
    return success_response(data=_serialize_feed_item(item).model_dump(), request=request)


@router.delete("/feed/{item_id}")
async def admin_delete_feed_item(
    item_id: UUID,
    request: Request,
    current_user=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    _ = current_user
    repo = FeedItemRepository(session)
    item = await repo.get_by_id(item_id)
    if item is None:
        raise NotFoundError("Feed item not found")
    await repo.delete(item)
    await session.commit()
    return success_response(data={"ok": True}, request=request)
