#!/bin/sh
# Test rapido: sintassi di tutti i js + harness del motore. Uso: sh tests/check.sh
set -e
cd "$(dirname "$0")/.."
for f in js/*.js sw.js tests/*.js; do node --check "$f"; done
echo "sintassi ok"
for t in tests/*.test.js; do echo "== $t"; node "$t"; done
