import type {
  EvaluationJobConfigEvaluatorRelationSelect,
  EvaluationJobConfigSelect,
  EvaluationRunConfigWithSuiteConfigs,
  EvaluationSuiteConfigEvaluatorRelationSelect,
  EvaluationSuiteConfigSelect,
  EvaluatorSelect,
  FullAgentDefinition,
  FullProjectSelectWithRelationIds,
  FunctionToolApiSelect,
  McpTool,
} from '../types/entities';
import { getLogger } from '../utils/logger';
import type { ResolvedRef } from '../validation/dolt-schemas';
import { BaseApiClient, BaseApiClientConfig, BaseApiError } from './base-client';

const logger = getLogger('manage-api-client');

export class ManageApiError extends BaseApiError {
  constructor(message: string, statusCode: number, responseBody: string) {
    super(message, statusCode, responseBody);
    this.name = 'ManageApiError';
  }
}

export class ManagementApiClient extends BaseApiClient {
  constructor(config: BaseApiClientConfig) {
    super(config);
  }

  /**
   * Override to return ManageApiError
   */
  protected override createError(
    message: string,
    statusCode: number,
    responseBody: string
  ): ManageApiError {
    return new ManageApiError(message, statusCode, responseBody);
  }

  /**
   * Override to extract data from { data: ... } wrapper
   */
  protected override async extractResponseData<T>(response: Response): Promise<T> {
    const json = await response.json();
    return json.data as T;
  }

  async getFullProject(): Promise<FullProjectSelectWithRelationIds> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/project-full/${this.projectId}/with-relation-ids`;
    return this.makeGetRequest<FullProjectSelectWithRelationIds>(
      path,
      'Failed to fetch project config'
    );
  }

  async getResolvedRef(): Promise<ResolvedRef> {
    const tenantId = this.checkTenantId();
    logger.info({ tenantId, projectId: this.projectId }, 'Resolving ref');
    const path = `/tenants/${tenantId}/projects/${this.projectId}/refs/resolve`;
    return this.makeGetRequest<ResolvedRef>(path, 'Failed to resolve ref');
  }

  async getFullAgent(agentId: string): Promise<FullAgentDefinition | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/agent-full/${agentId}`;

    try {
      return await this.makeGetRequest<FullAgentDefinition>(path, 'Failed to fetch full agent');
    } catch (error) {
      if (error instanceof ManageApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getMcpTool(toolId: string): Promise<McpTool> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/tools/${toolId}`;
    return this.makeGetRequest<McpTool>(path, 'Failed to fetch MCP tool');
  }

  async getFunctionToolsForSubAgent(
    agentId: string,
    subAgentId: string
  ): Promise<FunctionToolApiSelect[]> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/agents/${agentId}/sub-agent-function-tools/sub-agent/${subAgentId}`;
    return this.makePaginatedGetRequest<FunctionToolApiSelect>(
      path,
      'Failed to fetch function tools for sub-agent'
    );
  }

  async getEvaluationJobConfigById(
    evaluationJobConfigId: string
  ): Promise<EvaluationJobConfigSelect | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-job-configs/${evaluationJobConfigId}`;

    try {
      return await this.makeGetRequest<EvaluationJobConfigSelect>(
        path,
        'Failed to fetch evaluation job config'
      );
    } catch (error) {
      if (error instanceof ManageApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getEvaluationJobConfigEvaluatorRelations(
    evaluationJobConfigId: string
  ): Promise<EvaluationJobConfigEvaluatorRelationSelect[]> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-job-configs/${evaluationJobConfigId}/evaluator-relations`;
    return this.makePaginatedGetRequest<EvaluationJobConfigEvaluatorRelationSelect>(
      path,
      'Failed to fetch evaluation job config evaluator relations'
    );
  }

  async getEvaluatorById(evaluatorId: string): Promise<EvaluatorSelect | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluators/${evaluatorId}`;

    try {
      return await this.makeGetRequest<EvaluatorSelect>(path, 'Failed to fetch evaluator');
    } catch (error) {
      if (error instanceof ManageApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  async getEvaluatorsByIds(evaluatorIds: string[]): Promise<EvaluatorSelect[]> {
    if (evaluatorIds.length === 0) {
      return [];
    }
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluators/batch`;
    return this.makePostRequest<EvaluatorSelect[]>(
      path,
      { evaluatorIds },
      'Failed to fetch evaluators batch'
    );
  }

  async listEvaluationRunConfigs(): Promise<EvaluationRunConfigWithSuiteConfigs[]> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-run-configs`;
    return this.makePaginatedGetRequest<EvaluationRunConfigWithSuiteConfigs>(
      path,
      'Failed to list evaluation run configs'
    );
  }

  async getEvaluationRunConfigById(
    evaluationRunConfigId: string
  ): Promise<EvaluationRunConfigWithSuiteConfigs | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-run-configs/${evaluationRunConfigId}`;
    return this.makeGetRequest<EvaluationRunConfigWithSuiteConfigs>(
      path,
      'Failed to fetch evaluation run config'
    );
  }

  async getEvaluationSuiteConfigById(
    evaluationSuiteConfigId: string
  ): Promise<EvaluationSuiteConfigSelect | null> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-suite-configs/${evaluationSuiteConfigId}`;
    return this.makeGetRequest<EvaluationSuiteConfigSelect>(
      path,
      'Failed to fetch evaluation suite config'
    );
  }

  async getEvaluationSuiteConfigEvaluatorRelations(
    evaluationSuiteConfigId: string
  ): Promise<EvaluationSuiteConfigEvaluatorRelationSelect[]> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluation-suite-configs/${evaluationSuiteConfigId}/evaluator-relations`;
    return this.makePaginatedGetRequest<EvaluationSuiteConfigEvaluatorRelationSelect>(
      path,
      'Failed to fetch evaluation suite config evaluator relations'
    );
  }
}
