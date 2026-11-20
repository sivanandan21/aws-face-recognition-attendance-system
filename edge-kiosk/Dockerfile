# ==========================================
# Edge Kiosk Container (Linux / Raspberry Pi)
# ==========================================
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies for OpenCV, V4L2 webcam, and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    v4l-utils \
    libv4l-dev \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persistent storage volume for offline SQLite queue
VOLUME ["/data"]
ENV DB_PATH=/data/offline_queue.db

# Run headless in Linux container with /dev/video0 pass-through
CMD ["python", "main.py", "--headless"]
