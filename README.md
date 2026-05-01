# 🧠 Smart Planner

**Smart Planner** — AI-ассистент планирования, который управляет задачами, событиями и временем, автоматически оптимизируя расписание с учётом реальных ограничений, перемещений и контекста пользователя.

Проект объединяет интеллектуальный календарь, AI-диалоговое планирование, Telegram-бота и систему напоминаний в единую среду управления временем.

🔗 Repository: https://github.com/Stepa-Karpik/Smart-Planner

---

## ✨ Возможности

### 🧠 AI планирование

* понимание естественного языка
* создание событий через диалог
* оптимизация расписания
* анализ конфликтов
* рекомендации по планированию

### 📅 Календарь

* управление событиями
* повторяющиеся события
* напоминания
* перенос задач
* проверка выполнимости

### 🌍 Геолокация и перемещения

* расчет времени в пути
* учет перемещений между событиями
* домашняя локация
* геосаджест

### 🔔 Уведомления

* Telegram уведомления
* отложенные напоминания
* фоновые воркеры

### 🤖 Telegram интеграция

* deep-link авторизация
* быстрые команды
* AI взаимодействие
* push уведомления

---

## 🏗 Архитектура

```
Frontend (Next.js)
        │
        ▼
FastAPI Backend ─── PostgreSQL
        │
        ├── Redis
        ├── AI Worker
        ├── Notification Worker
        └── Telegram Bot
```

---

## 🧰 Технологии

### Backend

* FastAPI (async)
* PostgreSQL
* Redis
* SQLAlchemy 2
* Alembic
* aiogram 3
* LLM providers (OpenAI / DeepSeek)
* Docker

### Frontend

* Next.js (App Router)
* React
* TypeScript
* Leaflet
* shadcn/ui

### Infrastructure

* Docker Compose
* Worker-based architecture
* Redis queues
* Background processing

---

## 📦 Запуск

### Клонирование

```bash
git clone https://github.com/Stepa-Karpik/Smart-Planner
cd Smart-Planner
```

### Переменные окружения

```bash
cp .env.example .env
```

Заполнить:

* база данных
* Redis
* Telegram token
* AI provider ключи
* гео API ключи

### Запуск

```bash
docker compose up --build
```

### Миграции

```bash
docker compose run migrator alembic upgrade head
```

---

## 🌐 Сервисы

| сервис    | описание           |
| --------- | ------------------ |
| API       | основной backend   |
| AI worker | обработка AI задач |
| worker    | уведомления        |
| bot       | Telegram бот       |
| redis     | брокер             |
| postgres  | база данных        |

---

## 🔐 Telegram авторизация

Используется deep-link формат:

```
https://t.me/<BOT_USERNAME>?start=<code>
```

Пользователь связывает Telegram с аккаунтом внутри сервиса.

---

## 📁 Структура

```
backend/
  app/
    api/
    services/
    models/
    repositories/
    workers/
    bot/

frontend/
ai-assistant/
docker-compose.yml
```

---

## 🤖 AI Assistant v2

AI Assistant v2 выделен в отдельный FastAPI микросервис и работает в собственном Docker контейнере.

### Поток работы

1. Backend отправляет `POST /v1/ai/interpret` с контекстом
2. Backend выполняет детерминированную валидацию
3. Backend отправляет `POST /v1/ai/propose`
4. Backend применяет действия только после проверки


Smart Planner — система планирования, где AI не просто фиксирует события, а помогает принимать решения о времени.

---

## Routes Provider Priority (ORS / Yandex / Mock)

- Add `OPENROUTESERVICE_API_KEY` to local `.env` to enable OpenRouteService routing.
- Provider priority: `OpenRouteService -> Yandex -> Mock`.
- Runtime fallback: ORS failure -> Yandex (if configured) -> Mock.

### geometry_latlon

- Backend returns `geometry_latlon` in `[lat, lon]` format for frontend route rendering.
- Use `geometry_latlon` for both Leaflet and Yandex Maps.
- ORS raw geometry `[lon, lat]` is converted in backend.

## 2FA (Telegram / TOTP)

- Supported 2FA methods: `none | telegram | totp` (only one active at a time).
- Login tokens are issued only after successful second-factor verification.
- Telegram 2FA uses Telegram inline confirmation buttons for login and enable/disable actions.
- TOTP 2FA is compatible with Yandex Key / standard authenticator apps (`otpauth://`).

### New backend endpoints

- `GET /api/v1/integrations/twofa`
- `POST /api/v1/integrations/twofa/telegram/enable-request`
- `POST /api/v1/integrations/twofa/telegram/disable-request`
- `GET /api/v1/integrations/twofa/pending/{pending_id}`
- `POST /api/v1/integrations/twofa/totp/setup`
- `POST /api/v1/integrations/twofa/totp/verify-setup`
- `POST /api/v1/integrations/twofa/totp/disable`
- `POST /api/v1/auth/twofa/totp/verify`
- `POST /api/v1/auth/twofa/telegram/request`
- `GET /api/v1/auth/twofa/session/{twofa_session_id}`
- `POST /api/v1/auth/twofa/telegram/complete`
