#!/usr/bin/env bash
# Runs a command, then stops the dev Postgres + Mailpit (data stays in the volume), however it ends.
set -u
compose=(docker compose -f "$(dirname "$0")/../packages/db/docker-compose.yml")
trap '"${compose[@]}" stop' EXIT
trap 'exit 130' INT TERM
"$@"
