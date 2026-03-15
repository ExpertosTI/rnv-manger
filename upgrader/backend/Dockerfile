FROM python:3.12-slim

WORKDIR /app

# Instalar Docker CLI (necesario si llamamos comandos directos o via SDK)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Por defecto arrancar el servidor web de FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
