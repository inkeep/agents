import { describe, expect, it } from 'vitest';
import {
  DeploymentCheckRerequestedWebhookSchema,
  DeploymentCreatedWebhookSchema,
  DeploymentReadyWebhookSchema,
  VercelDeploymentSchema,
  VercelWebhookEventSchema,
} from '../../domains/manage/routes/vercelChecks/schemas';

describe('VercelDeploymentSchema', () => {
  it('validates a complete deployment object', () => {
    const deployment = {
      id: 'dpl_abc123',
      name: 'my-project',
      url: 'my-project-abc123.vercel.app',
      inspectorUrl: 'https://vercel.com/team/my-project/abc123',
      meta: { githubCommitRef: 'main', githubCommitSha: 'abc123' },
      target: 'production' as const,
      projectId: 'prj_xyz789',
    };

    const result = VercelDeploymentSchema.safeParse(deployment);
    expect(result.success).toBe(true);
  });

  it('validates a minimal deployment object', () => {
    const deployment = {
      id: 'dpl_abc123',
      name: 'my-project',
      url: 'my-project-abc123.vercel.app',
      target: null,
    };

    const result = VercelDeploymentSchema.safeParse(deployment);
    expect(result.success).toBe(true);
  });

  it('rejects deployment with missing required fields', () => {
    const deployment = {
      id: 'dpl_abc123',
      name: 'my-project',
    };

    const result = VercelDeploymentSchema.safeParse(deployment);
    expect(result.success).toBe(false);
  });
});

describe('DeploymentCreatedWebhookSchema', () => {
  it('validates a valid deployment.created webhook', () => {
    const webhook = {
      id: 'evt_abc123',
      type: 'deployment.created',
      createdAt: 1700000000000,
      region: 'iad1',
      teamId: 'team_xyz',
      userId: 'user_123',
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: 'preview' as const,
        },
        links: {
          deployment: 'https://vercel.com/team/my-project/abc123',
          project: 'https://vercel.com/team/my-project',
        },
        plan: 'pro',
        project: {
          id: 'prj_xyz789',
        },
      },
    };

    const result = DeploymentCreatedWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(true);
  });

  it('validates minimal deployment.created webhook', () => {
    const webhook = {
      id: 'evt_abc123',
      type: 'deployment.created',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
        },
      },
    };

    const result = DeploymentCreatedWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(true);
  });

  it('rejects webhook with wrong type', () => {
    const webhook = {
      id: 'evt_abc123',
      type: 'deployment.ready',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
        },
      },
    };

    const result = DeploymentCreatedWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(false);
  });
});

describe('DeploymentReadyWebhookSchema', () => {
  it('validates a valid deployment.ready webhook', () => {
    const webhook = {
      id: 'evt_def456',
      type: 'deployment.ready',
      createdAt: 1700000000000,
      teamId: null,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: 'production' as const,
          readyState: 'READY' as const,
        },
        plan: 'enterprise',
      },
    };

    const result = DeploymentReadyWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(true);
  });

  it('validates deployment.ready webhook with ERROR readyState', () => {
    const webhook = {
      id: 'evt_def456',
      type: 'deployment.ready',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
          readyState: 'ERROR' as const,
        },
      },
    };

    const result = DeploymentReadyWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.deployment.readyState).toBe('ERROR');
    }
  });

  it('rejects invalid readyState value', () => {
    const webhook = {
      id: 'evt_def456',
      type: 'deployment.ready',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
          readyState: 'INVALID_STATE',
        },
      },
    };

    const result = DeploymentReadyWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(false);
  });
});

describe('DeploymentCheckRerequestedWebhookSchema', () => {
  it('validates a valid deployment.check-rerequested webhook', () => {
    const webhook = {
      id: 'evt_ghi789',
      type: 'deployment.check-rerequested',
      createdAt: 1700000000000,
      userId: 'user_123',
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: 'preview' as const,
        },
        check: {
          id: 'chk_xyz',
          name: 'Health Check',
        },
        project: {
          id: 'prj_xyz789',
        },
      },
    };

    const result = DeploymentCheckRerequestedWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(true);
  });

  it('validates webhook without optional check details', () => {
    const webhook = {
      id: 'evt_ghi789',
      type: 'deployment.check-rerequested',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
        },
      },
    };

    const result = DeploymentCheckRerequestedWebhookSchema.safeParse(webhook);
    expect(result.success).toBe(true);
  });
});

describe('VercelWebhookEventSchema', () => {
  it('discriminates deployment.created events', () => {
    const webhook = {
      id: 'evt_abc123',
      type: 'deployment.created',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
        },
      },
    };

    const result = VercelWebhookEventSchema.safeParse(webhook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('deployment.created');
    }
  });

  it('discriminates deployment.ready events', () => {
    const webhook = {
      id: 'evt_def456',
      type: 'deployment.ready',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
        },
      },
    };

    const result = VercelWebhookEventSchema.safeParse(webhook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('deployment.ready');
    }
  });

  it('discriminates deployment.check-rerequested events', () => {
    const webhook = {
      id: 'evt_ghi789',
      type: 'deployment.check-rerequested',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
        },
      },
    };

    const result = VercelWebhookEventSchema.safeParse(webhook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('deployment.check-rerequested');
    }
  });

  it('rejects unsupported event types', () => {
    const webhook = {
      id: 'evt_xyz',
      type: 'deployment.canceled',
      createdAt: 1700000000000,
      payload: {
        deployment: {
          id: 'dpl_abc123',
          name: 'my-project',
          url: 'my-project-abc123.vercel.app',
          target: null,
        },
      },
    };

    const result = VercelWebhookEventSchema.safeParse(webhook);
    expect(result.success).toBe(false);
  });

  it('rejects completely invalid payload', () => {
    const webhook = {
      foo: 'bar',
    };

    const result = VercelWebhookEventSchema.safeParse(webhook);
    expect(result.success).toBe(false);
  });
});
