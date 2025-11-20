/**
 * Client-side functions for interacting with the Evaluations API
 * These functions make HTTP requests to the server instead of direct database calls
 */

import { apiFetch, getLogger } from '@inkeep/agents-core';

const logger = getLogger('evaluationClient');

function parseError(errorText: string): string | void {
  try {
    const errorJson = JSON.parse(errorText);
    if (errorJson.error) {
      const { error } = errorJson;
      return error?.message ?? error;
    }
  } catch {
    // Use the text as-is if not JSON
    if (errorText) {
      return errorText;
    }
  }
}

function buildUrl(
  apiUrl: string,
  tenantId: string,
  projectId: string,
  ...pathSegments: string[]
): string {
  return `${apiUrl}/tenants/${tenantId}/projects/${projectId}/evaluations/${pathSegments.join('/')}`;
}

function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

// ============================================================================
// DATASETS
// ============================================================================

export async function listDatasets(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown[]> {
  logger.info({ tenantId, projectId }, 'Listing datasets via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets');

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to list datasets: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to list datasets via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown[] };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Failed to list datasets');
    throw error;
  }
}

export async function getDataset(
  tenantId: string,
  projectId: string,
  datasetId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown | null> {
  logger.info({ tenantId, projectId, datasetId }, 'Getting dataset via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId);

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.info({ datasetId }, 'Dataset not found');
        return null;
      }

      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ?? `Failed to get dataset: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to get dataset via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, datasetId }, 'Failed to get dataset');
    throw error;
  }
}

export async function createDataset(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  datasetData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId }, 'Creating dataset via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets');

  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(datasetData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to create dataset: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to create dataset via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info({ tenantId, projectId }, 'Successfully created dataset via API');
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Failed to create dataset');
    throw error;
  }
}

export async function updateDataset(
  tenantId: string,
  projectId: string,
  datasetId: string,
  apiUrl: string,
  updateData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId, datasetId }, 'Updating dataset via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId);

  try {
    const response = await apiFetch(url, {
      method: 'PATCH',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to update dataset: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to update dataset via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info({ tenantId, projectId, datasetId }, 'Successfully updated dataset via API');
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, datasetId }, 'Failed to update dataset');
    throw error;
  }
}

export async function deleteDataset(
  tenantId: string,
  projectId: string,
  datasetId: string,
  apiUrl: string,
  apiKey?: string
): Promise<void> {
  logger.info({ tenantId, projectId, datasetId }, 'Deleting dataset via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId);

  try {
    const response = await apiFetch(url, {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to delete dataset: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to delete dataset via API'
      );
      throw new Error(errorMessage);
    }

    logger.info({ tenantId, projectId, datasetId }, 'Successfully deleted dataset via API');
  } catch (error) {
    logger.error({ error, tenantId, projectId, datasetId }, 'Failed to delete dataset');
    throw error;
  }
}

// ============================================================================
// DATASET ITEMS
// ============================================================================

export async function listDatasetItems(
  tenantId: string,
  projectId: string,
  datasetId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown[]> {
  logger.info({ tenantId, projectId, datasetId }, 'Listing dataset items via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId, 'items');

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to list dataset items: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to list dataset items via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown[] };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, datasetId }, 'Failed to list dataset items');
    throw error;
  }
}

export async function getDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown | null> {
  logger.info({ tenantId, projectId, datasetId, itemId }, 'Getting dataset item via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId, 'items', itemId);

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.info({ itemId }, 'Dataset item not found');
        return null;
      }

      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to get dataset item: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to get dataset item via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, datasetId, itemId }, 'Failed to get dataset item');
    throw error;
  }
}

export async function createDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  apiUrl: string,
  itemData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId, datasetId }, 'Creating dataset item via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId, 'items');

  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(itemData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to create dataset item: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to create dataset item via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info({ tenantId, projectId, datasetId }, 'Successfully created dataset item via API');
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, datasetId }, 'Failed to create dataset item');
    throw error;
  }
}

export async function createDatasetItems(
  tenantId: string,
  projectId: string,
  datasetId: string,
  apiUrl: string,
  itemsData: Record<string, unknown>[],
  apiKey?: string
): Promise<unknown[]> {
  logger.info(
    { tenantId, projectId, datasetId, count: itemsData.length },
    'Creating dataset items via API'
  );

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId, 'items', 'bulk');

  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({ items: itemsData }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to create dataset items: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to create dataset items via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown[] };
    logger.info(
      { tenantId, projectId, datasetId, count: result.data.length },
      'Successfully created dataset items via API'
    );
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, datasetId }, 'Failed to create dataset items');
    throw error;
  }
}

export async function updateDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string,
  apiUrl: string,
  updateData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId, datasetId, itemId }, 'Updating dataset item via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId, 'items', itemId);

  try {
    const response = await apiFetch(url, {
      method: 'PATCH',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to update dataset item: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to update dataset item via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info(
      { tenantId, projectId, datasetId, itemId },
      'Successfully updated dataset item via API'
    );
    return result.data;
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, datasetId, itemId },
      'Failed to update dataset item'
    );
    throw error;
  }
}

export async function deleteDatasetItem(
  tenantId: string,
  projectId: string,
  datasetId: string,
  itemId: string,
  apiUrl: string,
  apiKey?: string
): Promise<void> {
  logger.info({ tenantId, projectId, datasetId, itemId }, 'Deleting dataset item via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'datasets', datasetId, 'items', itemId);

  try {
    const response = await apiFetch(url, {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to delete dataset item: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to delete dataset item via API'
      );
      throw new Error(errorMessage);
    }

    logger.info(
      { tenantId, projectId, datasetId, itemId },
      'Successfully deleted dataset item via API'
    );
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, datasetId, itemId },
      'Failed to delete dataset item'
    );
    throw error;
  }
}

// ============================================================================
// EVALUATORS
// ============================================================================

export async function listEvaluators(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown[]> {
  logger.info({ tenantId, projectId }, 'Listing evaluators via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluators');

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to list evaluators: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to list evaluators via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown[] };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Failed to list evaluators');
    throw error;
  }
}

export async function getEvaluator(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown | null> {
  logger.info({ tenantId, projectId, evaluatorId }, 'Getting evaluator via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluators', evaluatorId);

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.info({ evaluatorId }, 'Evaluator not found');
        return null;
      }

      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to get evaluator: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to get evaluator via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to get evaluator');
    throw error;
  }
}

export async function createEvaluator(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  evaluatorData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId }, 'Creating evaluator via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluators');

  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(evaluatorData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to create evaluator: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to create evaluator via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info({ tenantId, projectId }, 'Successfully created evaluator via API');
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Failed to create evaluator');
    throw error;
  }
}

export async function updateEvaluator(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  apiUrl: string,
  updateData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId, evaluatorId }, 'Updating evaluator via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluators', evaluatorId);

  try {
    const response = await apiFetch(url, {
      method: 'PATCH',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to update evaluator: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to update evaluator via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info({ tenantId, projectId, evaluatorId }, 'Successfully updated evaluator via API');
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to update evaluator');
    throw error;
  }
}

export async function deleteEvaluator(
  tenantId: string,
  projectId: string,
  evaluatorId: string,
  apiUrl: string,
  apiKey?: string
): Promise<void> {
  logger.info({ tenantId, projectId, evaluatorId }, 'Deleting evaluator via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluators', evaluatorId);

  try {
    const response = await apiFetch(url, {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to delete evaluator: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to delete evaluator via API'
      );
      throw new Error(errorMessage);
    }

    logger.info({ tenantId, projectId, evaluatorId }, 'Successfully deleted evaluator via API');
  } catch (error) {
    logger.error({ error, tenantId, projectId, evaluatorId }, 'Failed to delete evaluator');
    throw error;
  }
}

// ============================================================================
// EVALUATION SUITE CONFIGS
// ============================================================================

export async function listEvaluationSuiteConfigs(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown[]> {
  logger.info({ tenantId, projectId }, 'Listing evaluation suite configs via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-suite-configs');

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to list evaluation suite configs: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to list evaluation suite configs via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown[] };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Failed to list evaluation suite configs');
    throw error;
  }
}

export async function getEvaluationSuiteConfig(
  tenantId: string,
  projectId: string,
  configId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown | null> {
  logger.info({ tenantId, projectId, configId }, 'Getting evaluation suite config via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-suite-configs', configId);

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.info({ configId }, 'Evaluation suite config not found');
        return null;
      }

      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to get evaluation suite config: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to get evaluation suite config via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, configId }, 'Failed to get evaluation suite config');
    throw error;
  }
}

export async function createEvaluationSuiteConfig(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  configData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId }, 'Creating evaluation suite config via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-suite-configs');

  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(configData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to create evaluation suite config: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to create evaluation suite config via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info({ tenantId, projectId }, 'Successfully created evaluation suite config via API');
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Failed to create evaluation suite config');
    throw error;
  }
}

export async function updateEvaluationSuiteConfig(
  tenantId: string,
  projectId: string,
  configId: string,
  apiUrl: string,
  updateData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId, configId }, 'Updating evaluation suite config via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-suite-configs', configId);

  try {
    const response = await apiFetch(url, {
      method: 'PATCH',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to update evaluation suite config: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to update evaluation suite config via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info(
      { tenantId, projectId, configId },
      'Successfully updated evaluation suite config via API'
    );
    return result.data;
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, configId },
      'Failed to update evaluation suite config'
    );
    throw error;
  }
}

export async function deleteEvaluationSuiteConfig(
  tenantId: string,
  projectId: string,
  configId: string,
  apiUrl: string,
  apiKey?: string
): Promise<void> {
  logger.info({ tenantId, projectId, configId }, 'Deleting evaluation suite config via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-suite-configs', configId);

  try {
    const response = await apiFetch(url, {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to delete evaluation suite config: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to delete evaluation suite config via API'
      );
      throw new Error(errorMessage);
    }

    logger.info(
      { tenantId, projectId, configId },
      'Successfully deleted evaluation suite config via API'
    );
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, configId },
      'Failed to delete evaluation suite config'
    );
    throw error;
  }
}

// ============================================================================
// EVALUATION SUITE CONFIG EVALUATOR RELATIONS
// ============================================================================

export async function listEvaluationSuiteConfigEvaluators(
  tenantId: string,
  projectId: string,
  configId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown[]> {
  logger.info(
    { tenantId, projectId, configId },
    'Listing evaluators for evaluation suite config via API'
  );

  const url = buildUrl(
    apiUrl,
    tenantId,
    projectId,
    'evaluation-suite-configs',
    configId,
    'evaluators'
  );

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to list evaluators for evaluation suite config: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to list evaluators for evaluation suite config via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown[] };
    return result.data;
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, configId },
      'Failed to list evaluators for evaluation suite config'
    );
    throw error;
  }
}

export async function addEvaluatorToSuiteConfig(
  tenantId: string,
  projectId: string,
  configId: string,
  evaluatorId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown> {
  logger.info(
    { tenantId, projectId, configId, evaluatorId },
    'Adding evaluator to evaluation suite config via API'
  );

  const url = buildUrl(
    apiUrl,
    tenantId,
    projectId,
    'evaluation-suite-configs',
    configId,
    'evaluators',
    evaluatorId
  );

  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to add evaluator to evaluation suite config: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to add evaluator to evaluation suite config via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info(
      { tenantId, projectId, configId, evaluatorId },
      'Successfully added evaluator to evaluation suite config via API'
    );
    return result.data;
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, configId, evaluatorId },
      'Failed to add evaluator to evaluation suite config'
    );
    throw error;
  }
}

export async function removeEvaluatorFromSuiteConfig(
  tenantId: string,
  projectId: string,
  configId: string,
  evaluatorId: string,
  apiUrl: string,
  apiKey?: string
): Promise<void> {
  logger.info(
    { tenantId, projectId, configId, evaluatorId },
    'Removing evaluator from evaluation suite config via API'
  );

  const url = buildUrl(
    apiUrl,
    tenantId,
    projectId,
    'evaluation-suite-configs',
    configId,
    'evaluators',
    evaluatorId
  );

  try {
    const response = await apiFetch(url, {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to remove evaluator from evaluation suite config: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to remove evaluator from evaluation suite config via API'
      );
      throw new Error(errorMessage);
    }

    logger.info(
      { tenantId, projectId, configId, evaluatorId },
      'Successfully removed evaluator from evaluation suite config via API'
    );
  } catch (error) {
    logger.error(
      { error, tenantId, projectId, configId, evaluatorId },
      'Failed to remove evaluator from evaluation suite config'
    );
    throw error;
  }
}

// ============================================================================
// EVALUATION RESULTS
// ============================================================================

export async function getEvaluationResult(
  tenantId: string,
  projectId: string,
  resultId: string,
  apiUrl: string,
  apiKey?: string
): Promise<unknown | null> {
  logger.info({ tenantId, projectId, resultId }, 'Getting evaluation result via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-results', resultId);

  try {
    const response = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.info({ resultId }, 'Evaluation result not found');
        return null;
      }

      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to get evaluation result: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to get evaluation result via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, resultId }, 'Failed to get evaluation result');
    throw error;
  }
}

export async function createEvaluationResult(
  tenantId: string,
  projectId: string,
  apiUrl: string,
  resultData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId }, 'Creating evaluation result via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-results');

  try {
    const response = await apiFetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(resultData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to create evaluation result: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to create evaluation result via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info({ tenantId, projectId }, 'Successfully created evaluation result via API');
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId }, 'Failed to create evaluation result');
    throw error;
  }
}

export async function updateEvaluationResult(
  tenantId: string,
  projectId: string,
  resultId: string,
  apiUrl: string,
  updateData: Record<string, unknown>,
  apiKey?: string
): Promise<unknown> {
  logger.info({ tenantId, projectId, resultId }, 'Updating evaluation result via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-results', resultId);

  try {
    const response = await apiFetch(url, {
      method: 'PATCH',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to update evaluation result: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to update evaluation result via API'
      );
      throw new Error(errorMessage);
    }

    const result = (await response.json()) as { data: unknown };
    logger.info(
      { tenantId, projectId, resultId },
      'Successfully updated evaluation result via API'
    );
    return result.data;
  } catch (error) {
    logger.error({ error, tenantId, projectId, resultId }, 'Failed to update evaluation result');
    throw error;
  }
}

export async function deleteEvaluationResult(
  tenantId: string,
  projectId: string,
  resultId: string,
  apiUrl: string,
  apiKey?: string
): Promise<void> {
  logger.info({ tenantId, projectId, resultId }, 'Deleting evaluation result via API');

  const url = buildUrl(apiUrl, tenantId, projectId, 'evaluation-results', resultId);

  try {
    const response = await apiFetch(url, {
      method: 'DELETE',
      headers: buildHeaders(apiKey),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage =
        parseError(errorText) ??
        `Failed to delete evaluation result: ${response.status} ${response.statusText}`;

      logger.error(
        { status: response.status, error: errorMessage },
        'Failed to delete evaluation result via API'
      );
      throw new Error(errorMessage);
    }

    logger.info(
      { tenantId, projectId, resultId },
      'Successfully deleted evaluation result via API'
    );
  } catch (error) {
    logger.error({ error, tenantId, projectId, resultId }, 'Failed to delete evaluation result');
    throw error;
  }
}
