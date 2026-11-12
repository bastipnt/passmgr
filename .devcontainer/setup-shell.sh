#!/usr/bin/env bash
# Hook .devcontainer/aliases.sh into ~/.bashrc. Idempotent; run from the repo root.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/aliases.sh"
rc="$HOME/.bashrc"

touch "$rc"
grep -qF "$src" "$rc" || echo "[ -f \"$src\" ] && . \"$src\"" >> "$rc"
