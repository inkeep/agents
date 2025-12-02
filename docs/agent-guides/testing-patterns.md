# Testing Patterns

This guide covers testing patterns for the Inkeep Agent Framework.

## Framework

- **Vitest** is the test framework
- 60-second timeouts for A2A interactions
- Each test worker gets an in-memory SQLite database

## Test Location & Naming

- Place tests in `__tests__/` directories adjacent to the code
- Name files: `*.test.ts` or `*.spec.ts`
- Run with `--run` flag to avoid watch mode

## Running Tests

```bash
# All tests
pnpm test --run

# Single package
cd <package> && pnpm test --run

# Single file
cd <package> && pnpm test --run <file-path>
```

## Test Structure

See existing tests for patterns:
- `agents-run-api/src/__tests__/` - Unit and integration tests
- `agents-manage-api/src/__tests__/` - API tests

## Example Pattern

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle success case', async () => {
    // Arrange
    // Act
    // Assert
  });

  it('should handle error case', async () => {
    // Test error handling
  });
});
```

## Coverage Requirements

- All new code paths must have test coverage
- Test both success and error cases
- For A2A communication, test end-to-end flows

