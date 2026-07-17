FROM python:3.11-slim

WORKDIR /app

# System deps (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=120 -r requirements.txt

# Copy samples into the image for "replay real-world attack" demos
COPY samples ./samples
COPY app ./app
COPY .env.example ./.env

# Persist SQLite + simulated logs here (mounted as a volume)
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1
ENV MODE=simulation
ENV SIMULATED_LOG_PATH=/app/data/simulated_auth.log
ENV DATABASE_URL=sqlite:////app/data/detector.db
ENV CORS_ORIGINS=http://localhost,http://localhost:80,http://localhost:3000,http://frontend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
