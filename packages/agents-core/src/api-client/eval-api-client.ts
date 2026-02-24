import type {
  TriggerConversationEvaluationRequest,
  TriggerEvaluationJobRequest,
} from '../types/entities';
import { getLogger } from '../utils/logger';
import { BaseApiClient, type BaseApiClientConfig, BaseApiError } from './base-client';

const logger = getLogger('eval-api-client');

export class EvalApiError extends BaseApiError {
  constructor(message: string, statusCode: number, responseBody: string) {
    super(message, statusCode, responseBody);
    this.name = 'EvalApiError';
  }
}

// Request/Response types based on the trigger schemas
export interface TriggerConversationEvaluationResponse {
  success: boolean;
  message: string;
  evaluationsTriggered: number;
}

export interface TriggerBatchConversationEvaluationResponse {
  queued: number;
  failed: number;
}

export interface TriggerEvaluationJobResponse {
  queued: number;
  failed: number;
  evaluationRunId: string;
  conversationCount: number;
}

export class EvalApiClient extends BaseApiClient {
  // biome-ignore lint/complexity/noUselessConstructor: Required to expose protected parent constructor as public
  constructor(config: BaseApiClientConfig) {
    super(config);
  }
  /**
   * Override to return EvalApiError
   */
  protected override createError(
    message: string,
    statusCode: number,
    responseBody: string
  ): EvalApiError {
    return new EvalApiError(message, statusCode, responseBody);
  }

  /**
   * Trigger an evaluation job
   * Filters conversations based on job filters, creates an evaluation run, and enqueues workflows
   */
  async triggerEvaluationJob(
    request: TriggerEvaluationJobRequest
  ): Promise<TriggerEvaluationJobResponse> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluate-conversations-by-job`;

    logger.info(
      {
        tenantId,
        projectId: this.projectId,
        evaluationJobConfigId: request.evaluationJobConfigId,
        evaluatorCount: request.evaluatorIds.length,
      },
      'Triggering evaluation job workflow'
    );

    return this.makePostRequest<TriggerEvaluationJobResponse>(
      path,
      request,
      'Failed to trigger evaluation job workflow'
    );
  }

  async triggerConversationEvaluation(
    request: TriggerConversationEvaluationRequest
  ): Promise<TriggerConversationEvaluationResponse> {
    const tenantId = this.checkTenantId();
    const path = `/tenants/${tenantId}/projects/${this.projectId}/evaluate-conversation`;

    logger.info(
      { tenantId, projectId: this.projectId, conversationId: request.conversationId },
      'Triggering conversation evaluation workflow'
    );

    return this.makePostRequest<TriggerConversationEvaluationResponse>(
      path,
      request,
      'Failed to trigger conversation evaluation workflow'
    );
  }
}
