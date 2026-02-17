.PHONY: up down build migrate test backend-test frontend-build

up:
	docker compose up --build

down:
	docker compose down -v

build:
	docker compose build

migrate:
	cd backend && alembic upgrade head

test:
	cd backend && pytest -q

backend-test:
	docker compose -f docker-compose.test.yml up --build --abort-on-container-exit

frontend-build:
	docker compose build frontend
