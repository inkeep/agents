# License Management Guide

This document explains how licenses are managed and distributed across the monorepo.

## Overview

All packages in this monorepo use the **Elastic License 2.0 with Supplemental Terms**. The license files are automatically synchronized from the root directory to all publishable packages during the build process.

## Structure

### Source Files (Root Directory)
- `LICENSE.md` - The main Elastic License 2.0 with Supplemental Terms
- `SUPPLEMENTAL_TERMS.md` - Additional terms that supplement the Elastic License

These are the **authoritative versions** - all changes should be made to these root files only.

### Distribution
The following packages automatically receive copies of both license files:
- `agents-cli`
- `agents-api`
- `agents-ui`
- `packages/agents-core`
- `packages/agents-sdk`
- `packages/create-agents`

## Automatic Synchronization

### When Licenses Are Synced
License files are automatically copied during:
1. **Build process** (`pnpm build`) - via prebuild hook
2. **Package preparation** (`pnpm prepack`) - before publishing
3. **Manual sync** (`pnpm sync:licenses`) - on demand

### How It Works
The `scripts/sync-licenses.mjs` script:
1. Reads `LICENSE.md` and `SUPPLEMENTAL_TERMS.md` from the root
2. Adds auto-generated headers indicating files are copied
3. Writes them to all target packages
4. Validates all copies were successful

## Updating Licenses

### To Update License Terms

1. **Edit the root files only:**
   ```bash
   # Edit the main license
   vim LICENSE.md
   
   # Edit supplemental terms
   vim SUPPLEMENTAL_TERMS.md
   ```

2. **Sync to all packages:**
   ```bash
   pnpm sync:licenses
   ```

3. **Verify the sync:**
   ```bash
   # Check that all packages received the updates
   ls packages/*/LICENSE.md agents-*/LICENSE.md
   ls packages/*/SUPPLEMENTAL_TERMS.md agents-*/SUPPLEMENTAL_TERMS.md
   ```

### Important Notes

⚠️ **NEVER edit license files directly in package directories** - they will be overwritten during the next sync.

⚠️ **Both files must exist** - The sync script will fail if either `LICENSE.md` or `SUPPLEMENTAL_TERMS.md` is missing from the root.

## Publishing Packages

When publishing packages via changesets:
1. The prebuild hook automatically runs `sync:licenses`
2. Both `LICENSE.md` and `SUPPLEMENTAL_TERMS.md` are included in the published package
3. The `files` field in each package.json ensures both files are packaged

## Troubleshooting

### License files not updating
Run manually: `pnpm sync:licenses`

### Build failing due to missing licenses
Ensure both root files exist:
```bash
ls LICENSE.md SUPPLEMENTAL_TERMS.md
```

### Package missing license files after publish
Check the package.json `files` array includes both:
```json
"files": [
  "dist",
  "README.md",
  "LICENSE.md",
  "SUPPLEMENTAL_TERMS.md"
]
```

## Adding New Packages

When adding a new publishable package:

1. Add the package path to `targetPackages` in `scripts/sync-licenses.mjs`
2. Include both license files in the package.json `files` array
3. Run `pnpm sync:licenses` to copy the files

## CI/CD Integration

The license sync is integrated into the build pipeline:
- Turbo includes `sync:licenses` as a dependency of the `build` task
- This ensures licenses are always up-to-date before building or publishing