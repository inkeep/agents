#!/bin/bash
# Generate RSA key pairs for JWT signing
#
# Usage:
#   pnpm generate:keys              # Generate both playground and copilot keys
#   pnpm generate:keys playground   # Generate playground keys only
#   pnpm generate:keys copilot      # Generate copilot keys only

set -e

generate_keypair() {
  local prefix="$1"
  local label="$2"

  local privfile
  privfile=$(mktemp)
  local pubfile
  pubfile=$(mktemp)

  openssl genrsa -out "$privfile" 2048 2>/dev/null
  openssl rsa -in "$privfile" -pubout -out "$pubfile" 2>/dev/null

  local priv_b64
  priv_b64=$(base64 -i "$privfile" | tr -d '\n')
  local pub_b64
  pub_b64=$(base64 -i "$pubfile" | tr -d '\n')

  echo
  echo "# $label"
  echo "${prefix}_PRIVATE_KEY=$priv_b64"
  echo "${prefix}_PUBLIC_KEY=$pub_b64"

  rm -f "$privfile" "$pubfile"
}

target="${1:-all}"

case "$target" in
  playground)
    generate_keypair "INKEEP_AGENTS_TEMP_JWT" "Playground JWT Keys"
    ;;
  copilot)
    generate_keypair "INKEEP_COPILOT_JWT" "Copilot JWT Keys"
    ;;
  all)
    generate_keypair "INKEEP_AGENTS_TEMP_JWT" "Playground JWT Keys"
    generate_keypair "INKEEP_COPILOT_JWT" "Copilot JWT Keys"
    ;;
  *)
    echo "Usage: $0 [playground|copilot|all]"
    exit 1
    ;;
esac

echo
