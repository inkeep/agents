#!/bin/bash

# Run tests with appropriate config based on environment
if [ -n "$CI" ]; then
  echo "Running tests in CI mode with sequential execution..."
  pnpm exec vitest --run --config vitest.config.ci.ts
else
  echo "Running tests in local mode with parallel execution..."
  pnpm exec vitest --run
fi
