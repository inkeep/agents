"use server";

/**
 * Server Actions for Graph Full Operations
 *
 * These server actions wrap the GraphFull REST API endpoints and provide
 * type-safe functions that can be called from React components.
 */

import { revalidatePath } from "next/cache";
import {
	ApiError,
	createFullGraph as apiCreateFullGraph,
	deleteFullGraph as apiDeleteFullGraph,
	fetchGraphs as apiFetchGraphs,
	getFullGraph as apiGetFullGraph,
	updateFullGraph as apiUpdateFullGraph,
} from "../api/graph-full-client";
import {
	type FullGraphDefinition,
	FullGraphDefinitionSchema,
	type Graph,
} from "../types/graph-full";

/**
 * Result type for server actions - follows a consistent pattern
 */
export type ActionResult<T = void> =
	| {
			success: true;
			data: T;
	  }
	| {
			success: false;
			error: string;
			code?: string;
	  };

export async function getAllGraphsAction(
	tenantId: string,
	projectId: string,
): Promise<ActionResult<Graph[]>> {
	try {
		const response = await apiFetchGraphs(tenantId, projectId);
		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to fetch graphs",
			code: "unknown_error",
		};
	}
}

/**
 * Create a new full graph
 */
export async function createFullGraphAction(
	tenantId: string,
	projectId: string,
	graphData: FullGraphDefinition,
): Promise<ActionResult<FullGraphDefinition>> {
	try {
		const response = await apiCreateFullGraph(tenantId, projectId, graphData);

		// Revalidate relevant pages
		revalidatePath(`/${tenantId}/projects/${projectId}/graphs`);
		revalidatePath(
			`/${tenantId}/projects/${projectId}/graphs/${response.data.id}`,
		);

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				success: false,
				error: error.message,
				code: error.error.code,
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to create graph",
			code: "validation_error",
		};
	}
}

/**
 * Get a full graph by ID
 */
export async function getFullGraphAction(
	tenantId: string,
	projectId: string,
	graphId: string,
): Promise<ActionResult<FullGraphDefinition>> {
	try {
		const response = await apiGetFullGraph(tenantId, projectId, graphId);

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				success: false,
				error: error.message,
				code: error.error.code,
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to get graph",
			code: "unknown_error",
		};
	}
}

/**
 * Update or create a full graph (upsert)
 */
export async function updateFullGraphAction(
	tenantId: string,
	projectId: string,
	graphId: string,
	graphData: FullGraphDefinition,
): Promise<ActionResult<FullGraphDefinition>> {
	try {
		// Ensure the graph ID matches
		if (graphId !== graphData.id) {
			return {
				success: false,
				error: `Graph ID mismatch: expected ${graphId}, got ${graphData.id}`,
				code: "bad_request",
			};
		}

		const response = await apiUpdateFullGraph(
			tenantId,
			projectId,
			graphId,
			graphData,
		);

		// Revalidate relevant pages
		revalidatePath(`/${tenantId}/projects/${projectId}/graphs`);
		revalidatePath(`/${tenantId}/projects/${projectId}/graphs/${graphId}`);

		return {
			success: true,
			data: response.data,
		};
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				success: false,
				error: error.message,
				code: error.error.code,
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update graph",
			code: "validation_error",
		};
	}
}

/**
 * Delete a full graph
 */
export async function deleteFullGraphAction(
	tenantId: string,
	projectId: string,
	graphId: string,
): Promise<ActionResult<void>> {
	try {
		await apiDeleteFullGraph(tenantId, projectId, graphId);

		// Revalidate relevant pages
		revalidatePath(`/${tenantId}/projects/${projectId}/graphs`);

		return {
			success: true,
			data: undefined,
		};
	} catch (error) {
		if (error instanceof ApiError) {
			return {
				success: false,
				error: error.message,
				code: error.error.code,
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to delete graph",
			code: "unknown_error",
		};
	}
}

/**
 * Validate graph data without making an API call
 * Useful for form validation on the client side
 */
export async function validateGraphData(
	data: unknown,
): Promise<ActionResult<FullGraphDefinition>> {
	try {
		const validatedData = FullGraphDefinitionSchema.parse(data);
		return {
			success: true,
			data: validatedData,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Validation failed",
			code: "validation_error",
		};
	}
}
