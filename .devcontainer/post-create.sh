#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing dependencies"
npm install

if [ ! -f .env ]; then
  echo ""
  echo "WARNING: .env not found."
  echo "Copy example.env to .env and fill in your SignalWire credentials:"
  echo "  SIGNALWIRE_API=..."
  echo "  SIGNALWIRE_PROJECT=..."
  echo "  SIGNALWIRE_SPACE=..."
  echo "  SDK_VERSION=stable|local"
  echo ""
fi
