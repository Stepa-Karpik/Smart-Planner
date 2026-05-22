from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin_user, get_db_session, get_effective_user_role
from app.core.enums import FeedItemType, UserRole
from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.responses import success_response
from app.core.security import hash_password
from app.models import ApiRequestMetric, FeedItem, SupportTicket, User, UserSubscription
from app.repositories.feed_item import FeedItemRepository
from app.repositories.user import UserRepository
from app.schemas.admin import AdminOverviewRead, AdminSubscriptionRead, AdminSubscriptionUpdate, AdminUserRead, AdminUserUpdate
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
        meta=item.meta_json,
        service=getattr(item, "service", "planner"),
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

    if payload.email and payload.email != user.email:
        existing = await repo.get_by_email(payload.email)
        if existing and existing.id != user.id:
            raise ConflictError("Email already registered", details={"field": "email"})

    if payload.role == UserRole.USER and str(user.id) == str(admin_user.id):
        # Prevent accidental self-demotion of the current admin session.
        raise ValidationAppError("You cannot remove your own admin role")

    await repo.admin_update_user(
        user,
        username=payload.username if "username" in payload.model_fields_set else None,
        email=payload.email if "email" in payload.model_fields_set else None,
        display_name=payload.display_name if "display_name" in payload.model_fields_set else None,
        display_name_set="display_name" in payload.model_fields_set,
        email_set="email" in payload.model_fields_set,
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
    service: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    _ = current_user
    repo = FeedItemRepository(session)
    items = await repo.list_all(
        q=q,
        types=[item.value for item in types] if types else None,
        target_username=target_username,
        service=service,
        limit=limit,
        offset=offset,
    )
    total = await repo.count_all(q=q, types=[item.value for item in types] if types else None, target_username=target_username, service=service)
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
        meta_json=payload.meta,
        service=payload.service or "planner",
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
        meta_json=payload.meta if "meta" in payload.model_fields_set else None,
        service=payload.service if "service" in payload.model_fields_set else None,
        meta_json_set="meta" in payload.model_fields_set,
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


def _serialize_subscription(item) -> dict:
    return AdminSubscriptionRead(
        id=str(item.id),
        user_id=str(item.user_id),
        username=item.user.username,
        display_name=item.user.display_name,
        email=item.user.email,
        plan=item.plan,
        expires_at=item.expires_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    ).model_dump()


@router.get("/overview")
async def admin_overview(
    request: Request,
    _admin=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
    service: str | None = Query(default=None),
):
    normalized_service = (service or "").strip().lower() or "all"
    ticket_filters = [] if normalized_service == "all" else [SupportTicket.service == normalized_service]
    feed_filters = [] if normalized_service == "all" else [FeedItem.service == normalized_service]

    users_total = int(await session.scalar(select(func.count()).select_from(User)) or 0)
    feed_items = int(await session.scalar(select(func.count()).select_from(FeedItem).where(*feed_filters)) or 0)
    open_tickets = int(await session.scalar(select(func.count()).select_from(SupportTicket).where(*ticket_filters, SupportTicket.status == "open")) or 0)
    answered_tickets = int(await session.scalar(select(func.count()).select_from(SupportTicket).where(*ticket_filters, SupportTicket.status == "answered")) or 0)
    closed_tickets = int(await session.scalar(select(func.count()).select_from(SupportTicket).where(*ticket_filters, SupportTicket.status == "closed")) or 0)
    active_subscriptions = int(await session.scalar(select(func.count()).select_from(UserSubscription).where(UserSubscription.expires_at.is_(None) | (UserSubscription.expires_at > datetime.now(timezone.utc)))) or 0)

    distribution_rows = (await session.execute(select(UserSubscription.plan, func.count()).group_by(UserSubscription.plan))).all()
    distribution = {str(plan): int(count) for plan, count in distribution_rows}

    new_users_rows = (await session.execute(
        select(func.date_trunc("day", User.created_at).label("day"), func.count()).group_by("day").order_by("day").limit(30)
    )).all()

    metric_filters = [] if normalized_service == "all" else [ApiRequestMetric.service == normalized_service]
    api_rows = (await session.execute(
        select(func.date_trunc("day", ApiRequestMetric.created_at).label("day"), func.count())
        .where(*metric_filters)
        .group_by("day")
        .order_by("day")
        .limit(30)
    )).all()

    return success_response(data=AdminOverviewRead(
        service=normalized_service,
        users_total=users_total,
        open_tickets=open_tickets,
        answered_tickets=answered_tickets,
        closed_tickets=closed_tickets,
        feed_items=feed_items,
        active_subscriptions=active_subscriptions,
        subscription_distribution=distribution,
        new_users=[{"date": str(day.date()), "count": int(count)} for day, count in new_users_rows],
        api_requests=[{"date": str(day.date()), "count": int(count)} for day, count in api_rows],
    ).model_dump(), request=request)


@router.get("/subscriptions")
async def admin_list_subscriptions(
    request: Request,
    _admin=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
    plan: str | None = Query(default=None),
):
    from sqlalchemy.orm import selectinload
    stmt = select(UserSubscription).join(User).options(selectinload(UserSubscription.user)).order_by(UserSubscription.updated_at.desc())
    if plan:
        stmt = stmt.where(UserSubscription.plan == plan.strip().lower())
    items = list((await session.scalars(stmt)).all())
    return success_response(data=[_serialize_subscription(item) for item in items], request=request)


@router.patch("/subscriptions/{subscription_id}")
async def admin_update_subscription(
    subscription_id: UUID,
    payload: AdminSubscriptionUpdate,
    request: Request,
    _admin=Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_db_session),
):
    from sqlalchemy.orm import selectinload
    item = await session.scalar(select(UserSubscription).where(UserSubscription.id == subscription_id).options(selectinload(UserSubscription.user)))
    if item is None:
        raise NotFoundError("Subscription not found")
    item.plan = payload.plan
    item.expires_at = payload.expires_at
    await session.commit()
    return success_response(data=_serialize_subscription(item), request=request)
