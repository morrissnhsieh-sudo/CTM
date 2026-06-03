# Build context = repo root
FROM python:3.12-slim AS production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv

COPY apps/ai-service/requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

COPY apps/ai-service/src/ ./src/

EXPOSE 8001
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
