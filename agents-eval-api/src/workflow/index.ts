export { world } from './world';
export { evaluateConversationWorkflow } from './functions/evaluateConversation';
export { runDatasetItemWorkflow } from './functions/runDatasetItem';

import { start as originalStart } from 'workflow/api';

// Debug wrapper for start() to trace what's happening
export async function debugStart<T extends (...args: any[]) => any>(
  workflow: T,
  args: Parameters<T>,
  options?: { id?: string }
): Promise<any> {
  const workflowName = workflow.name || 'unknown';
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const vercelUrl = process.env.VERCEL_URL;
  
  console.log('[workflow-start] Starting workflow', {
    workflowName,
    deploymentId,
    vercelUrl,
    argsCount: args.length,
    hasOptions: Boolean(options),
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await originalStart(workflow, args, options);
    
    console.log('[workflow-start] Workflow started successfully', {
      workflowName,
      runId: result?.runId,
      resultKeys: result ? Object.keys(result) : [],
      worldKeys: result?.world ? Object.keys(result.world) : [],
    });

    // Try to get more info about where callbacks will go
    if (result?.world?.queue) {
      try {
        const queueDeploymentId = await result.world.queue.getDeploymentId?.();
        console.log('[workflow-start] Queue deployment info', {
          queueDeploymentId,
          envDeploymentId: deploymentId,
          match: queueDeploymentId === deploymentId,
        });
      } catch (e) {
        console.log('[workflow-start] Could not get queue deployment ID', { error: String(e) });
      }
    }

    return result;
  } catch (error: any) {
    console.error('[workflow-start] Failed to start workflow', {
      workflowName,
      error: error?.message || String(error),
      errorName: error?.name,
      errorStack: error?.stack?.split('\n').slice(0, 5),
    });
    throw error;
  }
}

