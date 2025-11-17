#!/usr/bin/env tsx

import {
  deleteDatasetRunConfigEvaluationRunConfigRelation,
  getDatasetRunConfigEvaluationRunConfigRelations,
  getEvaluationRunConfigById,
  listDatasetRunConfigs,
  listDatasets,
} from '../packages/agents-core/src/data-access/eval.js';
import { createDatabaseClient } from '../packages/agents-core/src/db/client.js';

async function cleanupDatasetRunConfigRelations() {
  const dbClient = createDatabaseClient();

  const tenantId = 'default';
  const projectId = process.env.PROJECT_ID || 'inkeep-facts-project';
  const datasetName = 'testing';

  try {
    // Find the dataset
    const allDatasets = await listDatasets(dbClient)({
      scopes: { tenantId, projectId },
    });

    const datasets = allDatasets.filter((d) => d.name === datasetName);

    if (datasets.length === 0) {
      console.log(`❌ Dataset "${datasetName}" not found in project "${projectId}"`);
      return;
    }

    const dataset = datasets[0];
    console.log(`✅ Found dataset: ${dataset.name} (ID: ${dataset.id})`);

    // Find all dataset run configs
    const runConfigs = await listDatasetRunConfigs(dbClient)({
      scopes: { tenantId, projectId, datasetId: dataset.id },
    });

    console.log(`\n📋 Found ${runConfigs.length} dataset run config(s):`);

    let totalRelations = 0;
    const relationsToDelete: Array<{
      runConfigId: string;
      runConfigName: string;
      relation: any;
    }> = [];

    // Collect all relations from all run configs
    for (const runConfig of runConfigs) {
      const relations = await getDatasetRunConfigEvaluationRunConfigRelations(dbClient)({
        scopes: { tenantId, projectId, datasetRunConfigId: runConfig.id },
      });

      console.log(`\n   ${runConfig.name} (ID: ${runConfig.id})`);
      console.log(`     Trigger Evaluations: ${runConfig.triggerEvaluations ? 'Yes' : 'No'}`);
      console.log(`     Relations: ${relations.length}`);

      if (relations.length > 0) {
        for (const relation of relations) {
          const evalRunConfig = await getEvaluationRunConfigById(dbClient)({
            scopes: {
              tenantId,
              projectId,
              evaluationRunConfigId: relation.evaluationRunConfigId,
            },
          });

          if (evalRunConfig) {
            console.log(`       - ${evalRunConfig.name} (ID: ${relation.evaluationRunConfigId})`);
            relationsToDelete.push({
              runConfigId: runConfig.id,
              runConfigName: runConfig.name,
              relation,
            });
            totalRelations++;
          }
        }
      }
    }

    if (totalRelations === 0) {
      console.log(`\n✅ No relations to clean up`);
      return;
    }

    console.log(
      `\n🗑️  Ready to delete ${totalRelations} relation(s) from ${runConfigs.length} dataset run config(s)`
    );
    console.log(`   Run with DELETE=true to actually delete, otherwise this is a dry run`);

    if (process.env.DELETE === 'true') {
      console.log(`\n🗑️  Deleting relations...`);

      let deletedCount = 0;
      for (const { runConfigId, runConfigName, relation } of relationsToDelete) {
        const deleted = await deleteDatasetRunConfigEvaluationRunConfigRelation(dbClient)({
          scopes: {
            tenantId,
            projectId,
            datasetRunConfigId: runConfigId,
            evaluationRunConfigId: relation.evaluationRunConfigId,
          },
        });

        if (deleted) {
          deletedCount++;
          const evalRunConfig = await getEvaluationRunConfigById(dbClient)({
            scopes: {
              tenantId,
              projectId,
              evaluationRunConfigId: relation.evaluationRunConfigId,
            },
          });
          console.log(
            `   ✅ Deleted relation: ${runConfigName} -> ${evalRunConfig?.name || relation.evaluationRunConfigId}`
          );
        } else {
          console.log(
            `   ⚠️  Failed to delete relation: ${runConfigName} -> ${relation.evaluationRunConfigId}`
          );
        }
      }

      console.log(`\n✅ Cleanup complete! Deleted ${deletedCount}/${totalRelations} relations`);
    } else {
      console.log(`\n💡 This was a dry run. To actually delete, run:`);
      console.log(
        `   DELETE=true PROJECT_ID=${projectId} pnpm tsx scripts/cleanup-dataset-run-config-relations.ts`
      );
    }
  } catch (error) {
    console.error('Error cleaning up relations:', error);
    throw error;
  }
}

cleanupDatasetRunConfigRelations()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
