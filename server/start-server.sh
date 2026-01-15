#!/bin/bash

# Activate virtual environment and start the ingestion server
cd "$(dirname "$0")/.."

if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Creating one..."
    python3 -m venv venv
    source venv/bin/activate
    echo "📦 Installing dependencies..."
    pip install -r server/requirements.txt
else
    source venv/bin/activate
fi

echo "🚀 Starting ingestion server..."
python3 server/ingestion-server.py
