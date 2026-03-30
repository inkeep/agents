#!/bin/bash
# Generate RSA key pair for JWT signing

set -e

# Generate private key (2048-bit) - manage-api only
openssl genrsa -out jwt-private-key.pem 2048 2>/dev/null

# Extract public key - run-api only
openssl rsa -in jwt-private-key.pem -pubout -out jwt-public-key.pem 2>/dev/null

echo
echo "# Temporary JWT Keys for Playground"
echo "INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=$(base64 -i jwt-private-key.pem | tr -d '\n')"
echo "INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=$(base64 -i jwt-public-key.pem | tr -d '\n')"
echo

# Clean up PEM files (keys are in the output above)
rm -f jwt-private-key.pem jwt-public-key.pem
