# Temporarily Ignored Biome Rules

This file documents Biome linting rules that have been temporarily disabled to allow `pnpm check` to pass. These rules should be re-enabled and the underlying code issues fixed as part of technical debt reduction.

## Rules Currently Disabled

### Accessibility (a11y)

#### `useSemanticElements` - **OFF**
- **What it does**: Ensures semantic HTML elements are used instead of generic divs/spans with roles
- **Files affected**: `agents-docs` and `agents-manage-ui` components
- **Why re-enable**: Improves accessibility and SEO by using proper semantic HTML

#### `useValidAriaRole` - **OFF**
- **What it does**: Validates that ARIA roles are used correctly
- **Files affected**: Various UI components with `role="button"` on non-button elements
- **Why re-enable**: Ensures proper accessibility compliance

#### `useButtonType` - **OFF**
- **What it does**: Requires explicit `type` attribute on button elements
- **Files affected**: `agents-manage-ui/src/components/graph/playground/ikp-message.tsx`
- **Why re-enable**: Prevents unintended form submissions when buttons are inside forms

### Correctness

#### `useUniqueElementIds` - **OFF**
- **What it does**: Prevents static string literals as element IDs in React components
- **Files affected**: Multiple components including graph markers and credential forms
- **Why re-enable**: Prevents ID collisions when components are reused multiple times

#### `noNestedComponentDefinitions` - **OFF**
- **What it does**: Prevents defining components inside other components
- **Files affected**: `mcp-servers/view-mcp-server-details.tsx`, `ui/calendar.tsx`
- **Why re-enable**: Nested components are recreated on every render, causing performance issues

#### `noUnusedFunctionParameters` - **OFF**
- **What it does**: Flags unused function parameters
- **Files affected**: Various component props that aren't being used
- **Why re-enable**: Helps identify dead code and incomplete refactorings

### Suspicious

#### `useIterableCallbackReturn` - **OFF**
- **What it does**: Ensures map callbacks always return a value
- **Files affected**: `sidebar/list.tsx`, `sidebar/folder.tsx`, `sidebar/transform.ts`
- **Why re-enable**: Prevents subtle bugs where map operations don't return expected values

#### `noAssignInExpressions` - **OFF**
- **What it does**: Prevents assignments within expressions (e.g., in return statements)
- **Files affected**: `lib/api/signoz-stats.ts`
- **Why re-enable**: Makes code more readable and prevents accidental assignments

### Complexity

#### `noUselessFragments` - **OFF**
- **What it does**: Removes unnecessary React fragments
- **Files affected**: `credentials/views/nango-providers-grid.tsx`
- **Why re-enable**: Cleaner JSX code without unnecessary wrapper elements

### Security

#### `noDangerouslySetInnerHtml` - **OFF**
- **What it does**: Warns against using dangerouslySetInnerHTML
- **Files affected**: `ui/chart.tsx`
- **Why re-enable**: Prevents XSS vulnerabilities from injecting untrusted HTML

## Rules Set to WARN (Should Eventually Be Fixed)

### Style
- `noNonNullAssertion`: WARN - Non-null assertions bypass TypeScript's null checks

### Correctness
- `noUnusedVariables`: WARN - Unused variables indicate incomplete refactoring
- `noUnusedImports`: WARN - Unused imports add unnecessary bundle size

### Suspicious  
- `noDocumentCookie`: WARN - Direct cookie manipulation should use Cookie Store API

### Performance
- `noImgElement`: WARN - Next.js Image component provides automatic optimization

### Complexity
- `noBannedTypes`: WARN - Using `Function` type is too permissive

## Action Items

1. **Priority 1 - Security & Accessibility**
   - [ ] Fix `noDangerouslySetInnerHtml` issues
   - [ ] Fix `useValidAriaRole` issues
   - [ ] Fix `useButtonType` issues

2. **Priority 2 - Code Quality**
   - [ ] Fix `noNestedComponentDefinitions` issues
   - [ ] Fix `useIterableCallbackReturn` issues
   - [ ] Fix `noAssignInExpressions` issues

3. **Priority 3 - Clean Code**
   - [ ] Fix `useUniqueElementIds` issues
   - [ ] Fix `noUselessFragments` issues
   - [ ] Fix `noUnusedFunctionParameters` issues
   - [ ] Fix `useSemanticElements` issues

## How to Re-enable Rules

To re-enable a rule, change its value from `"off"` to `"error"` in `biome.json`, then fix the resulting errors:

```json
// Change from:
"ruleName": "off"

// To:
"ruleName": "error"
```

For rules currently set to `"warn"`, change them to `"error"` once the issues are resolved.

## Notes

- Total rules disabled: 10
- Total rules set to warn: 6 (existing) + performance.noImgElement
- Main affected packages: `agents-manage-ui`, `agents-docs`
- Estimated effort to fix all issues: 2-3 days

---

*Last updated: September 11, 2025*
*Biome version: 2.2.4*
