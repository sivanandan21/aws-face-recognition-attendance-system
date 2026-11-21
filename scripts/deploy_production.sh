#!/usr/bin/env bash
set -e

echo "=================================================="
echo "🚀 Auto-Deploying to Production EC2"
echo "=================================================="

APP_DIR="/home/ubuntu/aws-face-recognition-attendance-system"

if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    echo "1. Fetching latest commits from GitHub main..."
    git fetch origin main
    git reset --hard origin/main

    echo "2. Installing dashboard dependencies..."
    cd "$APP_DIR/dashboard"
    npm install --no-audit --prefer-offline || npm install

    echo "3. Restarting PM2 Attendance Dashboard..."
    pm2 restart attendance-dashboard || pm2 start npm --name "attendance-dashboard" -- run dev -- --host 0.0.0.0 --port 3000
    pm2 save || true

    echo "✅ Production deployment successful!"
else
    echo "Directory $APP_DIR not found, skipping local pull."
fi
