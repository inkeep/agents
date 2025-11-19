# MCP Package Generator

This directory contains a template-based system for generating MCP (Model Context Protocol) server packages from any of the Inkeep Agents API packages.

## Overview

The MCP Package Generator creates fully-functional MCP server packages that wrap existing REST APIs, making them accessible via the Model Context Protocol. This allows AI assistants like Claude, Cursor, and others to interact with these APIs natively.

## Quick Start

### Generate a New MCP Package

```bash
# From the monorepo root
node scripts/generate-mcp-package.mjs <api-name>
```

**Available API names:**
- `eval-api` - Evaluation API (port 3005)
- `manage-api` - Manage API (port 3002)

> **Note**: The Run API (port 3003) already has a built-in `/mcp` endpoint and doesn't need a separate MCP package.

### Example

```bash
# Generate MCP package for the Evaluation API
node scripts/generate-mcp-package.mjs eval-api
```

This will:
1. Create `packages/agents-eval-api-mcp/` with all necessary files
2. Install dependencies via pnpm
3. Add the package to the workspace
4. Display next steps for completing the setup

## What Gets Generated

The generator creates a complete package structure:

```
packages/agents-{apiname}-mcp/
├── package.json              # Package manifest with MCP-specific config
├── tsconfig.json            # TypeScript configuration
├── eslint.config.mjs        # ESLint configuration
├── README.md                # Package documentation
├── scripts/
│   ├── fetch-openapi.mjs    # Fetches OpenAPI spec from running API
│   ├── generate.mjs         # Orchestrates Speakeasy generation
│   └── watch-and-fetch.mjs  # Watches for changes and auto-fetches
├── src/                     # Generated TypeScript code (by Speakeasy)
└── static/                  # Static assets for MCP bundles
```

## Generated Package Features

Each generated package includes:

- **Automatic OpenAPI Fetching**: Scripts to fetch the latest OpenAPI spec from the running API
- **Watch Mode**: Monitors source API changes and auto-regenerates
- **Speakeasy Integration**: Configured to use Speakeasy CLI for code generation
- **MCP Server Implementation**: Full MCP protocol support with stdio and SSE transports
- **Package Scripts**: `build`, `fetch-openapi`, `generate`, `watch`
- **Documentation**: Complete README with installation and usage instructions

## Development Workflow

After generating a package, follow this workflow to complete the setup:

### 1. Navigate to Package

```bash
cd packages/agents-{apiname}-mcp
```

### 2. Fetch OpenAPI Specification

Make sure the source API is running, then:

```bash
pnpm fetch-openapi
```

This will fetch the OpenAPI spec from the running API server and save it to `openapi.json`.

### 3. Initialize Package Lock File

Before first generation, copy the package-lock.json from an existing MCP package:

```bash
cp ../agents-manage-mcp/package-lock.json . 
sed -i '' "s/@inkeep\/agents-manage-mcp/@inkeep\/agents-{service}-mcp/g" package-lock.json
```

This prevents npm dependency conflicts when Speakeasy runs.

### 4. Generate MCP Server Code

Run Speakeasy to generate the MCP server code:

```bash
node scripts/generate.mjs
```

This orchestrates the full generation process:
- Fetches the latest OpenAPI spec
- Runs Speakeasy code generation
- Restores custom package.json fields
- Applies code formatting via biome

### 5. Install Dependencies

```bash
cd ../.. && pnpm install
```

This ensures all devDependencies (dotenv, find-up) are properly installed in the workspace.

### 6. Build the Package

```bash
cd packages/agents-{service}-mcp && pnpm build
```

This compiles the TypeScript code and generates the executable binary.

## Continuous Development

For active development with automatic regeneration:

**Terminal 1** - Run the source API:
```bash
pnpm --filter @inkeep/agents-{apiname} dev
```

**Terminal 2** - Watch for API changes:
```bash
cd packages/agents-{apiname}-mcp
pnpm watch
```

**Terminal 3** - Watch for OpenAPI changes:
```bash
cd packages/agents-{apiname}-mcp
speakeasy run --watch
```

This setup automatically:
1. Detects changes in the source API
2. Fetches the updated OpenAPI spec
3. Regenerates the MCP server code
4. Keeps the package in sync with the API

## Template System

The generator uses a template-based approach with token replacement.

### Template Location

All templates are stored in `scripts/mcp-templates/`:
- `package.json.template`
- `README.md.template`
- `tsconfig.json.template`
- `eslint.config.mjs.template`
- `scripts/*.template`

### Available Tokens

Templates use these replacement tokens:

| Token | Example Value | Description |
|-------|---------------|-------------|
| `{{API_NAME}}` | `eval-api` | API name (kebab-case) |
| `{{API_NAME_UPPER}}` | `EVAL_API` | API name (uppercase, underscores) |
| `{{PACKAGE_NAME}}` | `agents-eval-api-mcp` | Full package name |
| `{{API_PORT}}` | `3001` | Default API port |
| `{{API_TITLE}}` | `Evaluation API` | Human-readable API title |
| `{{API_TITLE_COMPACT}}` | `EvalAPI` | Compact API title (no spaces) |
| `{{API_DESCRIPTION}}` | `handles evaluations...` | API description |

### Modifying Templates

To customize the generated packages:

1. Edit files in `scripts/mcp-templates/`
2. Use `{{TOKEN_NAME}}` syntax for dynamic values
3. Regenerate packages to see changes

### Adding New APIs

To support a new API, add its configuration to `scripts/generate-mcp-package.mjs`:

```javascript
const API_CONFIGS = {
  'new-api': {
    port: 3004,
    title: 'New API',
    titleCompact: 'NewAPI',
    description: 'description of what it does',
  },
  'eval-api': { port: 3005, title: 'Evaluation API', ... },
  'manage-api': { port: 3002, title: 'Manage API', ... }
};
```

## Generator Script Details

### Command Line Interface

```bash
node scripts/generate-mcp-package.mjs <api-name>
```

### What the Generator Does

1. **Validates Input**
   - Checks API name is valid
   - Verifies source API exists
   - Ensures target doesn't already exist

2. **Creates Structure**
   - Creates package directory
   - Creates subdirectories (scripts, src, static)

3. **Processes Templates**
   - Reads template files
   - Replaces tokens with actual values
   - Writes processed files

4. **Workspace Integration**
   - Updates pnpm-workspace.yaml if needed
   - Ensures package is in monorepo

5. **Install Dependencies**
   - Runs pnpm install for the new package
   - Installs all required dependencies

6. **Displays Next Steps**
   - Shows commands to complete setup
   - Provides development workflow guidance

## Configuration Reference

### API Configuration

Each API has these configuration properties:

```javascript
{
  port: 3005,                    // Default API port
  title: 'Evaluation API',       // Human-readable name
  titleCompact: 'EvalAPI',       // No-space version for identifiers
  description: 'handles eval...' // Brief description
}
```

### Environment Variables

Generated packages support these environment variables:

- `INKEEP_AGENTS_{API_NAME_UPPER}_API_URL` - Override default API URL
  - Example: `INKEEP_AGENTS_EVAL_API_API_URL=http://localhost:3001`

## Troubleshooting

### Package Already Exists

If you see "Target package already exists":
```bash
rm -rf packages/agents-{apiname}-mcp
node scripts/generate-mcp-package.mjs {apiname}
```

### Source API Not Found

Ensure the source API package exists:
```bash
ls agents-{apiname}/package.json
```

### Workspace Not Updated

If the package isn't recognized:
```bash
pnpm install
```

### OpenAPI Fetch Fails

Ensure the API is running:
```bash
pnpm --filter @inkeep/agents-{apiname} dev
```

Then verify it's accessible:
```bash
curl http://localhost:{port}/openapi.json
```

### Speakeasy Not Found

Install Speakeasy CLI:
```bash
# Homebrew
brew install speakeasy-api/homebrew-tap/speakeasy

# npm
npm install -g @speakeasy-api/cli

# curl
curl -fsSL https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh | sh
```

## Package Structure Explained

### Scripts Directory

**fetch-openapi.mjs**
- Fetches OpenAPI spec from running API
- Can auto-start the API if not running
- Supports custom API URLs via env vars
- Writes to `openapi.json`

**generate.mjs**
- Orchestrates full generation pipeline
- Calls fetch-openapi
- Runs Speakeasy generation
- Restores custom package.json fields
- Applies formatting fixes

**watch-and-fetch.mjs**
- Watches source API files for changes
- Debounces change detection (1s)
- Auto-runs fetch-openapi on changes
- Monitors both API and agents-core

### Generated Code

The `src/` directory contains Speakeasy-generated code:
- MCP server implementation
- Tool definitions from OpenAPI operations
- Type definitions
- API client code

**⚠️ Warning**: Never manually edit generated code - it will be overwritten!

## Best Practices

### When to Regenerate

Regenerate the MCP package when:
- API endpoints change
- Request/response schemas change
- New operations are added
- Operation descriptions are updated

### Development Tips

1. **Use Watch Mode**: Set up all three terminals for seamless development
2. **Commit Generated Code**: Check in the generated code for reproducibility
3. **Version Bumps**: Increment package version when regenerating with API changes
4. **Test After Generation**: Verify the generated package builds and runs

### Maintenance

1. **Keep Templates Updated**: Update templates when MCP patterns change
2. **Update Dependencies**: Keep Speakeasy and MCP SDK versions current
3. **Document Changes**: Update this README when modifying the generator

## Advanced Usage

### Custom API URL

Override the default API URL when fetching:

```bash
INKEEP_AGENTS_EVAL_API_API_URL=http://custom-host:8080 pnpm fetch-openapi
```

### Skip Auto-Start

If you want to manage the API yourself:

```bash
# Terminal 1: Start API manually
pnpm --filter @inkeep/agents-eval-api dev

# Terminal 2: Fetch OpenAPI (won't auto-start)
cd packages/agents-eval-api-mcp
pnpm fetch-openapi
```

### Manual Speakeasy Generation

For more control over Speakeasy:

```bash
cd packages/agents-eval-api-mcp
speakeasy run --target typescript --schema openapi.json
```

### Debugging Generated Code

Use the MCP Inspector to test:

```bash
cd packages/agents-eval-api-mcp
pnpm build
npx @modelcontextprotocol/inspector node ./bin/mcp-server.js start
```

## Publishing

To publish a generated MCP package to npm:

1. **Update Version**: Bump version in package.json
2. **Build**: Run `pnpm build`
3. **Test**: Verify the package works
4. **Publish**: Run `npm publish` (or `pnpm publish`)

## Contributing

When contributing improvements to the generator:

1. **Test Thoroughly**: Generate packages for all APIs
2. **Update Templates**: Keep all templates in sync
3. **Document Changes**: Update this README
4. **Validate Output**: Ensure generated packages build and run

## Related Documentation

- [Speakeasy Documentation](https://www.speakeasy.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [OpenAPI Specification](https://swagger.io/specification/)

## Future Enhancements

Potential improvements for the generator:

- Interactive mode with prompts
- Support for custom template directories
- Validation of generated output
- Auto-publish via changesets
- CI/CD integration
- Multi-API package generation
- Template versioning

