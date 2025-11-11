import { apiFetch, getLogger } from '@inkeep/agents-core';

const logger = getLogger('evaluationClient');

export interface TestSuiteConfig {
  tenantId: string;
  id: string;
  name: string;
  description: string;
  modelConfig?: Record<string, unknown> | null;
  runFrequency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestSuiteConfigParams {
  id?: string;
  name: string;
  description?: string;
  modelConfig?: Record<string, unknown>;
  runFrequency: string;
}

export interface UpdateTestSuiteConfigParams {
  name?: string;
  description?: string;
  modelConfig?: Record<string, unknown>;
  runFrequency?: string;
}

/**
 * Create a test suite config via HTTP API
 */
export async function createTestSuiteConfigViaAPI(
  tenantId: string,
  apiUrl: string,
  configData: CreateTestSuiteConfigParams,
  apiKey?: string
): Promise<TestSuiteConfig> {
  logger.info(
    {
      tenantId,
      configName: configData.name,
      apiUrl,
    },
    'Creating test suite config via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/eval-test-suite-configs`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await apiFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(configData),
    });
  } catch (fetchError) {
    logger.error(
      {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        url,
        tenantId,
      },
      'Fetch request failed'
    );
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to create test suite config: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to create test suite config via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: TestSuiteConfig };

  logger.info(
    {
      configId: result.data.id,
    },
    'Successfully created test suite config via API'
  );

  return result.data;
}

/**
 * Get a test suite config via HTTP API
 */
export async function getTestSuiteConfigViaAPI(
  tenantId: string,
  configId: string,
  apiUrl: string,
  apiKey?: string
): Promise<TestSuiteConfig> {
  logger.info(
    {
      tenantId,
      configId,
      apiUrl,
    },
    'Getting test suite config via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/eval-test-suite-configs/${configId}`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await apiFetch(url, {
      method: 'GET',
      headers,
    });
  } catch (fetchError) {
    logger.error(
      {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        url,
        tenantId,
        configId,
      },
      'Fetch request failed'
    );
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to get test suite config: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to get test suite config via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: TestSuiteConfig };

  logger.info(
    {
      configId: result.data.id,
    },
    'Successfully retrieved test suite config via API'
  );

  return result.data;
}

/**
 * List all test suite configs via HTTP API
 */
export async function listTestSuiteConfigsViaAPI(
  tenantId: string,
  apiUrl: string,
  apiKey?: string
): Promise<TestSuiteConfig[]> {
  logger.info(
    {
      tenantId,
      apiUrl,
    },
    'Listing test suite configs via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/eval-test-suite-configs`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await apiFetch(url, {
      method: 'GET',
      headers,
    });
  } catch (fetchError) {
    logger.error(
      {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        url,
        tenantId,
      },
      'Fetch request failed'
    );
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to list test suite configs: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to list test suite configs via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: TestSuiteConfig[] };

  logger.info(
    {
      count: result.data.length,
    },
    'Successfully listed test suite configs via API'
  );

  return result.data;
}

/**
 * Update a test suite config via HTTP API
 */
export async function updateTestSuiteConfigViaAPI(
  tenantId: string,
  configId: string,
  apiUrl: string,
  configData: UpdateTestSuiteConfigParams,
  apiKey?: string
): Promise<TestSuiteConfig> {
  logger.info(
    {
      tenantId,
      configId,
      apiUrl,
    },
    'Updating test suite config via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/eval-test-suite-configs/${configId}`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await apiFetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(configData),
    });
  } catch (fetchError) {
    logger.error(
      {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        url,
        tenantId,
        configId,
      },
      'Fetch request failed'
    );
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to update test suite config: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to update test suite config via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: TestSuiteConfig };

  logger.info(
    {
      configId: result.data.id,
    },
    'Successfully updated test suite config via API'
  );

  return result.data;
}

/**
 * Delete a test suite config via HTTP API
 */
export async function deleteTestSuiteConfigViaAPI(
  tenantId: string,
  configId: string,
  apiUrl: string,
  apiKey?: string
): Promise<TestSuiteConfig> {
  logger.info(
    {
      tenantId,
      configId,
      apiUrl,
    },
    'Deleting test suite config via API'
  );

  const url = `${apiUrl}/tenants/${tenantId}/eval-test-suite-configs/${configId}`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await apiFetch(url, {
      method: 'DELETE',
      headers,
    });
  } catch (fetchError) {
    logger.error(
      {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
        url,
        tenantId,
        configId,
      },
      'Fetch request failed'
    );
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to delete test suite config: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to delete test suite config via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: TestSuiteConfig };

  logger.info(
    {
      configId: result.data.id,
    },
    'Successfully deleted test suite config via API'
  );

  return result.data;
}

/**
 * Run dataset evaluation via API
 */
export async function runDatasetEvalViaAPI(
  tenantId: string,
  apiUrl: string,
  params: {
    testSuiteConfigId: string;
    datasetId: string;
    agentId: string;
    evaluatorIds: string[];
  },
  apiKey?: string
): Promise<Array<{
  id: string;
  suiteRunId: string | null;
  datasetItemId: string | null;
  conversationId: string;
  status: 'pending' | 'done' | 'failed';
  evaluatorId: string;
  reasoning: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}>> {
  logger.info(
    {
      tenantId,
      testSuiteConfigId: params.testSuiteConfigId,
      datasetId: params.datasetId,
      agentId: params.agentId,
      evaluatorCount: params.evaluatorIds.length,
    },
    'Running dataset evaluation via API'
  );

  const url = `${apiUrl}/${tenantId}/evaluations/datasets/run`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to run dataset evaluation: ${response.status} ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      if (errorText) {
        errorMessage = errorText;
      }
    }

    logger.error(
      {
        status: response.status,
        error: errorMessage,
      },
      'Failed to run dataset evaluation via API'
    );

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { data: Array<{
    id: string;
    suiteRunId: string | null;
    datasetItemId: string | null;
    conversationId: string;
    status: 'pending' | 'done' | 'failed';
    evaluatorId: string;
    reasoning: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
  }> };

  logger.info(
    {
      resultCount: result.data.length,
    },
    'Successfully ran dataset evaluation via API'
  );

  return result.data;
}

