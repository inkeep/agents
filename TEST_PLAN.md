# Test Plan for Nango Secret Key Error Handling

## Overview
This test plan verifies the improved error handling for missing or invalid `NANGO_SECRET_KEY` environment variable.

## Test Scenarios

### Scenario 1: Missing NANGO_SECRET_KEY
**Setup:**
```bash
# Comment out or leave empty
NANGO_SECRET_KEY=
```

**Expected Behavior:**
1. Navigate to `http://localhost:3000/default/projects/andrew/mcp-servers/new`
2. A yellow/amber warning banner should appear at the top of the page with:
   - Alert icon
   - Title: "Nango Configuration Error"
   - Message: "NANGO_SECRET_KEY not set"
   - Link to Nango setup guide in documentation

3. When clicking on a popular MCP server that requires OAuth:
   - OAuth dialog should show clearer error message instead of "Cannot read properties of undefined (reading 'query')"
   - Error should indicate: "NANGO_SECRET_KEY environment variable is not configured. Please set it up to enable OAuth authentication."

### Scenario 2: Invalid NANGO_SECRET_KEY Format
**Setup:**
```bash
NANGO_SECRET_KEY=invalid_key_without_sk_prefix
```

**Expected Behavior:**
1. Navigate to MCP servers page
2. Warning banner should show:
   - Message: "NANGO_SECRET_KEY has invalid format (should start with 'sk-')"
   - Link to setup guide

### Scenario 3: Valid NANGO_SECRET_KEY
**Setup:**
```bash
NANGO_SECRET_KEY=sk-your-actual-key-here
```

**Expected Behavior:**
1. No warning banner appears
2. OAuth flow works normally for MCP servers

## API Endpoints to Test

### 1. Health Check Endpoint
**Request:**
```bash
GET /tenants/{tenantId}/nango/health
```

**Expected Responses:**

**When not configured:**
```json
{
  "status": "not_configured",
  "configured": false,
  "error": "NANGO_SECRET_KEY not set"
}
```

**When invalid format:**
```json
{
  "status": "invalid_format",
  "configured": false,
  "error": "NANGO_SECRET_KEY has invalid format (should start with \"sk-\")"
}
```

**When configured:**
```json
{
  "status": "ok",
  "configured": true
}
```

### 2. OAuth Login Endpoint
**Request:**
```bash
GET /oauth/login?tenantId=default&projectId=andrew&toolId=<tool-id>
```

**Expected Response (when NANGO_SECRET_KEY is missing):**
```
HTTP 500
OAuth Error: NANGO_SECRET_KEY environment variable is not configured. Please set it up to enable OAuth authentication.
```

## Files Changed

### Backend (agents-manage-api)
1. `src/routes/nango.ts` - New health check endpoint
2. `src/create-app.ts` - Route registration and CORS configuration
3. `src/routes/oauth.ts` - Improved error messages

### Frontend (agents-manage-ui)
1. `src/app/api/nango/route.ts` - Next.js API proxy
2. `src/hooks/use-nango-config.ts` - React hook for config checking
3. `src/components/mcp-servers/selection/mcp-server-selection.tsx` - Banner display

## Manual Testing Steps

1. **Start the application with missing NANGO_SECRET_KEY:**
   ```bash
   # In .env files, comment out or leave empty:
   # NANGO_SECRET_KEY=
   
   # Start services
   pnpm dev
   ```

2. **Navigate to MCP servers page:**
   - Go to `http://localhost:3000/default/projects/andrew/mcp-servers/new`
   - Verify warning banner appears

3. **Attempt OAuth flow:**
   - Click on a popular server (e.g., Linear)
   - Verify improved error message in OAuth dialog

4. **Test with valid key:**
   ```bash
   NANGO_SECRET_KEY=sk-valid-key-here
   ```
   - Restart services
   - Verify banner does not appear
   - OAuth flow should work (or fail with different error if key is not real)

## Integration Tests (Future)

Consider adding automated tests for:
- Health check endpoint responses
- OAuth error handling with mocked Nango client
- UI banner rendering based on config state

## Documentation Links

The implementation follows the same pattern as SigNoz error handling:
- Reference: `/workspace/agents-manage-ui/src/components/traces/traces-overview.tsx`
- Setup guide: `/docs/typescript-sdk/credentials/nango.mdx`
