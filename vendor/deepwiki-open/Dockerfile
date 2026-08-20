FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir poetry

COPY api/pyproject.toml api/poetry.lock ./
RUN poetry config virtualenvs.create false \
  && poetry install --no-root --only main --no-interaction --no-ansi

COPY api ./api

ENV NODE_ENV=production
ENV PORT=8001
EXPOSE 8001

CMD ["python", "-m", "api.main"]
