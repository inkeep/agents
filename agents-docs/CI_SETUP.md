# CI/CD Setup Documentation

## GitHub Secrets Configuration

The following secrets need to be configured in GitHub repository settings for the coverage workflow to function properly:

### Required Secrets

1. **`CI_ANTHROPIC_API_KEY`** (Required for integration tests)
   - Purpose: Dedicated API key for CI/CD testing with restricted quotas
   - Setup: Create a separate Anthropic API key specifically for CI
   - Permissions: Minimal permissions, low rate limits
   - Best Practice: Use a separate account or project key, not production keys

2. **`CI_OPENAI_API_KEY`** (Optional)
   - Purpose: Dedicated OpenAI API key for CI/CD testing
   - Setup: Create a separate OpenAI API key for CI
   - Permissions: Minimal permissions, restricted quotas
   - Best Practice: Only add if OpenAI integration tests are needed

### Setting Up Secrets

1. Navigate to your repository on GitHub
2. Go to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with the appropriate name and value
5. Ensure secrets are available to the workflows

### Security Best Practices

1. **Use Dedicated CI Keys**: Never use production API keys in CI
2. **Implement Rate Limiting**: Configure API keys with minimal quotas
3. **Rotate Keys Regularly**: Update CI keys quarterly
4. **Mock When Possible**: Use mocked services for most tests
5. **Audit Access**: Regularly review who has access to secrets

## Workflow Configuration

The coverage workflow (`.github/workflows/coverage.yml`) runs on:
- Push to main branch
- Pull requests targeting main branch

### Environment Variables

The workflow sets these environment variables:

```yaml
env:
  ENVIRONMENT: test
  CI_ANTHROPIC_API_KEY: ${{ secrets.CI_ANTHROPIC_API_KEY }}
  CI_OPENAI_API_KEY: ${{ secrets.CI_OPENAI_API_KEY }}
  USE_MOCKED_AI_SERVICES: true
```

### Mocking Strategy

By default, `USE_MOCKED_AI_SERVICES=true` ensures most tests use mocked responses. Only integration tests that specifically require real API calls will use the CI keys.

## Local Development

For local development, create a `.env` file:

```bash
# .env
ENVIRONMENT=development
DATABASE_URL=your_pg_database_url_here
ANTHROPIC_API_KEY=your_dev_key_here
OPENAI_API_KEY=your_dev_key_here  # Optional
USE_MOCKED_AI_SERVICES=false  # Set to true to use mocks
```

### Running Coverage Locally

```bash
# Run full coverage suite
pnpm coverage

# Run with mocked services
USE_MOCKED_AI_SERVICES=true pnpm test:coverage

# Run differential coverage
pnpm coverage:diff

# Enforce coverage standards
pnpm coverage:enforce
```

## Troubleshooting

### Common Issues

1. **Coverage workflow fails with "API key not found"**
   - Ensure `CI_ANTHROPIC_API_KEY` is set in GitHub secrets
   - Check that the secret name matches exactly

2. **Tests timeout in CI**
   - Verify API keys have sufficient quota
   - Check if services are being properly mocked
   - Consider increasing test timeouts

3. **Coverage drops unexpectedly**
   - Run `pnpm coverage:diff` locally to identify issues
   - Check if new code is missing tests
   - Verify all packages are being discovered

### Debug Commands

```bash
# Check which packages are discovered
node -e "console.log(require('./scripts/merge-coverage.mjs').discoverPackages())"

# Verify coverage configuration
node -e "console.log(require('./coverage.config.js').getMonorepoThresholds())"

# Test badge generation
node scripts/generate-badges.mjs
```

## Monitoring

### Coverage Artifacts

Each workflow run produces:
- `coverage-report`: Markdown and JSON summaries
- Individual LCOV files for each package
- Generated badges

### PR Comments

The workflow automatically:
1. Comments coverage report on PRs
2. Updates existing comments instead of creating new ones
3. Shows package-by-package breakdown

### Dashboard

Add coverage badge to README:

```markdown
[![Test Coverage](https://img.shields.io/badge/coverage-38.9%25-orange)](./coverage/badges.md)
```

## Maintenance

### Quarterly Review Checklist

- [ ] Review and update coverage thresholds
- [ ] Rotate CI API keys
- [ ] Update package discovery logic if needed
- [ ] Review and archive old coverage artifacts
- [ ] Update documentation with new patterns

### Adding New Packages

New packages are automatically discovered if they have:
1. A `package.json` file
2. A `vitest.config.ts` file

No manual configuration needed!

---
_Last Updated: December 2024_