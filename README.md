# 🚀 Smart Planner

**Smart Planner** — это AI-ассистент планирования нового поколения, который помогает управлять задачами, событиями и временем, автоматически оптимизируя расписание с учётом реального мира.

Проект объединяет:

* 🧠 AI-ассистента планирования
* 📅 интеллектуальный календарь
* 🤖 Telegram-бота
* 🌍 маршруты и геолокацию
* 🔔 систему напоминаний
* ⚡ real-time оптимизацию расписания

---

## ✨ Возможности

### 🧠 AI Planner

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

### 🌍 Маршруты и гео

* расчет времени в пути
* учет перемещений между событиями
* домашняя локация пользователя
* геосаджест

### 🔔 Уведомления

* Telegram-уведомления
* фоновые воркеры
* отложенные напоминания

### 🤖 Telegram бот

* deep-link авторизация
* быстрые команды
* уведомления
* взаимодействие с AI

---

## 🏗 Архитектура

```
Frontend (Next.js)
        │
        ▼
FastAPI Backend  ─── PostgreSQL
        │
        ├── Redis
        │
        ├── AI Worker
        │
        ├── Notification Worker
        │
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
* OpenAI / LLM providers
* Docker

### Frontend

* Next.js (App Router)
* React
* TypeScript
* Leaflet
* shadcn/ui

### Инфраструктура

* Docker Compose
* Worker-based архитектура
* Redis очереди
* Background processing

---

## 📦 Запуск проекта

### 1️⃣ Клонирование

```bash
git clone <repo>
cd helper
```

---

### 2️⃣ Настройка переменных окружения

```bash
cp .env.example .env
```

Заполни:

* БД
* Redis
* Telegram bot token
* AI provider ключи
* гео API ключи

---

### 3️⃣ Запуск

```bash
docker compose up --build
```

---

### 4️⃣ Миграции

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
| postgres  | база               |

---

## 🤖 Telegram авторизация

Используется deep-link:

```
https://t.me/<BOT_USERNAME>?start=<code>
```

Пользователь связывает аккаунт через Telegram.

---

## 🧪 Тесты

```bash
pytest
```

Включают:

* unit тесты логики
* интеграционные тесты
* тесты AI инструментов
* тесты уведомлений

---

## 📁 Структура проекта

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
docker-compose.yml
```

---

## 🎯 Roadmap

* голосовой ассистент
* realtime AI планирование
* mobile приложение
* multi-calendar синхронизация
* совместное планирование

---

## 🧑‍💻 Автор

Разрабатывается как полноценный AI-продукт планирования.

---

## ⭐ Почему проект сильный

* продуманная архитектура
* разделение AI и API
* воркер-подход
* реальная ценность продукта
* масштабируемость