# Используется Railway. Локальный docker compose эту сборку игнорирует —
# он использует backend/Dockerfile и frontend/Dockerfile.

# ── Этап 1: сборка фронтенда ────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./

# Пустая VITE_API_URL → axios использует относительные пути и попадает
# на тот же домен, где работает FastAPI (один сервис в проде).
ENV VITE_API_URL=
RUN npm run build

# ── Этап 2: рантайм бэкенда + статика ───────────────────────────────────
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /code

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    "fastapi==0.115.6" \
    "uvicorn[standard]==0.34.0" \
    "sqlalchemy==2.0.36" \
    "psycopg[binary]==3.2.3" \
    "pydantic==2.10.4" \
    "pydantic-settings==2.7.0" \
    "passlib==1.7.4" \
    "bcrypt==4.0.1" \
    "python-multipart==0.0.20" \
    "email-validator==2.2.0"

COPY backend/app /code/app
COPY --from=frontend-builder /app/dist /code/static

RUN mkdir -p /code/storage

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
