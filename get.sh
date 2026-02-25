#!/usr/bin/env bash
# get.sh — One-line remote installer for Orvex
# Usage: curl -fsSL https://raw.githubusercontent.com/berndheidemann/orvex/main/get.sh | bash
#
# Environment variables:
#   ORVEX_HOME   Install directory for the repo  (default: ~/.local/share/orvex)
#   PREFIX       Directory prefix for the binary  (default: ~/.local)
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

INSTALL_DIR="${ORVEX_HOME:-$HOME/.local/share/orvex}"
PREFIX="${PREFIX:-$HOME/.local}"

echo -e "${BOLD}Orvex installer${RESET}"
echo -e "  Repo:   $INSTALL_DIR"
echo -e "  Binary: $PREFIX/bin/orvex"
echo ""

# ── Clone or update ────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "  Updating existing installation..."
  git -C "$INSTALL_DIR" fetch origin
  git -C "$INSTALL_DIR" reset --hard origin/main
else
  echo -e "  Cloning orvex..."
  git clone https://github.com/berndheidemann/orvex.git "$INSTALL_DIR"
fi

# ── Delegate to install.sh ─────────────────────────────────────
bash "$INSTALL_DIR/install.sh" --prefix "$PREFIX"
