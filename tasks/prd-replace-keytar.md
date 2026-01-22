# PRD: Replace Keytar with @napi-rs/keyring

## Introduction

Replace the deprecated `keytar` package with `@napi-rs/keyring` across all packages in the agents monorepo. Keytar was archived in December 2022 when GitHub sunset the Atom organization, and is no longer maintained. The replacement addresses build complexity (native module compilation requires node-gyp, Python, and platform-specific build tools) and ensures long-term maintainability with an actively developed alternative.

### Why @napi-rs/keyring?

After researching alternatives, `@napi-rs/keyring` is the recommended replacement because:

1. **100% API compatible** with keytar (drop-in replacement)
2. **Prebuilt binaries** for all major platforms - no compilation required on install
3. **No libsecret dependency** on Linux - works in headless environments like WSL2
4. **Actively maintained** - v1.2.0 released September 2025, ~77k weekly downloads
5. **Credible maintainer** - Microsoft OSS fund recipient
6. **Rust-based** - Uses keyring-rs crate with native secret store implementation

Other alternatives considered:
- **Electron safeStorage**: Only works within Electron apps, not CLI/Node.js
- **@zowe/secrets-for-zowe-sdk**: Enterprise-focused, heavier dependency
- **Platform-specific packages**: Would require maintaining multiple implementations

## Goals

- Remove all dependencies on the deprecated `keytar` package
- Eliminate native module build complexity during installation
- Maintain full functionality of the existing credential storage system
- Support all three platforms (macOS, Windows, Linux) with prebuilt binaries
- Improve Linux compatibility by removing libsecret/dbus requirement

## User Stories

### US-001: Update KeyChainStore to use @napi-rs/keyring
**Description:** As a developer, I need the core KeyChainStore class to use the new keyring library so all dependent packages inherit the change.

**Acceptance Criteria:**
- [ ] Replace `keytar` import with `@napi-rs/keyring` in `packages/agents-core/src/credential-stores/keychain-store.ts`
- [ ] Update dynamic import to use new package name
- [ ] Adapt API calls to @napi-rs/keyring's Entry-based API
- [ ] Maintain existing public interface (get, set, has, delete, findAllCredentials, clearAll)
- [ ] Update error handling for new library's error types
- [ ] Typecheck passes (`pnpm typecheck`)

### US-002: Update package.json dependencies
**Description:** As a developer, I need the package dependencies updated so the new library is installed correctly.

**Acceptance Criteria:**
- [ ] Remove `keytar` from `packages/agents-core/package.json` (optional dependency)
- [ ] Remove `keytar` from `agents-cli/package.json` (regular dependency)
- [ ] Remove `keytar` from `create-agents-template/package.json`
- [ ] Add `@napi-rs/keyring` to `packages/agents-core/package.json` as optional dependency
- [ ] Add `@napi-rs/keyring` to `agents-cli/package.json` as regular dependency
- [ ] Run `pnpm install` successfully without native compilation

### US-003: Remove keytar build script
**Description:** As a developer, I want to remove the keytar-specific build automation since the new library has prebuilt binaries.

**Acceptance Criteria:**
- [ ] Delete `agents-cli/scripts/ensure-keytar.mjs`
- [ ] Remove `postinstall` script reference from `agents-cli/package.json` (if only for keytar)
- [ ] Verify `pnpm install` works on a fresh clone without build tools

### US-004: Update unit tests
**Description:** As a developer, I need the unit tests updated to mock the new library's API.

**Acceptance Criteria:**
- [ ] Update mocks in `packages/agents-core/src/__tests__/credentials/keychain-store.test.ts`
- [ ] Replace keytar API mocks with @napi-rs/keyring Entry class mocks
- [ ] All unit tests pass (`pnpm test`)
- [ ] Test coverage remains at same level or higher

### US-005: Update integration tests
**Description:** As a developer, I need integration tests to verify the new library works with real system keychains.

**Acceptance Criteria:**
- [ ] Update `packages/agents-core/src/__tests__/credentials/keychain-store.integration.test.ts`
- [ ] Verify CRUD operations work with real keychain
- [ ] Verify service isolation between stores
- [ ] Verify special character and unicode support
- [ ] All integration tests pass

### US-006: Update CLI credentials utility
**Description:** As a developer, I need the CLI credentials utility to work with the updated KeyChainStore.

**Acceptance Criteria:**
- [ ] Review `agents-cli/src/utils/credentials.ts` for any keytar-specific code
- [ ] Verify CLI authentication flow works end-to-end
- [ ] Verify profile-based credential management works
- [ ] Manual test: `agents login` stores credentials correctly
- [ ] Manual test: `agents logout` removes credentials correctly

### US-007: Update documentation and error messages
**Description:** As a user, I need updated error messages and documentation that reference the correct library.

**Acceptance Criteria:**
- [ ] Update `getKeychainUnavailableMessage()` in credentials.ts if it references keytar
- [ ] Update any inline comments referencing keytar
- [ ] Update AGENTS.md if it mentions keytar setup requirements

### US-008: Update template project
**Description:** As a developer using the template, I need it to use the new library.

**Acceptance Criteria:**
- [ ] Verify `create-agents-template/apps/shared/credential-stores.ts` works with updated agents-core
- [ ] No direct keytar references in template code
- [ ] Template builds and runs successfully

### US-009: Configure build to externalize native module
**Description:** As a developer, I need the build configuration updated to mark @napi-rs/keyring as an external dependency so the native `.node` binary is not bundled.

**Acceptance Criteria:**
- [ ] Identify build configuration files for agents-core (tsdown.config.ts, rollup.config.js, or similar)
- [ ] Add `@napi-rs/keyring` to the external dependencies list in the build config
- [ ] Ensure the native module is loaded at runtime, not bundled
- [ ] `pnpm build` completes successfully in packages/agents-core
- [ ] Typecheck passes (`pnpm typecheck`)

### US-010: Configure CLI build to externalize native module
**Description:** As a developer, I need the CLI build configuration updated to handle the native module correctly.

**Acceptance Criteria:**
- [ ] Identify build configuration files for agents-cli
- [ ] Add `@napi-rs/keyring` to the external dependencies list in the build config
- [ ] `pnpm build` completes successfully in agents-cli
- [ ] Typecheck passes (`pnpm typecheck`)

### US-011: Final verification - all commands pass
**Description:** As a developer, I need to verify that all standard development commands work correctly after the migration.

**Acceptance Criteria:**
- [ ] `pnpm install` completes successfully (no native compilation errors)
- [ ] `pnpm build` completes successfully across all packages
- [ ] `pnpm test` completes successfully (all tests pass)
- [ ] `pnpm typecheck` completes successfully (no type errors)
- [ ] `pnpm lint` completes successfully (if applicable)
- [ ] No keytar references remain in the codebase (search for "keytar" returns no results except maybe CHANGELOG or migration notes)

## Functional Requirements

- **FR-1:** The system must store credentials in the OS keychain using @napi-rs/keyring
- **FR-2:** The system must retrieve credentials from the OS keychain
- **FR-3:** The system must delete credentials from the OS keychain
- **FR-4:** The system must list all credentials for a given service prefix
- **FR-5:** The system must gracefully handle unavailable keychain (return null, not throw)
- **FR-6:** The system must maintain service isolation using the existing naming convention (`inkeep-agent-framework-{storeId}`)
- **FR-7:** The system must work on macOS (Keychain), Windows (Credential Manager), and Linux (secret service or file-based fallback)
- **FR-8:** The system must install without requiring native compilation tools (node-gyp, Python, etc.)

## Non-Goals

- **No credential migration**: Existing stored credentials will NOT be automatically migrated. Users will need to re-authenticate after the update. This is acceptable because:
  - The service names may differ between libraries
  - Migration adds complexity and potential security concerns
  - Re-authentication is a simple one-time action
- **No backwards compatibility layer**: We will not maintain dual support for both keytar and @napi-rs/keyring
- **No encryption changes**: We are not changing how credentials are encrypted; we're only changing the library that interfaces with the OS keychain
- **No new credential storage features**: This is a like-for-like replacement, not a feature enhancement

## Technical Considerations

### API Differences

**Keytar API (current):**
```typescript
import keytar from 'keytar';
await keytar.setPassword(service, account, password);
const password = await keytar.getPassword(service, account);
await keytar.deletePassword(service, account);
const credentials = await keytar.findCredentials(service);
```

**@napi-rs/keyring API (new):**
```typescript
import { Entry } from '@napi-rs/keyring';
const entry = new Entry(service, account);
entry.setPassword(password);  // synchronous
const password = entry.getPassword();  // synchronous
entry.deletePassword();  // synchronous
// Note: findCredentials equivalent needs investigation
```

### Key Implementation Notes

1. **Sync vs Async**: @napi-rs/keyring methods are synchronous while keytar was async. The KeyChainStore wrapper can maintain its async interface for backwards compatibility.

2. **findCredentials**: May need alternative implementation - investigate if @napi-rs/keyring supports listing all credentials for a service, or implement workaround.

3. **Error Handling**: Error types will differ; update catch blocks accordingly.

4. **Dynamic Import**: Keep dynamic import pattern for optional dependency handling:
   ```typescript
   this.keyring = (await import('@napi-rs/keyring')).Entry;
   ```

### Platform Support Matrix

| Platform | Keytar Backend | @napi-rs/keyring Backend |
|----------|---------------|-------------------------|
| macOS | Keychain | Keychain (via Security framework) |
| Windows | Credential Manager | Credential Manager (via Windows API) |
| Linux | libsecret/dbus | Native Rust implementation (no libsecret needed) |

### Dependencies

Current:
- `keytar: ^7.9.0` (archived, requires native build)

New:
- `@napi-rs/keyring: ^1.2.0` (active, prebuilt binaries)

## Success Metrics

- `pnpm install` completes without native compilation on all platforms
- All existing tests pass after migration
- CLI authentication flow works on macOS, Windows, and Linux
- No regressions in credential storage functionality
- Reduced installation time due to eliminated compilation step

## Open Questions

1. **findCredentials equivalent**: Does @napi-rs/keyring support listing all credentials for a service? If not, how should we implement `findAllCredentials()` and `clearAll()`?
   - Potential solution: Maintain a separate index of stored keys in a known location

2. **Service name compatibility**: Will credentials stored with the same service/account names be accessible, or does @napi-rs/keyring use a different internal format?
   - This determines if migration is truly impossible or just not worth the effort

3. **Linux headless behavior**: How does @napi-rs/keyring behave in headless Linux environments without a desktop? Does it fall back gracefully?

## References

- [keytar (archived)](https://github.com/atom/node-keytar)
- [@napi-rs/keyring GitHub](https://github.com/Brooooooklyn/keyring-node)
- [@napi-rs/keyring npm](https://www.npmjs.com/package/@napi-rs/keyring)
- [VS Code migration to safeStorage](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray)
- [Azure SDK migration issue](https://github.com/Azure/azure-sdk-for-js/issues/29288)
- [MSAL migration issue](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/7170)
- [Joplin keytar replacement discussion](https://github.com/laurent22/joplin/issues/8829)
