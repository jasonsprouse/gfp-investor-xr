# Production container for Fly.io - Good Faith Paradigm WebXR
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Copy application source code and assets
COPY . /app

# Expose standard server port
EXPOSE 8080

# Health check probe on root /
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

# Launch unified WebXR static & HTTP 402 API server
CMD ["python", "serve.py"]
