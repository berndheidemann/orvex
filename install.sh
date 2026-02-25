#!/usr/bin/env bash
# install.sh — Orvex system-wide installation
# Creates a symlink to the orvex entry point in a directory on PATH.
# Usage: ./install.sh [--prefix /usr/local]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFIX="/usr/local"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    *) echo -e "${RED}Unknown argument: $1${RESET}"; exit 1 ;;
  esac
done
BIN_DIR="$PREFIX/bin"
LINK="$BIN_DIR/orvex"
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

# ── Ensure Deno is available ───────────────────────────────────
if ! command -v deno &>/dev/null; then
  echo -e "${BOLD}Deno not found — installing...${RESET}"
  curl -fsSL https://deno.land/install.sh | sh
  export DENO_INSTALL="${DENO_INSTALL:-$HOME/.deno}"
  export PATH="$DENO_INSTALL/bin:$PATH"
  echo -e "  ✅  Deno $(deno --version | head -1)"
fi

# ── Build binary if missing ────────────────────────────────────
if [ ! -f "$REPO_DIR/orvex-tui" ]; then
  echo -e "${BOLD}Building orvex-tui...${RESET}"
  (cd "$REPO_DIR" && deno task build)
else
  echo -e "  ✅  orvex-tui already built"
fi

# ── Create symlink ─────────────────────────────────────────────
mkdir -p "$BIN_DIR"

# Remove stale symlink or abort if a real file exists
if [ -L "$LINK" ]; then
  rm "$LINK"
elif [ -e "$LINK" ]; then
  echo -e "${RED}❌  $LINK exists and is not a symlink — remove it manually first.${RESET}"
  exit 1
fi

ln -s "$REPO_DIR/orvex" "$LINK"
echo -e "  ✅  $LINK → $REPO_DIR/orvex"

# ── PATH check ────────────────────────────────────────────────
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo ""
  echo -e "${YELLOW}⚠️   $BIN_DIR is not in your PATH.${RESET}"
  echo -e "    Add the following to your shell config (~/.zshrc / ~/.bashrc):"
  echo -e "      export PATH=\"$BIN_DIR:\$PATH\""
fi

# ── Verify ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}Orvex installed.${RESET}"
echo -e "  Usage: cd my-project && orvex [init]"
