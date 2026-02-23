from fastapi import APIRouter

from app.api.v1.endpoints import admin, admin_tickets, ai, auth, calendars, events, feed, integrations, profile, reminders, routes, schedule, support, twofa

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(feed.router)
api_router.include_router(admin.router)
api_router.include_router(admin_tickets.router)
api_router.include_router(support.router)
api_router.include_router(calendars.router)
api_router.include_router(events.router)
api_router.include_router(reminders.router)
api_router.include_router(integrations.router)
api_router.include_router(twofa.router)
api_router.include_router(schedule.router)
api_router.include_router(routes.router)
api_router.include_router(ai.router)
