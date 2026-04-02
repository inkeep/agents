#!/bin/bash
# Generate RSA key pairs for JWT signing
#
# Usage:
#   pnpm generate:keys              # Generate both playground and copilot keys
#   pnpm generate:keys playground   # Generate playground keys only
#   pnpm generate:keys copilot      # Generate copilot keys only

set -e

generate_playground_keys() {
  local privfile pubfile
  privfile=$(mktemp)
  pubfile=$(mktemp)

  openssl genrsa -out "$privfile" 2048 2>/dev/null
  openssl rsa -in "$privfile" -pubout -out "$pubfile" 2>/dev/null

  local priv_b64 pub_b64
  priv_b64=$(base64 -i "$privfile" | tr -d '\n')
  pub_b64=$(base64 -i "$pubfile" | tr -d '\n')

  echo
  echo "# Playground JWT Keys (base64-encoded for .env)"
  echo "INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=$priv_b64"
  echo "INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=$pub_b64"

  rm -f "$privfile" "$pubfile"
}

generate_copilot_keys() {
  local privfile pubfile
  privfile=$(mktemp)
  pubfile=$(mktemp)

  openssl genrsa -out "$privfile" 2048 2>/dev/null
  openssl rsa -in "$privfile" -pubout -out "$pubfile" 2>/dev/null

  local priv_b64 kid pub_escaped
  priv_b64=$(base64 -i "$privfile" | tr -d '\n')
  kid="pg-$(openssl dgst -sha256 "$pubfile" | awk '{print $2}' | cut -c1-12)"
  pub_escaped=$(awk '{printf "%s\\n", $0}' "$pubfile" | sed 's/\\n$//')

  echo
  echo "# Copilot JWT Keys"
  echo "# Private key (base64-encoded)"
  echo "INKEEP_COPILOT_JWT_PRIVATE_KEY=$priv_b64"
  echo
  echo "# Public key (PEM)"
  echo "INKEEP_COPILOT_JWT_PUBLIC_KEY=\"$pub_escaped\""
  echo
  echo "# For app record config.webClient.publicKeys:"
  echo "#   kid: $kid"
  echo "#   algorithm: RS256"
  echo "#   publicKey: (the PEM above)"

  rm -f "$privfile" "$pubfile"
}

target="${1:-all}"

case "$target" in
  playground)
    generate_playground_keys
    ;;
  copilot)
    generate_copilot_keys
    ;;
  all)
    generate_playground_keys
    generate_copilot_keys
    ;;
  *)
    echo "Usage: $0 [playground|copilot|all]"
    exit 1
    ;;
esac

echo
