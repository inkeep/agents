// Environment settings system for environment-agnostic entities management

import type { CredentialReferenceApiInsert } from "@inkeep/agents-core";

interface EnvironmentSettingsConfig {
	credentials?: {
		[settingId: string]: CredentialReferenceApiInsert;
	};
}

// Helper type to extract setting keys from environment config
export type ExtractSettingKeys<T> = T extends { credentials: infer B }
	? B extends Record<string, any>
		? keyof B
		: never
	: never;

// Global registry to track all setting keys across environments
const globalSettingKeys = new Set<string>();

/**
 * Register setting keys globally for autocomplete and runtime access
 */
function registerSettingKeys(settingIds: string[]): void {
	settingIds.forEach((id) => globalSettingKeys.add(id));
}

/**
 * Get all registered setting keys across all environments
 */
export function getAllEnvironmentSettingKeys(): string[] {
	return Array.from(globalSettingKeys);
}

/**
 * Create a setting helper with TypeScript autocomplete
 * Automatically infers environment names from object keys
 */
export function createEnvironmentSettings<
	T extends Record<string, EnvironmentSettingsConfig>,
>(environments: T) {
	// Keep environments in their original object structure
	const environmentMap = environments;
	const environmentNames = Object.keys(environments);
	const allEnvironments = Object.values(environments);

	// Define the key type - for now, accept any string for simplicity
	type SettingKeys = string;

	return {
		getEnvironmentSetting: async <K extends SettingKeys>(
			key: K,
		): Promise<CredentialReferenceApiInsert> => {
			if (environmentNames.length === 0) {
				throw new Error(
					`No environments provided to createEnvironmentSettings().\n\n` +
						`You must pass environments as an object: createEnvironmentSettings({ development, production })`,
				);
			}

			const currentEnv = process.env.NODE_ENV || "development";

			// Find environment that matches the current NODE_ENV exactly
			const matchingEnv = environmentMap[currentEnv];

			if (!matchingEnv) {
				throw new Error(
					`Environment '${currentEnv}' not found.\n\n` +
						`Available environments: ${environmentNames.join(", ")}\n` +
						`Set NODE_ENV to one of the available environments or add a '${currentEnv}' environment.`,
				);
			}

			if (!matchingEnv.credentials?.[key as string]) {
				throw new Error(
					`Credential environment setting '${key}' not found in environment '${currentEnv}'.\n\n`,
				);
			}

			return matchingEnv.credentials[key as string];
		},
		getEnvironmentSettingKeys: (): string[] => {
			if (allEnvironments.length === 0) return [];
			if (allEnvironments.length === 1)
				return Object.keys(allEnvironments[0].credentials || {});

			// Multiple environments - intersection logic
			let commonKeys = new Set(
				Object.keys(allEnvironments[0].credentials || {}),
			);

			for (let i = 1; i < allEnvironments.length; i++) {
				const envKeys = new Set(
					Object.keys(allEnvironments[i].credentials || {}),
				);
				commonKeys = new Set([...commonKeys].filter((key) => envKeys.has(key)));
			}

			return Array.from(commonKeys);
		},
		hasEnvironmentSetting: (key: string): key is SettingKeys => {
			if (allEnvironments.length === 0) return false;
			if (allEnvironments.length === 1)
				return !!(
					allEnvironments[0].credentials &&
					key in allEnvironments[0].credentials
				);

			// Multiple environments - must exist in ALL
			return allEnvironments.every(
				(env) => env.credentials && key in env.credentials,
			);
		},
	};
}

/**
 * Create type-safe environment configurations with setting registration
 */
export function registerEnvironmentSettings<
	T extends EnvironmentSettingsConfig,
>(config: T): T {
	// Register setting keys globally for autocomplete
	if (config.credentials) {
		const settingIds = Object.keys(config.credentials);
		registerSettingKeys(settingIds);
	}

	return config;
}
