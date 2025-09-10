"use server";

import type { CredentialReferenceApiInsert } from "@inkeep/agents-core/client-exports";
import { createCredential, fetchCredential } from "@/lib/api/credentials";

/**
 * Find existing credential or create a new one (idempotent operation)
 */
export async function findOrCreateCredential(
	tenantId: string,
	projectId: string,
	credentialData: CredentialReferenceApiInsert,
) {
	try {
		// Try to find existing credential first
		const existingCredential = await fetchCredential(
			tenantId,
			projectId,
			credentialData.id,
		);
		if (existingCredential) {
			return existingCredential;
		}
	} catch {
		// Credential not found, continue with creation
	}

	// Create new credential
	try {
		return await createCredential(tenantId, projectId, credentialData);
	} catch (error) {
		console.error("Failed to save credential to database:", error);
		throw new Error(
			`Failed to save credential '${credentialData.id}' to database`,
		);
	}
}
