#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_CONFIGS = {
  'eval-api': {
    port: 3005,
    title: 'Evaluation API',
    titleCompact: 'EvalAPI',
    description: 'handles evaluations, datasets, and evaluation runs',
  },
  'manage-api': {
    port: 3002,
    title: 'Manage API',
    titleCompact: 'ManageAPI',
    description: 'handles CRUD operations and OAuth',
  },
};

function replaceTokens(content, tokens) {
  return Object.entries(tokens).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    content
  );
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  const apiName = process.argv[2];

  if (!apiName) {
    console.error('❌ Error: API name is required\n');
    console.error('Usage: node scripts/generate-mcp-package.mjs <api-name>\n');
    console.error('Available API names:');
    Object.keys(API_CONFIGS).forEach((name) => {
      console.error(`  - ${name}`);
    });
    process.exit(1);
  }

  const config = API_CONFIGS[apiName];
  if (!config) {
    console.error(`❌ Error: Unknown API name "${apiName}"\n`);
    console.error('Available API names:');
    Object.keys(API_CONFIGS).forEach((name) => {
      console.error(`  - ${name}`);
    });
    process.exit(1);
  }

  const rootDir = path.resolve(__dirname, '..');
  const sourceApiPath = path.resolve(rootDir, `agents-${apiName}`);
  const serviceName = apiName.replace('-api', '');
  const packageName = `agents-${serviceName}-mcp`;
  const targetPath = path.resolve(rootDir, 'packages', packageName);
  const templatesPath = path.resolve(__dirname, 'mcp-templates');

  console.log('\n🚀 MCP Package Generator\n');
  console.log(`📦 Creating: @inkeep/${packageName}`);
  console.log(`🔌 API: agents-${apiName} (port ${config.port})`);
  console.log(`📁 Target: ${targetPath}\n`);

  if (!fs.existsSync(sourceApiPath)) {
    console.error(`❌ Error: Source API not found at ${sourceApiPath}`);
    process.exit(1);
  }

  if (fs.existsSync(targetPath)) {
    console.error(`❌ Error: Target package already exists at ${targetPath}`);
    console.error('   Please remove it first or choose a different API name.');
    process.exit(1);
  }

  const sourcePackageJsonPath = path.join(sourceApiPath, 'package.json');
  if (!fs.existsSync(sourcePackageJsonPath)) {
    console.error(`❌ Error: package.json not found in source API at ${sourcePackageJsonPath}`);
    process.exit(1);
  }

  const sourcePackageJson = JSON.parse(fs.readFileSync(sourcePackageJsonPath, 'utf8'));

  const tokens = {
    API_NAME: apiName,
    API_NAME_UPPER: apiName.toUpperCase().replace(/-/g, '_'),
    PACKAGE_NAME: packageName,
    API_PORT: config.port.toString(),
    API_TITLE: config.title,
    API_TITLE_COMPACT: config.titleCompact,
    API_DESCRIPTION: config.description,
    SOURCE_DESCRIPTION: sourcePackageJson.description || `API for ${config.title}`,
  };

  console.log('📋 Step 1: Creating directory structure...\n');
  fs.mkdirSync(targetPath, { recursive: true });
  fs.mkdirSync(path.join(targetPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(targetPath, 'src'), { recursive: true });
  fs.mkdirSync(path.join(targetPath, 'static'), { recursive: true });
  fs.mkdirSync(path.join(targetPath, '.speakeasy'), { recursive: true });
  console.log('✅ Directories created\n');

  console.log('📋 Step 2: Generating files from templates...\n');

  const templateFiles = [
    { src: 'package.json.template', dest: 'package.json' },
    { src: 'README.md.template', dest: 'README.md' },
    { src: 'tsconfig.json.template', dest: 'tsconfig.json' },
    { src: 'eslint.config.mjs.template', dest: 'eslint.config.mjs' },
    { src: '.npmrc.template', dest: '.npmrc' },
    { src: 'scripts/fetch-openapi.mjs.template', dest: 'scripts/fetch-openapi.mjs' },
    { src: 'scripts/generate.mjs.template', dest: 'scripts/generate.mjs' },
    { src: 'scripts/watch-and-fetch.mjs.template', dest: 'scripts/watch-and-fetch.mjs' },
    { src: '.speakeasy/workflow.yaml.template', dest: '.speakeasy/workflow.yaml' },
    { src: '.speakeasy/gen.yaml.template', dest: '.speakeasy/gen.yaml' },
  ];

  for (const { src, dest } of templateFiles) {
    const templatePath = path.join(templatesPath, src);
    const destPath = path.join(targetPath, dest);

    if (!fs.existsSync(templatePath)) {
      console.error(`⚠️  Warning: Template not found: ${templatePath}`);
      continue;
    }

    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const processedContent = replaceTokens(templateContent, tokens);

    fs.writeFileSync(destPath, processedContent, 'utf8');
    console.log(`  ✓ Created ${dest}`);
  }

  console.log('\n✅ All template files generated\n');

  console.log('📋 Step 3: Checking workspace configuration...\n');
  const workspaceYamlPath = path.join(rootDir, 'pnpm-workspace.yaml');
  const workspaceYaml = fs.readFileSync(workspaceYamlPath, 'utf8');

  if (!workspaceYaml.includes(`packages/${packageName}`) && !workspaceYaml.includes('"packages/*"')) {
    console.log('⚠️  Package not in pnpm-workspace.yaml');
    console.log('   Adding it now...');

    const updatedYaml = workspaceYaml.trimEnd() + `\n  - packages/${packageName}\n`;
    fs.writeFileSync(workspaceYamlPath, updatedYaml, 'utf8');
    console.log('   ✓ Added to workspace');
  } else {
    console.log('✅ Package already covered by workspace glob or explicitly listed');
  }

  console.log('\n📋 Step 4: Installing dependencies...\n');
  try {
    await runCommand('pnpm', ['install'], { cwd: rootDir });
    console.log('\n✅ Dependencies installed\n');
  } catch (error) {
    console.error('\n⚠️  Warning: Failed to install dependencies:', error.message);
    console.error('   You may need to run `pnpm install` manually\n');
  }

  console.log('✅ Package generation complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📦 Next Steps:\n');
  console.log(`1. Navigate to the package directory:`);
  console.log(`   cd packages/${packageName}\n`);
  console.log(`2. Fetch the OpenAPI spec from the running API:`);
  console.log(`   pnpm fetch-openapi\n`);
  console.log(`3. Generate the MCP server code with Speakeasy:`);
  console.log(`   pnpm generate\n`);
  console.log(`4. Build the package:`);
  console.log(`   pnpm build\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💡 Development Workflow:\n');
  console.log('   Terminal 1: pnpm --filter @inkeep/agents-' + apiName + ' dev');
  console.log(`   Terminal 2: cd packages/${packageName} && pnpm watch`);
  console.log(`   Terminal 3: cd packages/${packageName} && speakeasy run --watch\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📚 For more information, see scripts/README-MCP-GENERATOR.md\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});

