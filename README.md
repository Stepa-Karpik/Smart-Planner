# Smart Planner Monorepo

Project layout:

- `frontend` - Next.js client
- `backend` - FastAPI API, DB models, migrations, workers
- `bot` - standalone Telegram bot docker runtime (uses backend code)

## Run everything

```bash
docker compose up --build
```

Services:

- `frontend` - Next.js (`http://localhost:3000`)
- `api` - FastAPI (`http://localhost:8000`, docs: `http://localhost:8000/docs`)
- `bot` - Telegram bot
- `worker` - notification worker
- `ai-worker` - AI queue worker
- `migrator` - one-shot Alembic migrations
- `postgres`
- `redis`

Key URLs:

- Frontend: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- OpenAPI: `http://localhost:8000/openapi.json`

## Repository structure

```text
frontend/
backend/
  app/
  alembic/
  scripts/
  tests/
bot/
```

## Local backend run (without Docker)

```bash
cd backend
python -m pip install -r requirements.txt
alembic upgrade head
hypercorn app.main:app --bind 0.0.0.0:8000
```

In separate terminals:

```bash
cd backend && python -m app.bot.main
cd backend && python -m app.workers.notification_worker
cd backend && python -m app.workers.ai_worker
```

## Integration tests in Docker

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

## Frontend env

`frontend` reads:

- `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`)
- `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` (for map picker and map widgets)

## Added UX features

- RU/EN language toggle
- Telegram link returns both web deep-link and desktop app link (`tg://resolve?...`)
- Location input with autocomplete + map picker + reverse geocoding
- Events page supports `list` / `calendar` / `gantt` views
- Gantt view shows yellow travel-time strip
- Profile page:
  - display name / username update
  - default transport mode
  - password change
  - Telegram link card

## Notes

- API prefix: `/api/v1`
- API uses unified envelope (`data`, `meta`, `error`)
- Telegram link flow uses deep-link `/start <code>`
- All dates stored as UTC in backend
- Required/optional key details: `need_api.txt`
