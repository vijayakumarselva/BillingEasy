FROM python:3.11-slim

WORKDIR /app

# Install system deps:
#   build-essential  → compile cryptography, bcrypt, Pillow C extensions
#   libpq-dev        → psycopg2 (if ever needed)
#   poppler-utils    → pdf2image (PDF scanning feature)
#   libffi-dev       → cffi / cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
        libssl-dev \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["/bin/sh", "-c", "uvicorn server:app --host 0.0.0.0 --port $PORT"]
