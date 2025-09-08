import { sql } from 'drizzle-orm';
import dbClient from '../../data/db/dbClient';

/**
 * Ensures a project exists for a given tenant ID.
 * This is needed because of foreign key constraints in the database.
 *
 * @param tenantId - The tenant ID
 * @param projectId - The project ID (defaults to 'default')
 * @returns Promise that resolves when the project is created
 */
export async function ensureTestProject(tenantId: string, projectId = 'default'): Promise<void> {
  await dbClient.run(sql`
    INSERT OR IGNORE INTO projects (tenant_id, id, name, description, created_at, updated_at)
    VALUES (${tenantId}, ${projectId}, ${`Test Project ${projectId}`}, ${`Test project for ${projectId}`}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
}

/**
 * Creates multiple test projects for a tenant.
 *
 * @param tenantId - The tenant ID
 * @param projectIds - Array of project IDs to create
 * @returns Promise that resolves when all projects are created
 */
export async function ensureTestProjects(tenantId: string, projectIds: string[]): Promise<void> {
  await Promise.all(projectIds.map((projectId) => ensureTestProject(tenantId, projectId)));
}
