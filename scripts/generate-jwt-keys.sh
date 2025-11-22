#!/bin/bash
# Generate RSA key pair for JWT signing

set -e

echo "🔑 Generating RSA key pair for JWT temporary tokens..."
echo

# Generate private key (2048-bit) - manage-api only
openssl genrsa -out jwt-private-key.pem 2048 2>/dev/null

# Extract public key - run-api only
openssl rsa -in jwt-private-key.pem -pubout -out jwt-public-key.pem 2>/dev/null

echo "✅ Keys generated successfully!"
echo
echo "=================================================="
echo "Private Key (for manage-api .env):"
echo "=================================================="
echo "INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=$(base64 -i jwt-private-key.pem | tr -d '\n')"
echo
echo "=================================================="
echo "Public Key (for run-api .env):"
echo "=================================================="
echo "INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=$(base64 -i jwt-public-key.pem | tr -d '\n')"
echo
echo "=================================================="
echo

# Clean up PEM files (keys stored in env vars)
rm jwt-private-key.pem jwt-public-key.pem

echo "✅ PEM files cleaned up. Copy the base64 keys above to your .env files."
echo

