#!/usr/bin/env bash
# Install gitleaks + lefthook (pinned) into ~/.local/bin and register the git hooks
# from lefthook.yml. Idempotent; run from the repo root.
set -euo pipefail

GITLEAKS_VERSION=8.30.1
LEFTHOOK_VERSION=2.2.1

bin="$HOME/.local/bin"
mkdir -p "$bin"
export PATH="$bin:$PATH"

case "$(uname -m)" in
  x86_64) gl_arch=x64; lh_arch=x86_64 ;;
  aarch64 | arm64) gl_arch=arm64; lh_arch=arm64 ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

base_gl="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"
base_lh="https://github.com/evilmartians/lefthook/releases/download/v${LEFTHOOK_VERSION}"

if ! gitleaks version 2>/dev/null | grep -qF "$GITLEAKS_VERSION"; then
  curl -fsSL "$base_gl/gitleaks_${GITLEAKS_VERSION}_linux_${gl_arch}.tar.gz" | tar -xz -C "$bin" gitleaks
fi

if ! lefthook version 2>/dev/null | grep -qF "$LEFTHOOK_VERSION"; then
  curl -fsSL "$base_lh/lefthook_${LEFTHOOK_VERSION}_Linux_${lh_arch}" -o "$bin/lefthook"
  chmod +x "$bin/lefthook"
fi

# ~/.local/bin on PATH for later shells (git hooks run via the user's shell env)
rc="$HOME/.bashrc"
touch "$rc"
grep -qF '.local/bin' "$rc" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"

lefthook install
