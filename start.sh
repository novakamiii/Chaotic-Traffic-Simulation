#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║        THE WAIT — Avant Garde Traffic        ║"
echo "  ║    2.5D Intersection of Life & Absurdity     ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  PHP server: http://localhost:8000"
echo ""

npx concurrently \
  --names "PHP,VITE" \
  --prefix-colors "yellow,cyan" \
  "php -S localhost:8000 -t \"$SCRIPT_DIR\"" \
  "npx vite build --watch --config \"$SCRIPT_DIR/vite.config.js\""
