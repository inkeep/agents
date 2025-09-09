# GitHub Actions Performance Optimization Guide

## 🎯 Executive Summary

After profiling your GitHub Actions workflows, I've identified that your current workflows take **~7.5 minutes** total (Test: ~4.3 min, Release: ~3.1 min). With the optimizations provided, you can reduce this to **~2-3 minutes** - a **60-73% improvement**.

## 📊 Current Performance Bottlenecks (Updated Profiling)

### Test Workflow (Average: 4m 15s)
| Job | Average Duration | Main Bottleneck |
|-----|------------------|-----------------|
| setup-and-build | 3m 3s | Artifact upload (75s) + Build (60s) |
| test | 4m 10s | Test execution (196s - 78% of time) |
| typecheck | 2m 8s | Typecheck execution (75s - 58% of time) |

**Key Issues:**
- **Artifact operations:** 75s upload + ~43s downloads = **118 seconds wasted**
- Jobs run **sequentially** instead of parallel
- **Test execution:** 3m 16s average (up to 4m 23s)
- No effective **caching** of build outputs
- Redundant dependency installations

### Release/Publish Workflow (Average: 3m 4s)
| Step | Duration | % of Total |
|------|----------|------------|
| Build packages | 2m 35s | 84% |
| Install dependencies | 19s | 10% |
| Other steps | 10s | 6% |

**Key Issues:**
- **Build time dominates:** 156s with no caching
- No Turborepo remote caching enabled
- Rebuilds everything from scratch
- No incremental TypeScript compilation

## 🚀 Optimization Strategies Implemented

### 1. Replace Artifacts with Caching
**Impact: Save 118 seconds per run**

Instead of:
```yaml
- name: Upload build artifacts  # 73s
- name: Download build artifacts # 23s each job
```

Use:
```yaml
- name: Setup build cache
  uses: actions/cache@v4
  with:
    path: |
      **/dist
      **/.next
      **/build
      **/.turbo
    key: ${{ runner.os }}-build-${{ github.sha }}
```

### 2. Parallelize Jobs
**Impact: Save 2-3 minutes**

Run test and typecheck simultaneously using matrix strategy:
```yaml
strategy:
  matrix:
    task: [test, typecheck]
```

### 3. Enable Concurrency Control
**Impact: Save resources and time**

Cancel outdated runs automatically:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### 4. Optimize Turborepo Usage
**Impact: Save 50-70% build time**

Enable remote caching:
```yaml
- name: Build packages
  run: pnpm build --cache-dir=.turbo
  env:
    TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
    TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

### 5. Package-Level Parallelization (Optional)
**Impact: Further 30-50% reduction for large test suites**

Split tests across packages:
```yaml
strategy:
  matrix:
    package:
      - '@inkeep/agents-manage-api'
      - '@inkeep/agents-run-api'
      - '@inkeep/agents-cli'
```

### 6. Release Workflow Optimizations
**Impact: Save 90-120 seconds (50-65% reduction)**

Key optimizations for the Release workflow:
- **Build caching:** Reuse builds from test runs
- **TypeScript incremental compilation:** Cache .tsbuildinfo files
- **Increased concurrency:** Use `--concurrency=200%` for parallel builds
- **Memory optimization:** Set `NODE_OPTIONS: --max-old-space-size=6144`

## 📁 New Workflow Files

I've created three optimized workflow files:

1. **`.github/workflows/test-optimized.yml`** - Single job with parallel execution
2. **`.github/workflows/test-improved.yml`** - Matrix-based parallel jobs
3. **`.github/workflows/release-optimized.yml`** - Optimized release workflow

## 🛠️ Setup Instructions

### 1. Enable the New Workflows

Choose one of the test workflow approaches:

```bash
# Option A: Use the single-job optimized version (recommended for simplicity)
mv .github/workflows/test.yml .github/workflows/test-original.yml
mv .github/workflows/test-optimized.yml .github/workflows/test.yml

# Option B: Use the matrix-based improved version (recommended for larger projects)
mv .github/workflows/test.yml .github/workflows/test-original.yml
mv .github/workflows/test-improved.yml .github/workflows/test.yml
```

Enable the optimized release workflow:
```bash
mv .github/workflows/release.yml .github/workflows/release-original.yml
mv .github/workflows/release-optimized.yml .github/workflows/release.yml
```

### 2. Set Up Turborepo Remote Caching (Optional but Recommended)

1. Sign up for [Vercel's Turborepo](https://turbo.build/repo)
2. Get your team's token and team name
3. Add these secrets to your GitHub repository:
   - `TURBO_TOKEN`
   - `TURBO_TEAM`

### 3. Monitor Performance

Use the provided profiling script:
```bash
# Make the script executable
chmod +x scripts/workflows/profile.mjs

# Profile all workflows (or use npm script)
node scripts/workflows/profile.mjs
# or
pnpm workflow:profile

# Profile specific workflow with details
node scripts/workflows/profile.mjs --workflow "Test" --verbose
# or
pnpm workflow:profile:verbose --workflow "Test"

# Analyze last 20 runs
node scripts/workflows/profile.mjs --limit 20
```

## 📈 Expected Improvements

| Workflow | Before | After | Improvement |
|----------|--------|-------|-------------|
| **Test Workflow** | 4m 15s avg | 1.5-2 min | 53-65% ⬇️ |
| - Artifact Transfer | 118s | 0s | 100% ⬇️ |
| - Test + Typecheck | Sequential (6m+) | Parallel (4m) | 33% ⬇️ |
| - Build Caching | None | Full | 60-80% ⬇️ |
| **Release Workflow** | 3m 4s avg | 1-1.5 min | 51-67% ⬇️ |
| - Build Time | 2m 35s | 30-60s | 61-81% ⬇️ |
| - Dependency Install | 19s | 5-10s | 47-74% ⬇️ |
| **Total CI Time** | ~7.3 min | ~2.5-3.5 min | 52-66% ⬇️ |

## 🔄 Further Optimizations

### For Test Execution (205s current)
1. **Enable package-level parallelization** in the workflow (already configured, just set `if: true`)
2. **Use Vitest's built-in parallelization**:
   ```json
   // vitest.config.ts
   {
     "test": {
       "threads": true,
       "maxThreads": 4
     }
   }
   ```
3. **Split large test files** into smaller, focused test suites
4. **Use test sharding** for extremely large test suites

### For TypeCheck (75s current)
1. **Use project references** in TypeScript for incremental builds
2. **Enable `skipLibCheck: true`** in tsconfig.json if not already
3. **Consider using `tsc --build`** mode for monorepos

### For Build Performance (156s in release)
1. **Enable SWC** or **esbuild** instead of default TypeScript compiler
2. **Use Turbopack** for Next.js applications
3. **Implement incremental builds** with proper cache keys

## 🎯 Quick Wins Checklist

- [x] Replace artifacts with caching
- [x] Enable job parallelization
- [x] Add concurrency control
- [x] Create profiling script
- [ ] Enable Turborepo remote caching
- [ ] Split tests by package
- [ ] Optimize Vitest configuration
- [ ] Enable incremental TypeScript builds

## 📝 Maintenance Notes

1. **Monitor cache hit rates** - Low hit rates indicate cache key issues
2. **Review slow steps weekly** using the profiling script
3. **Update dependencies regularly** - Newer versions often include performance improvements
4. **Consider self-hosted runners** for consistently slow GitHub-hosted runner performance

## 🤝 Need Help?

Run the profiling script regularly to track improvements:
```bash
pnpm workflow:profile:verbose
# or directly:
node scripts/workflows/profile.mjs --verbose
```

The script will provide specific recommendations based on your actual workflow performance.
