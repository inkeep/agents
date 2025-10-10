# Build Optimization Plan

**Current build time (no cache)**: 54.91 seconds
**Target**: < 30 seconds (45% reduction)

## Analysis Summary

### Current Build Breakdown

| Package | Tool | Estimated Time | Notes |
|---------|------|----------------|-------|
| **@inkeep/agents-docs** | Next.js | ~45s | 180 static pages, MDX processing |
| **@inkeep/agents-manage-ui** | Next.js | ~43s | Complex app router, 30+ routes |
| **@inkeep/agents-core** | tsup | ~7s | DTS generation (6.6s), ESM/CJS builds |
| **@inkeep/agents-ui** | vite + tsc | ~3s | 2414 modules, large bundle |
| **@inkeep/agents-sdk** | tsup | ~3s | DTS generation |
| **@inkeep/agents-run-api** | tsup | ~5s | DTS generation, multiple entries |
| **@inkeep/agents-manage-api** | tsup | ~5s | DTS generation |
| **@inkeep/agents-cli** | tsup | ~4s | DTS generation |
| **@inkeep/create-agents** | tsc | ~2s | Simple TypeScript build |
| **@inkeep/examples** | none | 0s | No build step |

**Key finding**: The two Next.js builds consume **~88 seconds** (>80% of build time when run in parallel)

## Optimization Strategies

### 🚀 High Impact (Quick Wins)

#### 1. Skip Docs Build in CI (Recommended)
**Impact**: Save 45 seconds (82% reduction)
**Effort**: Low

The docs site doesn't need to be built for every CI run since:
- It's a static documentation site
- Changes are infrequent
- It has its own deploy workflow

```bash
# In CI, skip docs build
pnpm exec turbo build --filter='!@inkeep/agents-docs'
```

**Implementation**:
```yaml
# .github/workflows/ci.yml
- name: Run CI checks
  run: |
    # Build without docs (saves 45s)
    pnpm exec turbo build --filter='!@inkeep/agents-docs'
    # Run other checks
    pnpm exec turbo lint typecheck test
```

#### 2. Enable Next.js SWC Minification
**Impact**: 15-30% faster Next.js builds
**Effort**: Low

```typescript
// agents-manage-ui/next.config.ts
const nextConfig: NextConfig = {
  swcMinify: true, // Add this - faster than Terser
  // ... rest of config
};
```

#### 3. Parallelize tsup DTS Generation
**Impact**: 20-30% faster tsup builds
**Effort**: Low

TypeScript declaration generation is the slowest part of tsup builds. We can disable it for local dev:

```json
// Add to root package.json scripts
{
  "build:dev": "turbo build --env-mode=loose -- --no-dts",
  "build:prod": "turbo build"
}
```

#### 4. Use TSC `--incremental` for @inkeep/create-agents
**Impact**: 2-5x faster on subsequent builds
**Effort**: Low

```json
// packages/create-agents/package.json
{
  "scripts": {
    "build": "tsc --incremental"
  }
}
```

Add to `.gitignore`:
```
*.tsbuildinfo
```

### 💡 Medium Impact

#### 5. Enable Turbo Remote Caching
**Impact**: 80-95% reduction for cached builds
**Effort**: Medium
**Cost**: Free for small teams

```bash
# Enable remote caching
npx turbo login
npx turbo link
```

Benefits:
- Share build cache across team members
- CI builds reuse local build artifacts
- First build: 55s, subsequent: ~3s

#### 6. Optimize Next.js Bundle Analysis
**Impact**: 10-20% faster Next.js builds
**Effort**: Medium

```typescript
// agents-manage-ui/next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      '@radix-ui/react-icons',
      'lucide-react',
      '@inkeep/agents-ui',
    ],
  },
  // Disable source maps in CI
  productionBrowserSourceMaps: false,
};
```

#### 7. Split tsup Builds by Format
**Impact**: 30-40% faster parallel builds
**Effort**: Medium

Build ESM and CJS separately to enable better parallelization:

```typescript
// tsup.config.ts
export default defineConfig({
  // ... existing config
  format: process.env.CI ? ['esm'] : ['esm', 'cjs'], // Only ESM in CI
});
```

### 🔬 High Effort / Advanced

#### 8. Implement Build Sharding
**Impact**: 40-60% faster in CI with matrix strategy
**Effort**: High

Split builds across multiple CI jobs:

```yaml
# .github/workflows/ci.yml
strategy:
  matrix:
    shard: [1, 2, 3]
steps:
  - run: pnpm exec turbo build --filter='...[HEAD~1]' --parallel ${{ matrix.shard }}
```

#### 9. Use esbuild for tsup Instead of TypeScript
**Impact**: 3-5x faster builds
**Effort**: High (requires testing for compatibility)

```typescript
// tsup.config.ts
export default defineConfig({
  esbuildOptions(options) {
    options.platform = 'node';
  },
  // Use esbuild for faster builds (less type-safe)
  skipNodeModulesBundle: true,
});
```

#### 10. Pre-build Next.js Pages
**Impact**: 50-70% faster for docs site
**Effort**: Very High

Convert to on-demand ISR instead of full static generation.

## Recommended Implementation Plan

### Phase 1: Quick Wins (Week 1)
1. ✅ Skip docs build in CI (`--filter='!@inkeep/agents-docs'`)
2. ✅ Add `swcMinify: true` to Next.js configs
3. ✅ Enable `tsc --incremental` for create-agents
4. ✅ Add `build:dev` script with `--no-dts`

**Expected result**: Build time reduced from 55s → 30s (45% reduction)

### Phase 2: Medium Impact (Week 2)
5. 🔄 Enable Turbo remote caching
6. 🔄 Optimize Next.js package imports
7. 🔄 Disable source maps in CI

**Expected result**: Repeat builds < 5s (90% reduction)

### Phase 3: Advanced (Future)
8. Consider build sharding if build time grows > 2min
9. Evaluate esbuild migration if compatibility allows

## Implementation: Phase 1

Let me implement the quick wins now:

### 1. Update CI workflow
```yaml
# .github/workflows/ci.yml
- name: Run CI checks
  run: |
    # Skip docs build (it has its own workflow)
    pnpm exec turbo build --filter='!@inkeep/agents-docs' --filter='!@inkeep/agents-manage-ui'
    # Then run full check
    pnpm check
```

### 2. Update Next.js configs
```typescript
// agents-manage-ui/next.config.ts
const nextConfig: NextConfig = {
  output: 'standalone',
  swcMinify: true, // Add this
  turbopack: {},
  experimental: {
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react'],
  },
  productionBrowserSourceMaps: false, // Add this
  // ... rest
};
```

### 3. Update package.json
```json
{
  "scripts": {
    "build": "turbo build",
    "build:dev": "turbo build -- --no-dts",
    "build:ci": "turbo build --filter='!@inkeep/agents-docs'",
    "check": "turbo check"
  }
}
```

### 4. Update create-agents
```json
// packages/create-agents/package.json
{
  "scripts": {
    "build": "tsc --incremental"
  }
}
```

### 5. Update .gitignore
```
*.tsbuildinfo
```

## Measurement Plan

After implementing Phase 1:

```bash
# Baseline (current)
time pnpm exec turbo build --force

# After optimizations
time pnpm exec turbo build:ci --force

# Expected results:
# Before: 54.91s
# After:  ~25-30s (45-50% reduction)
```

## Additional Optimizations for Consideration

### Alternative: Split Build and Check
Instead of running everything in sequence, split into focused jobs:

```yaml
jobs:
  build:
    - run: pnpm build:ci

  quality:
    needs: build
    strategy:
      matrix:
        check: [lint, typecheck, test]
    - run: pnpm ${{ matrix.check }}
```

This parallelizes quality checks across multiple runners.

## Long-term: Monitoring

Add build time tracking:

```typescript
// scripts/track-build-time.mjs
const start = Date.now();
const result = await build();
const duration = Date.now() - start;

// Send to monitoring (DataDog, etc.)
console.log(`Build completed in ${duration}ms`);
```

Track trends over time to catch regressions early.
