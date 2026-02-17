from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.integrations.redis import close_redis, get_redis
from app.services.ai.service import AIService
from app.services.events import EventService
from app.services.feasibility import TravelFeasibilityService
from app.services.routing import RouteService

logger = logging.getLogger(__name__)


async def run_ai_worker() -> None:
    configure_logging()
    redis = await get_redis()
    logger.info("AI worker started")

    try:
        while True:
            item = await redis.blpop("ai:jobs", timeout=5)
            if item is None:
                await asyncio.sleep(0.1)
                continue

            _, raw_job_id = item
            try:
                job_id = UUID(raw_job_id)
            except Exception:
                logger.warning("Invalid job id in queue: %s", raw_job_id)
                continue

            async with SessionLocal() as session:
                event_service = EventService(session, redis)
                route_service = RouteService(redis)
                feasibility = TravelFeasibilityService(route_service)
                service = AIService(session=session, redis=redis, event_service=event_service, feasibility_service=feasibility)
                await service.process_job(job_id)
    finally:
        await close_redis()


if __name__ == "__main__":
    asyncio.run(run_ai_worker())
