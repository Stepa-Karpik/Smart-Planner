FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/workspace/backend

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend /workspace/backend
COPY bot /workspace/bot

RUN chmod +x /workspace/bot/entrypoint.sh

WORKDIR /workspace/backend
CMD ["sh", "/workspace/bot/entrypoint.sh"]
