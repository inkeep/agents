/**
 * One-time migration: ensure every project in the runtime DB has the correct
 * relationships in SpiceDB using tenant-scoped composite IDs.
 *
 * For each project in the DB this script:
 *   1. Deletes any old plain-ID relationships (`project:{projectId}`)
 *   2. Ensures the composite ID (`project:{tenantId}/{projectId}`) has the
 *      correct `organization` link (creates it if missing)
 *
 * Usage:
 *   pnpm spicedb:migrate-ids              # dry run (default)
 *   pnpm spicedb:migrate-ids --apply      # actually write to SpiceDB
 *
 * Required env vars:
 *   INKEEP_AGENTS_RUN_DATABASE_URL - PostgreSQL connection string for the runtime DB
 *   SPICEDB_ENDPOINT              - SpiceDB gRPC endpoint (default: localhost:50051)
 *   SPICEDB_PRESHARED_KEY         - SpiceDB preshared key
 */

import { loadEnvironmentFiles } from '../env';

loadEnvironmentFiles();

import { createAgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { projectMetadata } from '../db/runtime/runtime-schema';
import { getSpiceClient, RelationshipOperation, type v1 } from './authz/client';
import { toSpiceDbProjectId } from './authz/config';
import { SpiceDbRelations, SpiceDbResourceTypes } from './authz/types';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

interface SpiceRelationship {
  relation: string;
  subjectType: string;
  subjectId: string;
}

function buildUpdate(
  operation: number,
  objectId: string,
  relation: string,
  subjectType: string,
  subjectId: string
) {
  return {
    operation,
    relationship: {
      resource: { objectType: SpiceDbResourceTypes.PROJECT, objectId },
      relation,
      subject: {
        object: { objectType: subjectType, objectId: subjectId },
        optionalRelation: '',
      },
      optionalCaveat: undefined,
    },
  };
}

async function readRelationships(projectObjectId: string): Promise<SpiceRelationship[]> {
  const spice = getSpiceClient();
  const responses = await spice.promises.readRelationships({
    relationshipFilter: {
      resourceType: SpiceDbResourceTypes.PROJECT,
      optionalResourceId: projectObjectId,
      optionalResourceIdPrefix: '',
      optionalRelation: '',
    },
    consistency: {
      requirement: { oneofKind: 'fullyConsistent', fullyConsistent: true },
    },
    optionalLimit: 0,
    optionalCursor: undefined,
  });

  return responses.map((r: v1.ReadRelationshipsResponse) => ({
    relation: r.relationship?.relation || '',
    subjectType: r.relationship?.subject?.object?.objectType || '',
    subjectId: r.relationship?.subject?.object?.objectId || '',
  }));
}

async function migrateProject(
  tenantId: string,
  projectId: string
): Promise<{ deletedOld: number; orgLinkFixed: boolean }> {
  const compositeId = toSpiceDbProjectId(tenantId, projectId);
  const updates: Array<ReturnType<typeof buildUpdate>> = [];
  const prefix = DRY_RUN ? '[DRY RUN] ' : '✓ ';

  // 1. Delete all old plain-ID relationships
  const oldRels = await readRelationships(projectId);
  for (const rel of oldRels) {
    updates.push(
      buildUpdate(
        RelationshipOperation.DELETE,
        projectId,
        rel.relation,
        rel.subjectType,
        rel.subjectId
      )
    );
    console.log(
      `  ${prefix}DELETE project:${projectId} ${rel.relation} ${rel.subjectType}:${rel.subjectId}`
    );
  }

  // 2. Ensure the composite ID has the correct org link
  const compositeRels = await readRelationships(compositeId);
  const hasOrgLink = compositeRels.some(
    (r) =>
      r.relation === SpiceDbRelations.ORGANIZATION &&
      r.subjectType === SpiceDbResourceTypes.ORGANIZATION &&
      r.subjectId === tenantId
  );

  let orgLinkFixed = false;
  if (!hasOrgLink) {
    orgLinkFixed = true;
    updates.push(
      buildUpdate(
        RelationshipOperation.TOUCH,
        compositeId,
        SpiceDbRelations.ORGANIZATION,
        SpiceDbResourceTypes.ORGANIZATION,
        tenantId
      )
    );
    console.log(`  ${prefix}TOUCH project:${compositeId} organization organization:${tenantId}`);
  }

  // Write all updates atomically
  if (!DRY_RUN && updates.length > 0) {
    const spice = getSpiceClient();
    await spice.promises.writeRelationships({
      updates,
      optionalPreconditions: [],
      optionalTransactionMetadata: undefined,
    });
  }

  return { deletedOld: oldRels.length, orgLinkFixed };
}

async function main() {
  console.log('');
  console.log('🔄 SpiceDB Project Migration');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode:     ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 APPLYING CHANGES'}`);
  console.log(`SpiceDB:  ${process.env.SPICEDB_ENDPOINT || 'localhost:50051'}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const db = createAgentsRunDatabaseClient();
  const projects = await db
    .select({ id: projectMetadata.id, tenantId: projectMetadata.tenantId })
    .from(projectMetadata);

  console.log(`Found ${projects.length} project(s) in the database.\n`);

  let totalDeletedOld = 0;
  let totalOrgLinksFixed = 0;

  for (const project of projects) {
    console.log(`📂 Project: ${project.id} (tenant: ${project.tenantId})`);
    const { deletedOld, orgLinkFixed } = await migrateProject(project.tenantId, project.id);

    if (deletedOld === 0 && !orgLinkFixed) {
      console.log('  (up to date)');
    }

    totalDeletedOld += deletedOld;
    if (orgLinkFixed) totalOrgLinksFixed++;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Projects scanned:            ${projects.length}`);
  console.log(`  Old relationships deleted:   ${totalDeletedOld}`);
  console.log(`  Missing org links fixed:     ${totalOrgLinksFixed}`);

  if (DRY_RUN) {
    console.log('');
    console.log('🔍 This was a DRY RUN. No changes were made.');
    console.log('   Run with --apply to write changes to SpiceDB.');
  } else {
    console.log('');
    console.log('✅ Done!');
  }

  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
