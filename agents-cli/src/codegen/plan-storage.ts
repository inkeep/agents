/**
 * Plan Storage
 *
 * Save and load generation plans to .inkeep/ directory
 * Enables round-trip consistency and merge detection
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GenerationPlan } from './plan-builder';

export interface PlanMetadata {
	timestamp: string;
	version: string;
	gitCommit?: string;
	user?: string;
}

export interface StoredPlan {
	metadata: PlanMetadata;
	plan: GenerationPlan;
}

/**
 * Save generation plan to .inkeep directory
 */
export function savePlan(projectRoot: string, plan: GenerationPlan): void {
	const inkeepDir = join(projectRoot, '.inkeep');

	// Ensure .inkeep directory exists
	if (!existsSync(inkeepDir)) {
		mkdirSync(inkeepDir, { recursive: true });
	}

	// Get git commit if available
	const gitCommit = getGitCommit(projectRoot);

	// Create stored plan with metadata
	const storedPlan: StoredPlan = {
		metadata: {
			timestamp: new Date().toISOString(),
			version: '1.0',
			gitCommit,
			user: process.env.USER || process.env.USERNAME,
		},
		plan,
	};

	// Save to generation-plan.json
	const planPath = join(inkeepDir, 'generation-plan.json');
	writeFileSync(planPath, JSON.stringify(storedPlan, null, 2));

	// Also save a backup with timestamp
	const backupPath = join(inkeepDir, `generation-plan-${Date.now()}.json`);
	writeFileSync(backupPath, JSON.stringify(storedPlan, null, 2));

	// Clean up old backups (keep last 5)
	cleanupOldBackups(inkeepDir);
}

/**
 * Load generation plan from .inkeep directory
 */
export function loadPlan(projectRoot: string): StoredPlan | null {
	const planPath = join(projectRoot, '.inkeep', 'generation-plan.json');

	if (!existsSync(planPath)) {
		return null;
	}

	try {
		const content = readFileSync(planPath, 'utf-8');
		return JSON.parse(content) as StoredPlan;
	} catch (error) {
		console.error('Failed to load generation plan:', error);
		return null;
	}
}

/**
 * Check if plan exists
 */
export function planExists(projectRoot: string): boolean {
	const planPath = join(projectRoot, '.inkeep', 'generation-plan.json');
	return existsSync(planPath);
}

/**
 * Get git commit hash if in git repository
 */
function getGitCommit(projectRoot: string): string | undefined {
	try {
		const { execSync } = require('node:child_process');
		const commit = execSync('git rev-parse HEAD', {
			cwd: projectRoot,
			encoding: 'utf-8',
		}).trim();
		return commit;
	} catch {
		return undefined;
	}
}

/**
 * Clean up old backup plans (keep last 5)
 */
function cleanupOldBackups(inkeepDir: string): void {
	try {
		const { readdirSync, unlinkSync, statSync } = require('node:fs');

		// Get all backup files
		const files = readdirSync(inkeepDir)
			.filter((f: string) => f.startsWith('generation-plan-') && f.endsWith('.json'))
			.map((f: string) => ({
				name: f,
				path: join(inkeepDir, f),
				mtime: statSync(join(inkeepDir, f)).mtime.getTime(),
			}))
			.sort((a: any, b: any) => b.mtime - a.mtime);

		// Keep only last 5, delete the rest
		for (let i = 5; i < files.length; i++) {
			unlinkSync(files[i].path);
		}
	} catch {
		// Silently fail - cleanup is not critical
	}
}

/**
 * Compare two plans for differences
 */
export interface PlanDiff {
	filesAdded: string[];
	filesRemoved: string[];
	filesModified: string[];
	registryChanges: Array<{
		id: string;
		type: string;
		oldName: string;
		newName: string;
	}>;
	patternChanges: Array<{
		field: string;
		oldValue: any;
		newValue: any;
	}>;
}

/**
 * Compare two plans and return differences
 */
export function comparePlans(oldPlan: GenerationPlan, newPlan: GenerationPlan): PlanDiff {
	const diff: PlanDiff = {
		filesAdded: [],
		filesRemoved: [],
		filesModified: [],
		registryChanges: [],
		patternChanges: [],
	};

	// Compare files
	const oldFiles = new Set(oldPlan.files.map((f) => f.path));
	const newFiles = new Set(newPlan.files.map((f) => f.path));

	for (const file of newPlan.files) {
		if (!oldFiles.has(file.path)) {
			diff.filesAdded.push(file.path);
		}
	}

	for (const file of oldPlan.files) {
		if (!newFiles.has(file.path)) {
			diff.filesRemoved.push(file.path);
		}
	}

	// Compare registry
	compareRegistry(oldPlan.variableRegistry, newPlan.variableRegistry, diff);

	// Compare patterns
	comparePatterns(oldPlan.patterns, newPlan.patterns, diff);

	return diff;
}

/**
 * Compare variable registries
 */
function compareRegistry(
	oldRegistry: any,
	newRegistry: any,
	diff: PlanDiff
): void {
	const types = ['agents', 'subAgents', 'tools', 'dataComponents', 'artifactComponents'];

	for (const type of types) {
		const oldMap = oldRegistry[type];
		const newMap = newRegistry[type];

		if (!oldMap || !newMap) continue;

		// Check for changed mappings
		for (const [id, oldName] of oldMap.entries()) {
			const newName = newMap.get(id);
			if (newName && newName !== oldName) {
				diff.registryChanges.push({
					id,
					type,
					oldName,
					newName,
				});
			}
		}
	}
}

/**
 * Compare patterns
 */
function comparePatterns(oldPatterns: any, newPatterns: any, diff: PlanDiff): void {
	// Compare file structure
	if (
		oldPatterns.fileStructure.toolsLocation !== newPatterns.fileStructure.toolsLocation
	) {
		diff.patternChanges.push({
			field: 'fileStructure.toolsLocation',
			oldValue: oldPatterns.fileStructure.toolsLocation,
			newValue: newPatterns.fileStructure.toolsLocation,
		});
	}

	// Compare naming conventions
	if (
		oldPatterns.namingConventions.agentSuffix !==
		newPatterns.namingConventions.agentSuffix
	) {
		diff.patternChanges.push({
			field: 'namingConventions.agentSuffix',
			oldValue: oldPatterns.namingConventions.agentSuffix,
			newValue: newPatterns.namingConventions.agentSuffix,
		});
	}

	if (
		oldPatterns.namingConventions.subAgentSuffix !==
		newPatterns.namingConventions.subAgentSuffix
	) {
		diff.patternChanges.push({
			field: 'namingConventions.subAgentSuffix',
			oldValue: oldPatterns.namingConventions.subAgentSuffix,
			newValue: newPatterns.namingConventions.subAgentSuffix,
		});
	}
}

/**
 * Display plan diff
 */
export function displayPlanDiff(diff: PlanDiff): void {
	const chalk = require('chalk');

	if (
		diff.filesAdded.length === 0 &&
		diff.filesRemoved.length === 0 &&
		diff.registryChanges.length === 0 &&
		diff.patternChanges.length === 0
	) {
		console.log(chalk.green('No changes detected'));
		return;
	}

	console.log(chalk.cyan('\n📝 Changes since last pull:'));

	if (diff.filesAdded.length > 0) {
		console.log(chalk.green('\n  Files added:'));
		for (const file of diff.filesAdded) {
			console.log(chalk.green(`    + ${file}`));
		}
	}

	if (diff.filesRemoved.length > 0) {
		console.log(chalk.red('\n  Files removed:'));
		for (const file of diff.filesRemoved) {
			console.log(chalk.red(`    - ${file}`));
		}
	}

	if (diff.registryChanges.length > 0) {
		console.log(chalk.yellow('\n  Variable name changes:'));
		for (const change of diff.registryChanges) {
			console.log(chalk.yellow(`    • ${change.type}.${change.id}:`));
			console.log(chalk.gray(`      ${change.oldName} → ${change.newName}`));
		}
	}

	if (diff.patternChanges.length > 0) {
		console.log(chalk.yellow('\n  Pattern changes:'));
		for (const change of diff.patternChanges) {
			console.log(chalk.yellow(`    • ${change.field}:`));
			console.log(chalk.gray(`      ${change.oldValue} → ${change.newValue}`));
		}
	}
}

/**
 * Create .gitignore entry for .inkeep directory
 */
export function ensureGitignore(projectRoot: string): void {
	const gitignorePath = join(projectRoot, '.gitignore');

	// Read existing .gitignore or create empty
	let content = '';
	if (existsSync(gitignorePath)) {
		content = readFileSync(gitignorePath, 'utf-8');
	}

	// Check if .inkeep is already ignored
	if (content.includes('.inkeep')) {
		return; // Already configured
	}

	// Add .inkeep to gitignore
	const addition = content.endsWith('\n') ? '.inkeep/\n' : '\n.inkeep/\n';
	writeFileSync(gitignorePath, content + addition);
}
