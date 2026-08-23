#!/bin/sh
set -eu

for migration in /migrations/*.sql; do
  echo "applying ${migration}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration}"
done
