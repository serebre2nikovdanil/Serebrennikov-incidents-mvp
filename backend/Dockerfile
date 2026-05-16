FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /code

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml /code/

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

COPY app /code/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
