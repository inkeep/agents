/**
 * Client-side class for interacting with the Evaluations API
 * These methods make HTTP requests to the server instead of direct database calls
 */

import { apiFetch, getLogger } from '@inkeep/agents-core';

function parseError(errorText: string): string | undefined {
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
  return undefined;
}

export interface EvaluationClientConfig {
  tenantId: string;
  projectId: string;
  apiUrl: string;
  apiKey?: string;
}

export class EvaluationClient {
  private tenantId: string;
  private projectId: string;
  private apiUrl: string;
  private apiKey?: string;

  private logger;

  constructor(config: EvaluationClientConfig) {
    this.tenantId = config.tenantId;
    this.projectId = config.projectId;
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.logger = getLogger('EvalClient').with({
      tenantId: config.tenantId,
      projectId: config.projectId,
    });
  }

  private buildUrl(...pathSegments: string[]): string {
    return `${this.apiUrl}/manage/tenants/${this.tenantId}/projects/${this.projectId}/evals/${pathSegments.join('/')}`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  // ============================================================================
  // DATASETS
  // ============================================================================

  async listDatasets(): Promise<unknown[]> {
    this.logger.info('Listing datasets via API');

    const url = this.buildUrl('datasets');

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to list datasets: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to list datasets via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown[] };
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to list datasets');
      throw error;
    }
  }

  async getDataset(datasetId: string): Promise<unknown | null> {
    this.logger.info({ datasetId }, 'Getting dataset via API');

    const url = this.buildUrl('datasets', datasetId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info({ datasetId }, 'Dataset not found');
          return null;
        }

        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to get dataset: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to get dataset via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId }, 'Failed to get dataset');
      throw error;
    }
  }

  async createDataset(datasetData: Record<string, unknown>): Promise<unknown> {
    this.logger.info('Creating dataset via API');

    const url = this.buildUrl('datasets');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(datasetData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to create dataset: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to create dataset via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info('Successfully created dataset via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to create dataset');
      throw error;
    }
  }

  async updateDataset(datasetId: string, updateData: Record<string, unknown>): Promise<unknown> {
    this.logger.info({ datasetId }, 'Updating dataset via API');

    const url = this.buildUrl('datasets', datasetId);

    try {
      const response = await apiFetch(url, {
        method: 'PATCH',
        headers: this.buildHeaders(),
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to update dataset: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to update dataset via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info({ datasetId }, 'Successfully updated dataset via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId }, 'Failed to update dataset');
      throw error;
    }
  }

  async deleteDataset(datasetId: string): Promise<void> {
    this.logger.info({ datasetId }, 'Deleting dataset via API');

    const url = this.buildUrl('datasets', datasetId);

    try {
      const response = await apiFetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to delete dataset: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to delete dataset via API'
        );
        throw new Error(errorMessage);
      }

      this.logger.info({ datasetId }, 'Successfully deleted dataset via API');
    } catch (error) {
      this.logger.error({ error, datasetId }, 'Failed to delete dataset');
      throw error;
    }
  }

  // ============================================================================
  // DATASET ITEMS
  // ============================================================================

  async listDatasetItems(datasetId: string): Promise<unknown[]> {
    this.logger.info({ datasetId }, 'Listing dataset items via API');

    const url = this.buildUrl('dataset-items', datasetId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to list dataset items: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to list dataset items via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown[] };
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId }, 'Failed to list dataset items');
      throw error;
    }
  }

  async getDatasetItem(datasetId: string, itemId: string): Promise<unknown | null> {
    this.logger.info({ datasetId, itemId }, 'Getting dataset item via API');

    const url = this.buildUrl('dataset-items', datasetId, 'items', itemId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info({ itemId }, 'Dataset item not found');
          return null;
        }

        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to get dataset item: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to get dataset item via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId, itemId }, 'Failed to get dataset item');
      throw error;
    }
  }

  async createDatasetItem(datasetId: string, itemData: Record<string, unknown>): Promise<unknown> {
    this.logger.info({ datasetId }, 'Creating dataset item via API');

    const url = this.buildUrl('dataset-items', datasetId, 'items');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(itemData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to create dataset item: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to create dataset item via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info({ datasetId }, 'Successfully created dataset item via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId }, 'Failed to create dataset item');
      throw error;
    }
  }

  async createDatasetItems(
    datasetId: string,
    itemsData: Record<string, unknown>[]
  ): Promise<unknown[]> {
    this.logger.info({ datasetId, count: itemsData.length }, 'Creating dataset items via API');

    const url = this.buildUrl('dataset-items', datasetId, 'items', 'bulk');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(itemsData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to create dataset items: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to create dataset items via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown[] };
      this.logger.info(
        { datasetId, count: result.data.length },
        'Successfully created dataset items via API'
      );
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId }, 'Failed to create dataset items');
      throw error;
    }
  }

  async updateDatasetItem(
    datasetId: string,
    itemId: string,
    updateData: Record<string, unknown>
  ): Promise<unknown> {
    this.logger.info({ datasetId, itemId }, 'Updating dataset item via API');

    const url = this.buildUrl('dataset-items', datasetId, 'items', itemId);

    try {
      const response = await apiFetch(url, {
        method: 'PATCH',
        headers: this.buildHeaders(),
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to update dataset item: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to update dataset item via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info({ datasetId, itemId }, 'Successfully updated dataset item via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId, itemId }, 'Failed to update dataset item');
      throw error;
    }
  }

  async deleteDatasetItem(datasetId: string, itemId: string): Promise<void> {
    this.logger.info({ datasetId, itemId }, 'Deleting dataset item via API');

    const url = this.buildUrl('dataset-items', datasetId, 'items', itemId);

    try {
      const response = await apiFetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to delete dataset item: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to delete dataset item via API'
        );
        throw new Error(errorMessage);
      }

      this.logger.info({ datasetId, itemId }, 'Successfully deleted dataset item via API');
    } catch (error) {
      this.logger.error({ error, datasetId, itemId }, 'Failed to delete dataset item');
      throw error;
    }
  }

  // ============================================================================
  // EVALUATORS
  // ============================================================================

  async listEvaluators(): Promise<unknown[]> {
    this.logger.info('Listing evaluators via API');

    const url = this.buildUrl('evaluators');

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to list evaluators: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to list evaluators via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown[] };
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to list evaluators');
      throw error;
    }
  }

  async getEvaluator(evaluatorId: string): Promise<unknown | null> {
    this.logger.info({ evaluatorId }, 'Getting evaluator via API');

    const url = this.buildUrl('evaluators', evaluatorId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info({ evaluatorId }, 'Evaluator not found');
          return null;
        }

        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to get evaluator: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to get evaluator via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      return result.data;
    } catch (error) {
      this.logger.error({ error, evaluatorId }, 'Failed to get evaluator');
      throw error;
    }
  }

  async createEvaluator(evaluatorData: Record<string, unknown>): Promise<unknown> {
    this.logger.info('Creating evaluator via API');

    const url = this.buildUrl('evaluators');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(evaluatorData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to create evaluator: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to create evaluator via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info('Successfully created evaluator via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to create evaluator');
      throw error;
    }
  }

  async updateEvaluator(
    evaluatorId: string,
    updateData: Record<string, unknown>
  ): Promise<unknown> {
    this.logger.info({ evaluatorId }, 'Updating evaluator via API');

    const url = this.buildUrl('evaluators', evaluatorId);

    try {
      const response = await apiFetch(url, {
        method: 'PATCH',
        headers: this.buildHeaders(),
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to update evaluator: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to update evaluator via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info({ evaluatorId }, 'Successfully updated evaluator via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error, evaluatorId }, 'Failed to update evaluator');
      throw error;
    }
  }

  async deleteEvaluator(evaluatorId: string): Promise<void> {
    this.logger.info({ evaluatorId }, 'Deleting evaluator via API');

    const url = this.buildUrl('evaluators', evaluatorId);

    try {
      const response = await apiFetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to delete evaluator: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to delete evaluator via API'
        );
        throw new Error(errorMessage);
      }

      this.logger.info({ evaluatorId }, 'Successfully deleted evaluator via API');
    } catch (error) {
      this.logger.error({ error, evaluatorId }, 'Failed to delete evaluator');
      throw error;
    }
  }

  // ============================================================================
  // EVALUATION SUITE CONFIGS
  // ============================================================================

  async listEvaluationSuiteConfigs(): Promise<unknown[]> {
    this.logger.info('Listing evaluation suite configs via API');

    const url = this.buildUrl('evaluation-suite-configs');

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to list evaluation suite configs: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to list evaluation suite configs via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown[] };
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to list evaluation suite configs');
      throw error;
    }
  }

  async getEvaluationSuiteConfig(configId: string): Promise<unknown | null> {
    this.logger.info({ configId }, 'Getting evaluation suite config via API');

    const url = this.buildUrl('evaluation-suite-configs', configId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info({ configId }, 'Evaluation suite config not found');
          return null;
        }

        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to get evaluation suite config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to get evaluation suite config via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      return result.data;
    } catch (error) {
      this.logger.error({ error, configId }, 'Failed to get evaluation suite config');
      throw error;
    }
  }

  async createEvaluationSuiteConfig(configData: Record<string, unknown>): Promise<unknown> {
    this.logger.info('Creating evaluation suite config via API');

    const url = this.buildUrl('evaluation-suite-configs');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(configData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to create evaluation suite config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to create evaluation suite config via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info('Successfully created evaluation suite config via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to create evaluation suite config');
      throw error;
    }
  }

  async updateEvaluationSuiteConfig(
    configId: string,
    updateData: Record<string, unknown>
  ): Promise<unknown> {
    this.logger.info({ configId }, 'Updating evaluation suite config via API');

    const url = this.buildUrl('evaluation-suite-configs', configId);

    try {
      const response = await apiFetch(url, {
        method: 'PATCH',
        headers: this.buildHeaders(),
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to update evaluation suite config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to update evaluation suite config via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info({ configId }, 'Successfully updated evaluation suite config via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error, configId }, 'Failed to update evaluation suite config');
      throw error;
    }
  }

  async deleteEvaluationSuiteConfig(configId: string): Promise<void> {
    this.logger.info({ configId }, 'Deleting evaluation suite config via API');

    const url = this.buildUrl('evaluation-suite-configs', configId);

    try {
      const response = await apiFetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to delete evaluation suite config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to delete evaluation suite config via API'
        );
        throw new Error(errorMessage);
      }

      this.logger.info({ configId }, 'Successfully deleted evaluation suite config via API');
    } catch (error) {
      this.logger.error({ error, configId }, 'Failed to delete evaluation suite config');
      throw error;
    }
  }

  // ============================================================================
  // EVALUATION SUITE CONFIG EVALUATOR RELATIONS
  // ============================================================================

  async listEvaluationSuiteConfigEvaluators(configId: string): Promise<unknown[]> {
    this.logger.info({ configId }, 'Listing evaluators for evaluation suite config via API');

    const url = this.buildUrl('evaluation-suite-configs', configId, 'evaluators');

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to list evaluators for evaluation suite config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to list evaluators for evaluation suite config via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown[] };
      return result.data;
    } catch (error) {
      this.logger.error(
        { error, configId },
        'Failed to list evaluators for evaluation suite config'
      );
      throw error;
    }
  }

  async addEvaluatorToSuiteConfig(configId: string, evaluatorId: string): Promise<unknown> {
    this.logger.info(
      { configId, evaluatorId },
      'Adding evaluator to evaluation suite config via API'
    );

    const url = this.buildUrl('evaluation-suite-configs', configId, 'evaluators', evaluatorId);

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to add evaluator to evaluation suite config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to add evaluator to evaluation suite config via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info(
        { configId, evaluatorId },
        'Successfully added evaluator to evaluation suite config via API'
      );
      return result.data;
    } catch (error) {
      this.logger.error(
        { error, configId, evaluatorId },
        'Failed to add evaluator to evaluation suite config'
      );
      throw error;
    }
  }

  async removeEvaluatorFromSuiteConfig(configId: string, evaluatorId: string): Promise<void> {
    this.logger.info(
      { configId, evaluatorId },
      'Removing evaluator from evaluation suite config via API'
    );

    const url = this.buildUrl('evaluation-suite-configs', configId, 'evaluators', evaluatorId);

    try {
      const response = await apiFetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to remove evaluator from evaluation suite config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to remove evaluator from evaluation suite config via API'
        );
        throw new Error(errorMessage);
      }

      this.logger.info(
        { configId, evaluatorId },
        'Successfully removed evaluator from evaluation suite config via API'
      );
    } catch (error) {
      this.logger.error(
        { error, configId, evaluatorId },
        'Failed to remove evaluator from evaluation suite config'
      );
      throw error;
    }
  }

  // ============================================================================
  // EVALUATION RESULTS
  // ============================================================================

  async getEvaluationResult(resultId: string): Promise<unknown | null> {
    this.logger.info({ resultId }, 'Getting evaluation result via API');

    const url = this.buildUrl('evaluation-results', resultId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info({ resultId }, 'Evaluation result not found');
          return null;
        }

        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to get evaluation result: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to get evaluation result via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      return result.data;
    } catch (error) {
      this.logger.error({ error, resultId }, 'Failed to get evaluation result');
      throw error;
    }
  }

  async createEvaluationResult(resultData: Record<string, unknown>): Promise<unknown> {
    this.logger.info('Creating evaluation result via API');

    const url = this.buildUrl('evaluation-results');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(resultData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to create evaluation result: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to create evaluation result via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info('Successfully created evaluation result via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to create evaluation result');
      throw error;
    }
  }

  async updateEvaluationResult(
    resultId: string,
    updateData: Record<string, unknown>
  ): Promise<unknown> {
    this.logger.info({ resultId }, 'Updating evaluation result via API');

    const url = this.buildUrl('evaluation-results', resultId);

    try {
      const response = await apiFetch(url, {
        method: 'PATCH',
        headers: this.buildHeaders(),
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to update evaluation result: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to update evaluation result via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info({ resultId }, 'Successfully updated evaluation result via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error, resultId }, 'Failed to update evaluation result');
      throw error;
    }
  }

  async deleteEvaluationResult(resultId: string): Promise<void> {
    this.logger.info({ resultId }, 'Deleting evaluation result via API');

    const url = this.buildUrl('evaluation-results', resultId);

    try {
      const response = await apiFetch(url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to delete evaluation result: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to delete evaluation result via API'
        );
        throw new Error(errorMessage);
      }

      this.logger.info({ resultId }, 'Successfully deleted evaluation result via API');
    } catch (error) {
      this.logger.error({ error, resultId }, 'Failed to delete evaluation result');
      throw error;
    }
  }

  // ============================================================================
  // TRIGGER BATCH EVALUATION
  // ============================================================================

  /**
   * Trigger batch evaluation of conversations with selected evaluators.
   * Supports filtering by conversation IDs, date range, or dataset run IDs.
   */
  async triggerBatchEvaluation(evaluationData: {
    evaluatorIds: string[];
    name?: string;
    conversationIds?: string[];
    dateRange?: {
      startDate: string;
      endDate: string;
    };
    datasetRunIds?: string[];
  }): Promise<{
    message: string;
    evaluationJobConfigId: string;
    evaluatorIds: string[];
  }> {
    const jobFilters: Record<string, unknown> = {};

    if (evaluationData.conversationIds?.length) {
      jobFilters.conversationIds = evaluationData.conversationIds;
    }
    if (evaluationData.dateRange) {
      jobFilters.dateRange = evaluationData.dateRange;
    }
    if (evaluationData.datasetRunIds?.length) {
      jobFilters.datasetRunIds = evaluationData.datasetRunIds;
    }

    this.logger.info(
      { jobFilters, evaluatorIds: evaluationData.evaluatorIds },
      'Triggering batch evaluation via API'
    );

    const url = this.buildUrl('evaluation-job-configs');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          name: evaluationData.name || `Batch Evaluation ${new Date().toISOString()}`,
          evaluatorIds: evaluationData.evaluatorIds,
          jobFilters,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to trigger batch evaluation: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to trigger batch evaluation via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: { id: string } };
      this.logger.info(
        { evaluationJobConfigId: result.data.id },
        'Successfully triggered batch evaluation via API'
      );
      return {
        message: 'Batch evaluation triggered successfully',
        evaluationJobConfigId: result.data.id,
        evaluatorIds: evaluationData.evaluatorIds,
      };
    } catch (error) {
      this.logger.error(
        {
          error,
        },
        'Failed to trigger batch evaluation'
      );
      throw error;
    }
  }

  // ============================================================================
  // DATASET RUN CONFIGS & RUNS
  // ============================================================================

  async createDatasetRunConfig(data: {
    name: string;
    description?: string;
    datasetId: string;
    agentIds?: string[];
    evaluatorIds?: string[];
  }): Promise<unknown> {
    this.logger.info({ datasetId: data.datasetId }, 'Creating dataset run config via API');

    const url = this.buildUrl('dataset-run-configs');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to create dataset run config: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to create dataset run config via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      this.logger.info('Successfully created dataset run config via API');
      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Failed to create dataset run config');
      throw error;
    }
  }

  async listDatasetRuns(datasetId: string): Promise<unknown[]> {
    this.logger.info({ datasetId }, 'Listing dataset runs via API');

    const url = this.buildUrl('dataset-runs', 'by-dataset', datasetId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to list dataset runs: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to list dataset runs via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown[] };
      return result.data;
    } catch (error) {
      this.logger.error({ error, datasetId }, 'Failed to list dataset runs');
      throw error;
    }
  }

  async getDatasetRun(runId: string): Promise<unknown | null> {
    this.logger.info({ runId }, 'Getting dataset run via API');

    const url = this.buildUrl('dataset-runs', runId);

    try {
      const response = await apiFetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info({ runId }, 'Dataset run not found');
          return null;
        }

        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to get dataset run: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to get dataset run via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as { data: unknown };
      return result.data;
    } catch (error) {
      this.logger.error({ error, runId }, 'Failed to get dataset run');
      throw error;
    }
  }

  async triggerDatasetRun(
    runConfigId: string,
    body?: { evaluatorIds?: string[]; branchName?: string }
  ): Promise<{
    datasetRunId: string;
    status: 'pending';
    totalItems: number;
  }> {
    this.logger.info(
      { runConfigId, evaluatorIds: body?.evaluatorIds, branchName: body?.branchName },
      'Triggering dataset run via API'
    );

    const url = this.buildUrl('dataset-run-configs', runConfigId, 'run');

    try {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body ?? {}),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage =
          parseError(errorText) ??
          `Failed to trigger dataset run: ${response.status} ${response.statusText}`;

        this.logger.error(
          { status: response.status, error: errorMessage },
          'Failed to trigger dataset run via API'
        );
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as {
        datasetRunId: string;
        status: 'pending';
        totalItems: number;
      };
      this.logger.info(
        { runConfigId, datasetRunId: result.datasetRunId },
        'Successfully triggered dataset run via API'
      );
      return result;
    } catch (error) {
      this.logger.error({ error, runConfigId }, 'Failed to trigger dataset run');
      throw error;
    }
  }
}

/**
 * Helper function to create an EvaluationClient instance
 */
export function evaluationClient(config: EvaluationClientConfig): EvaluationClient {
  return new EvaluationClient(config);
}
