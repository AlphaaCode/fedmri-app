FROM python:3.10-slim

WORKDIR /app

# Install Python deps first for better layer caching.
# Flower (flwr) is ONLY imported when FL_MODE=flower (see main.py). The default
# mock engine and the live FL-test path (realfl.py) need only numpy + scikit-learn,
# so we install the core set from requirements.txt and treat flwr as best-effort —
# the image must still build in the default mock configuration.
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && \
    grep -v '^flwr' requirements.txt > /tmp/requirements.core.txt && \
    pip install --no-cache-dir -r /tmp/requirements.core.txt && \
    (pip install --no-cache-dir flwr==0.24.0 \
        || echo ">> flwr not installed — FL_MODE=flower unavailable; mock mode is unaffected.")

# App source (shadowed by the bind mount in docker-compose for live reload).
COPY . /app

EXPOSE 8002

# main.py defines `app` but has no __main__/uvicorn.run block, so start via the CLI.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
