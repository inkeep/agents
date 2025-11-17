#!/usr/bin/env tsx

import {
  getDatasetRunConfigEvaluationRunConfigRelations,
  getEvaluationRunConfigById,
  listDatasetRunConfigs,
  listDatasets,
} from '../packages/agents-core/src/data-access/eval.js';
import { createDatabaseClient } from '../packages/agents-core/src/db/client.js';

async function checkDatasetRunConfigRelations() {
  const dbClient = createDatabaseClient();

  const tenantId = 'default';
  const projectId = process.env.PROJECT_ID || 'inkeep-facts-project';
  const datasetName = 'testing';
  const runConfigName = 'test';

  try {
    // Find the dataset using the data access function
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

    // Find the dataset run config
    const runConfigs = await listDatasetRunConfigs(dbClient)({
      scopes: { tenantId, projectId, datasetId: dataset.id },
    });

    const runConfig = runConfigs.find((rc) => rc.name === runConfigName);
    if (!runConfig) {
      console.log(`❌ Dataset run config "${runConfigName}" not found`);
      return;
    }

    console.log(`✅ Found dataset run config: ${runConfig.name} (ID: ${runConfig.id})`);
    console.log(`   Trigger Evaluations: ${runConfig.triggerEvaluations ? 'Yes' : 'No'}`);

    // Get evaluation run config relations
    const relations = await getDatasetRunConfigEvaluationRunConfigRelations(dbClient)({
      scopes: { tenantId, projectId, datasetRunConfigId: runConfig.id },
    });

    console.log(`\n📊 Evaluation Run Config Relations (${relations.length}):`);

    if (relations.length === 0) {
      console.log('   No evaluation run configs linked');
    } else {
      for (const relation of relations) {
        const evalRunConfig = await getEvaluationRunConfigById(dbClient)({
          scopes: {
            tenantId,
            projectId,
            evaluationRunConfigId: relation.evaluationRunConfigId,
          },
        });

        if (evalRunConfig) {
          console.log(`\n   Relation ID: ${relation.id}`);
          console.log(
            `   Evaluation Run Config: ${evalRunConfig.name} (ID: ${relation.evaluationRunConfigId})`
          );
          console.log(`   Enabled: ${relation.enabled ? 'Yes' : 'No'}`);
          console.log(`   Is Active: ${evalRunConfig.isActive ? 'Yes' : 'No'}`);
          console.log(
            `   Exclude Dataset Runs: ${evalRunConfig.excludeDatasetRunConversations ? 'Yes' : 'No'}`
          );
          console.log(`   Created: ${relation.createdAt}`);

          if (evalRunConfig.excludeDatasetRunConversations) {
            console.log(`   ⚠️  WARNING: This config excludes dataset runs but is still linked!`);
          }
        } else {
          console.log(`\n   Relation ID: ${relation.id}`);
          console.log(
            `   Evaluation Run Config ID: ${relation.evaluationRunConfigId} (NOT FOUND - may be deleted)`
          );
        }
      }
    }

    // Also check all other dataset run configs to see if they're linked to the same eval configs
    console.log(`\n🔍 Checking all dataset run configs in this dataset:`);
    for (const otherRunConfig of runConfigs) {
      if (otherRunConfig.id === runConfig.id) continue;

      const otherRelations = await getDatasetRunConfigEvaluationRunConfigRelations(dbClient)({
        scopes: { tenantId, projectId, datasetRunConfigId: otherRunConfig.id },
      });

      if (otherRelations.length > 0) {
        console.log(`\n   Dataset Run Config: ${otherRunConfig.name} (ID: ${otherRunConfig.id})`);
        console.log(`   Trigger Evaluations: ${otherRunConfig.triggerEvaluations ? 'Yes' : 'No'}`);
        console.log(`   Linked Evaluation Run Configs: ${otherRelations.length}`);
        for (const rel of otherRelations) {
          const evalConfig = await getEvaluationRunConfigById(dbClient)({
            scopes: { tenantId, projectId, evaluationRunConfigId: rel.evaluationRunConfigId },
          });
          if (evalConfig) {
            console.log(`     - ${evalConfig.name} (ID: ${rel.evaluationRunConfigId})`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking relations:', error);
    throw error;
  }
}

checkDatasetRunConfigRelations()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
