/**
 * Pattern Analyzer
 *
 * Analyzes existing TypeScript code to detect patterns and conventions
 * that should be preserved when generating new code.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EntityType, NamingConventions } from './variable-name-registry';
import { DEFAULT_NAMING_CONVENTIONS } from './variable-name-registry';

export interface FileStructurePatterns {
	toolsLocation: 'inline' | 'separate' | 'grouped' | 'unknown';
	agentsLocation: 'flat' | 'nested' | 'unknown';
	preferredFileNaming: 'kebab-case' | 'camelCase' | 'snake_case' | 'unknown';
	hasToolsDirectory: boolean;
	hasAgentsDirectory: boolean;
	hasDataComponentsDirectory: boolean;
	hasArtifactComponentsDirectory: boolean;
	hasEnvironmentsDirectory: boolean;
}

export interface CodeStylePatterns {
	exportNaming: 'camelCase' | 'PascalCase' | 'mixed' | 'unknown';
	multiLineStrings: 'template-literals' | 'concatenation' | 'mixed' | 'unknown';
	importStyle: 'named' | 'default' | 'mixed' | 'unknown';
	preferredQuotes: 'single' | 'double' | 'backtick' | 'mixed';
}

export interface ExampleMapping {
	id: string;
	variableName: string;
	entityType: EntityType;
	filePath: string;
}

export interface DetectedPatterns {
	fileStructure: FileStructurePatterns;
	namingConventions: NamingConventions;
	codeStyle: CodeStylePatterns;
	examples: {
		sampleAgentFile?: string;
		sampleToolFile?: string;
		sampleImports?: string[];
		mappings: ExampleMapping[];
	};
}

/**
 * Analyze existing project to detect patterns
 */
export async function analyzeExistingPatterns(
	projectDir: string
): Promise<DetectedPatterns | null> {
	// Check if project exists
	const indexPath = join(projectDir, 'index.ts');
	if (!existsSync(indexPath)) {
		return null; // No existing project
	}

	const fileStructure = analyzeFileStructure(projectDir);
	const codeExamples = collectCodeExamples(projectDir, fileStructure);
	const codeStyle = analyzeCodeStyle(codeExamples);
	const namingConventions = analyzeNamingConventions(codeExamples);

	return {
		fileStructure,
		namingConventions,
		codeStyle,
		examples: {
			sampleAgentFile: codeExamples.agentFiles[0]?.content,
			sampleToolFile: codeExamples.toolFiles[0]?.content,
			sampleImports: codeExamples.imports,
			mappings: codeExamples.mappings,
		},
	};
}

/**
 * Analyze file and directory structure
 */
function analyzeFileStructure(projectDir: string): FileStructurePatterns {
	const hasAgentsDirectory = existsSync(join(projectDir, 'agents'));
	const hasToolsDirectory = existsSync(join(projectDir, 'tools'));
	const hasDataComponentsDirectory = existsSync(join(projectDir, 'data-components'));
	const hasArtifactComponentsDirectory = existsSync(join(projectDir, 'artifact-components'));
	const hasEnvironmentsDirectory = existsSync(join(projectDir, 'environments'));

	// Determine tools location
	let toolsLocation: FileStructurePatterns['toolsLocation'] = 'unknown';
	if (hasToolsDirectory) {
		toolsLocation = 'separate';
	} else if (hasAgentsDirectory) {
		// Check if agents have inline tools
		const agentFiles = getFilesInDirectory(join(projectDir, 'agents'), '.ts');
		const hasInlineTools = agentFiles.some((file) => {
			const content = readFileSync(file, 'utf-8');
			return content.includes('functionTool(');
		});
		toolsLocation = hasInlineTools ? 'inline' : 'unknown';
	}

	// Determine agents location
	const agentsLocation: FileStructurePatterns['agentsLocation'] = hasAgentsDirectory
		? 'flat'
		: 'unknown';

	// Determine file naming convention
	const allFiles = [
		...getFilesInDirectory(projectDir, '.ts'),
		...(hasAgentsDirectory ? getFilesInDirectory(join(projectDir, 'agents'), '.ts') : []),
		...(hasToolsDirectory ? getFilesInDirectory(join(projectDir, 'tools'), '.ts') : []),
	];

	const preferredFileNaming = detectFileNamingConvention(allFiles);

	return {
		toolsLocation,
		agentsLocation,
		preferredFileNaming,
		hasToolsDirectory,
		hasAgentsDirectory,
		hasDataComponentsDirectory,
		hasArtifactComponentsDirectory,
		hasEnvironmentsDirectory,
	};
}

/**
 * Detect file naming convention from file names
 */
function detectFileNamingConvention(
	files: string[]
): 'kebab-case' | 'camelCase' | 'snake_case' | 'unknown' {
	let kebabCount = 0;
	let camelCount = 0;
	let snakeCount = 0;

	for (const file of files) {
		const fileName = file.split('/').pop()?.replace('.ts', '') || '';

		// Skip index files and files that don't follow conventions
		if (fileName === 'index' || fileName.length < 3) {
			continue;
		}

		if (fileName.includes('-')) {
			kebabCount++;
		} else if (fileName.includes('_')) {
			snakeCount++;
		} else if (/[a-z][A-Z]/.test(fileName)) {
			camelCount++;
		}
	}

	// Return the most common convention
	const max = Math.max(kebabCount, camelCount, snakeCount);
	if (max === 0) return 'unknown';
	if (kebabCount === max) return 'kebab-case';
	if (snakeCount === max) return 'snake_case';
	return 'camelCase';
}

/**
 * Collect code examples for analysis
 */
interface CodeExamples {
	agentFiles: Array<{ path: string; content: string }>;
	toolFiles: Array<{ path: string; content: string }>;
	imports: string[];
	mappings: ExampleMapping[];
}

function collectCodeExamples(
	projectDir: string,
	fileStructure: FileStructurePatterns
): CodeExamples {
	const examples: CodeExamples = {
		agentFiles: [],
		toolFiles: [],
		imports: [],
		mappings: [],
	};

	// Collect agent files
	if (fileStructure.hasAgentsDirectory) {
		const agentDir = join(projectDir, 'agents');
		const agentFiles = getFilesInDirectory(agentDir, '.ts');
		for (const file of agentFiles.slice(0, 3)) {
			// Sample up to 3 files
			const content = readFileSync(file, 'utf-8');
			examples.agentFiles.push({ path: file, content });

			// Extract imports
			const imports = extractImports(content);
			examples.imports.push(...imports);

			// Extract mappings
			const mappings = extractVariableMappings(content, file);
			examples.mappings.push(...mappings);
		}
	}

	// Collect tool files
	if (fileStructure.hasToolsDirectory) {
		const toolsDir = join(projectDir, 'tools');
		const toolFiles = getFilesInDirectory(toolsDir, '.ts');
		for (const file of toolFiles.slice(0, 3)) {
			const content = readFileSync(file, 'utf-8');
			examples.toolFiles.push({ path: file, content });

			const mappings = extractVariableMappings(content, file);
			examples.mappings.push(...mappings);
		}
	}

	// Check index file for project-level patterns
	const indexPath = join(projectDir, 'index.ts');
	if (existsSync(indexPath)) {
		const content = readFileSync(indexPath, 'utf-8');
		const imports = extractImports(content);
		examples.imports.push(...imports);
	}

	return examples;
}

/**
 * Extract imports from code
 */
function extractImports(code: string): string[] {
	const importRegex = /import\s+.*?\s+from\s+['"].*?['"];?/g;
	return code.match(importRegex) || [];
}

/**
 * Extract variable name mappings from code
 */
function extractVariableMappings(code: string, filePath: string): ExampleMapping[] {
	const mappings: ExampleMapping[] = [];

	// Pattern: const variableName = agent({ id: 'id-value', ... })
	// Pattern: export const variableName = agent({ id: 'id-value', ... })
	const patterns = [
		/(?:export\s+)?const\s+(\w+)\s*=\s*agent\(\s*\{\s*id:\s*['"]([^'"]+)['"]/g,
		/(?:export\s+)?const\s+(\w+)\s*=\s*subAgent\(\s*\{\s*id:\s*['"]([^'"]+)['"]/g,
		/(?:export\s+)?const\s+(\w+)\s*=\s*functionTool\(\s*\{\s*(?:id:\s*['"]([^'"]+)['"]|name:\s*['"]([^'"]+)['"])/g,
		/(?:export\s+)?const\s+(\w+)\s*=\s*mcpTool\(\s*\{\s*id:\s*['"]([^'"]+)['"]/g,
		/(?:export\s+)?const\s+(\w+)\s*=\s*dataComponent\(\s*\{\s*id:\s*['"]([^'"]+)['"]/g,
		/(?:export\s+)?const\s+(\w+)\s*=\s*artifactComponent\(\s*\{\s*id:\s*['"]([^'"]+)['"]/g,
	];

	const entityTypes: EntityType[] = [
		'agent',
		'subAgent',
		'tool',
		'tool',
		'dataComponent',
		'artifactComponent',
	];

	patterns.forEach((pattern, index) => {
		const matches = code.matchAll(pattern);
		for (const match of matches) {
			const variableName = match[1];
			const id = match[2] || match[3]; // For functionTool, id or name
			if (variableName && id) {
				mappings.push({
					id,
					variableName,
					entityType: entityTypes[index],
					filePath,
				});
			}
		}
	});

	return mappings;
}

/**
 * Analyze code style from examples
 */
function analyzeCodeStyle(examples: CodeExamples): CodeStylePatterns {
	const allCode = [
		...examples.agentFiles.map((f) => f.content),
		...examples.toolFiles.map((f) => f.content),
	].join('\n');

	// Detect export naming
	const camelExports = (allCode.match(/export\s+const\s+[a-z][a-zA-Z0-9]*/g) || []).length;
	const pascalExports = (allCode.match(/export\s+const\s+[A-Z][a-zA-Z0-9]*/g) || []).length;
	const exportNaming: CodeStylePatterns['exportNaming'] =
		camelExports > pascalExports ? 'camelCase' : pascalExports > 0 ? 'PascalCase' : 'unknown';

	// Detect multi-line strings
	const templateLiterals = (allCode.match(/`[^`]*\n[^`]*`/g) || []).length;
	const concatenation = (allCode.match(/\+\s*\n/g) || []).length;
	const multiLineStrings: CodeStylePatterns['multiLineStrings'] =
		templateLiterals > concatenation
			? 'template-literals'
			: concatenation > 0
				? 'concatenation'
				: 'unknown';

	// Detect import style
	const namedImports = examples.imports.filter((i) => i.includes('{')).length;
	const defaultImports = examples.imports.filter((i) => !i.includes('{')).length;
	const importStyle: CodeStylePatterns['importStyle'] =
		namedImports > defaultImports ? 'named' : defaultImports > 0 ? 'default' : 'unknown';

	// Detect quote preference
	const singleQuotes = (allCode.match(/'/g) || []).length;
	const doubleQuotes = (allCode.match(/"/g) || []).length;
	const backticks = (allCode.match(/`/g) || []).length;
	const maxQuotes = Math.max(singleQuotes, doubleQuotes, backticks);
	const preferredQuotes: CodeStylePatterns['preferredQuotes'] =
		maxQuotes === 0
			? 'single'
			: singleQuotes === maxQuotes
				? 'single'
				: doubleQuotes === maxQuotes
					? 'double'
					: 'backtick';

	return {
		exportNaming,
		multiLineStrings,
		importStyle,
		preferredQuotes,
	};
}

/**
 * Analyze naming conventions from example mappings
 */
function analyzeNamingConventions(examples: CodeExamples): NamingConventions {
	// Start with defaults
	const conventions: NamingConventions = { ...DEFAULT_NAMING_CONVENTIONS };

	// Analyze suffixes for each type
	const subAgentMappings = examples.mappings.filter((m) => m.entityType === 'subAgent');
	const agentMappings = examples.mappings.filter((m) => m.entityType === 'agent');
	const toolMappings = examples.mappings.filter((m) => m.entityType === 'tool');

	// Detect subAgent suffix
	if (subAgentMappings.length > 0) {
		const suffixes = subAgentMappings
			.map((m) => detectSuffix(m.id, m.variableName))
			.filter((s) => s !== null);
		if (suffixes.length > 0) {
			// Most common suffix
			conventions.subAgentSuffix = mostCommon(suffixes) || DEFAULT_NAMING_CONVENTIONS.subAgentSuffix;
		}
	}

	// Detect agent suffix
	if (agentMappings.length > 0) {
		const suffixes = agentMappings
			.map((m) => detectSuffix(m.id, m.variableName))
			.filter((s) => s !== null);
		if (suffixes.length > 0) {
			conventions.agentSuffix = mostCommon(suffixes) || DEFAULT_NAMING_CONVENTIONS.agentSuffix;
		}
	}

	// Detect tool suffix (usually none)
	if (toolMappings.length > 0) {
		const suffixes = toolMappings
			.map((m) => detectSuffix(m.id, m.variableName))
			.filter((s) => s !== null);
		if (suffixes.length > 0 && suffixes.some((s) => s !== '')) {
			conventions.toolSuffix = mostCommon(suffixes);
		}
	}

	return conventions;
}

/**
 * Detect suffix added to variable name
 */
function detectSuffix(id: string, variableName: string): string | null {
	// Convert ID to base variable name
	const baseName = idToVariableName(id);

	// Check if variable name starts with base name
	if (variableName.startsWith(baseName)) {
		return variableName.slice(baseName.length);
	}

	return null;
}

/**
 * Convert ID to camelCase (same logic as in registry)
 */
function idToVariableName(id: string): string {
	const parts = id.split(/[-_]/);
	return parts
		.map((part, index) => {
			if (index === 0) {
				return part.toLowerCase();
			}
			return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
		})
		.join('');
}

/**
 * Get most common item in array
 */
function mostCommon<T>(arr: T[]): T | null {
	if (arr.length === 0) return null;

	const counts = new Map<T, number>();
	for (const item of arr) {
		counts.set(item, (counts.get(item) || 0) + 1);
	}

	let maxCount = 0;
	let mostCommonItem: T | null = null;
	for (const [item, count] of counts.entries()) {
		if (count > maxCount) {
			maxCount = count;
			mostCommonItem = item;
		}
	}

	return mostCommonItem;
}

/**
 * Get all files in a directory recursively
 */
function getFilesInDirectory(dir: string, extension: string): string[] {
	if (!existsSync(dir)) {
		return [];
	}

	const files: string[] = [];
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			files.push(...getFilesInDirectory(fullPath, extension));
		} else if (stat.isFile() && fullPath.endsWith(extension)) {
			files.push(fullPath);
		}
	}

	return files;
}
