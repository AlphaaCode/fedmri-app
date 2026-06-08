FROM python:3.10-slim

WORKDIR /app

# Copy sources
COPY . /app

# Install build deps and requirements
RUN python -m pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir timm SimpleITK scikit-learn

EXPOSE 8001

CMD ["python", "main.py"]
