#!/bin/zsh
# Runs answer.py with the repo's Gemini key and the KT service's Python env.
cd "$(dirname "$0")"
export GOOGLE_API_KEY=$(grep '^VITE_GEMINI_API_KEY=' ../../../.env | cut -d= -f2- | tr -d '"')
../../../vendor/deepwiki-open/.venv/bin/python -W ignore answer.py "$@" 2>&1 | grep -v -iE "warn|mlflow|deprecated|google.genai|^$|README|support for"
