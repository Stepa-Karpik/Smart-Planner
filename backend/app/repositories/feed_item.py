from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FeedItem


class FeedItemRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, item_id: UUID) -> FeedItem | None:
        stmt = select(FeedItem).where(FeedItem.id == item_id)
        return await self.session.scalar(stmt)

    async def list_visible_for_user(
        self,
        *,
        username: str | None,
        types: list[str] | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[FeedItem]:
        stmt = select(FeedItem).order_by(FeedItem.published_at.desc(), FeedItem.created_at.desc()).limit(limit).offset(offset)
        normalized = (username or "").strip().lower()
        visibility = [FeedItem.target_username.is_(None)]
        if normalized:
            visibility.append(FeedItem.target_username == normalized)
        stmt = stmt.where(or_(*visibility))
        if types:
            stmt = stmt.where(FeedItem.type.in_(types))
        result = await self.session.scalars(stmt)
        return list(result.all())

    async def list_all(
        self,
        *,
        q: str | None = None,
        types: list[str] | None = None,
        target_username: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[FeedItem]:
        stmt = select(FeedItem).order_by(FeedItem.published_at.desc(), FeedItem.created_at.desc()).limit(limit).offset(offset)
        if q:
            pattern = f"%{q.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(FeedItem.title).like(pattern), func.lower(FeedItem.body).like(pattern)))
        if types:
            stmt = stmt.where(FeedItem.type.in_(types))
        if target_username is not None:
            normalized_target = target_username.strip().lower()
            if normalized_target:
                stmt = stmt.where(FeedItem.target_username == normalized_target)
            else:
                stmt = stmt.where(FeedItem.target_username.is_(None))
        result = await self.session.scalars(stmt)
        return list(result.all())

    async def count_all(self, *, q: str | None = None, types: list[str] | None = None, target_username: str | None = None) -> int:
        stmt = select(func.count()).select_from(FeedItem)
        conditions = []
        if q:
            pattern = f"%{q.strip().lower()}%"
            conditions.append(or_(func.lower(FeedItem.title).like(pattern), func.lower(FeedItem.body).like(pattern)))
        if types:
            conditions.append(FeedItem.type.in_(types))
        if target_username is not None:
            normalized_target = target_username.strip().lower()
            conditions.append(FeedItem.target_username == normalized_target if normalized_target else FeedItem.target_username.is_(None))
        if conditions:
            stmt = stmt.where(and_(*conditions))
        value = await self.session.scalar(stmt)
        return int(value or 0)

    async def create(
        self,
        *,
        type: str,
        title: str,
        body: str,
        meta_json: dict | None = None,
        target_username: str | None,
        created_by_user_id: UUID | None,
        published_at: datetime | None = None,
    ) -> FeedItem:
        item = FeedItem(
            type=type,
            title=title,
            body=body,
            meta_json=meta_json,
            target_username=(target_username.strip().lower() or None) if isinstance(target_username, str) else None,
            created_by_user_id=created_by_user_id,
            published_at=published_at or datetime.now(timezone.utc),
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def update(
        self,
        item: FeedItem,
        *,
        type: str | None = None,
        title: str | None = None,
        body: str | None = None,
        meta_json: dict | None | object = None,
        target_username: str | None | object = None,
        published_at: datetime | None = None,
        target_username_set: bool = False,
        meta_json_set: bool = False,
    ) -> FeedItem:
        if type is not None:
            item.type = type
        if title is not None:
            item.title = title
        if body is not None:
            item.body = body
        if meta_json_set:
            item.meta_json = meta_json if isinstance(meta_json, dict) else None
        if target_username_set:
            item.target_username = (target_username.strip().lower() or None) if isinstance(target_username, str) else None
        if published_at is not None:
            item.published_at = published_at
        await self.session.flush()
        return item

    async def delete(self, item: FeedItem) -> None:
        await self.session.delete(item)
        await self.session.flush()
