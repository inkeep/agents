import { z } from 'zod';
import { type JwtVerifyResult, signJwt, verifyJwt } from './jwt-helpers';
import { getLogger } from './logger';

const logger = getLogger('slack-link-token');

const ISSUER = 'inkeep-auth';
const AUDIENCE = 'slack-link';
const TOKEN_USE = 'slackLinkCode';
const TOKEN_TTL = '10m';

export const SlackLinkIntentSchema = z.object({
  entryPoint: z.enum(['mention', 'question_command', 'run_command']),
  question: z.string().min(1).max(2000),
  channelId: z.string().min(1),
  threadTs: z.string().optional(),
  messageTs: z.string().optional(),
  agentIdentifier: z.string().optional(),
  agentId: z.string().optional(),
  projectId: z.string().optional(),
  responseUrl: z.string().optional(),
});

export type SlackLinkIntent = z.infer<typeof SlackLinkIntentSchema>;

export const SlackLinkTokenPayloadSchema = z.object({
  iss: z.literal(ISSUER),
  aud: z.literal(AUDIENCE),
  sub: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().optional(),

  tokenUse: z.literal(TOKEN_USE),

  tenantId: z.string().min(1),

  slack: z.object({
    teamId: z.string().min(1),
    userId: z.string().min(1),
    enterpriseId: z.string().min(1).optional(),
    username: z.string().optional(),
  }),

  intent: SlackLinkIntentSchema.optional(),
});

export type SlackLinkTokenPayload = z.infer<typeof SlackLinkTokenPayloadSchema>;

/**
 * Parameters for generating a Slack link token
 */
export interface SignSlackLinkTokenParams {
  tenantId: string;
  slackTeamId: string;
  slackUserId: string;
  slackEnterpriseId?: string;
  slackUsername?: string;
  intent?: SlackLinkIntent;
}

/**
 * Result of verifying a Slack link token
 */
export type VerifySlackLinkTokenResult = JwtVerifyResult<SlackLinkTokenPayload>;

/**
 * Sign a Slack link JWT token for the device authorization flow.
 * Token expires in 10 minutes.
 *
 * This token is generated when a user runs `/inkeep link` in Slack
 * and is verified when they visit the dashboard link page.
 */
export async function signSlackLinkToken(params: SignSlackLinkTokenParams): Promise<string> {
  try {
    const subjectId = `slack:${params.slackTeamId}:${params.slackUserId}`;

    const token = await signJwt({
      issuer: ISSUER,
      subject: subjectId,
      audience: AUDIENCE,
      expiresIn: TOKEN_TTL,
      claims: {
        tokenUse: TOKEN_USE,
        tenantId: params.tenantId,
        slack: {
          teamId: params.slackTeamId,
          userId: params.slackUserId,
          ...(params.slackEnterpriseId && { enterpriseId: params.slackEnterpriseId }),
          ...(params.slackUsername && { username: params.slackUsername }),
        },
        ...(params.intent && { intent: params.intent }),
      },
    });

    logger.debug(
      {
        tenantId: params.tenantId,
        slackTeamId: params.slackTeamId,
        slackUserId: params.slackUserId,
      },
      'Generated Slack link token'
    );

    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error, errorMessage }, 'Failed to generate Slack link token');
    throw new Error(`Failed to generate Slack link token: ${errorMessage}`);
  }
}

/**
 * Verify and decode a Slack link JWT token.
 * Validates signature, expiration, issuer, audience, and schema.
 */
export async function verifySlackLinkToken(token: string): Promise<VerifySlackLinkTokenResult> {
  const result = await verifyJwt(token, { issuer: ISSUER, audience: AUDIENCE });

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Slack link token verification failed');
    return {
      valid: false,
      error: result.error,
    };
  }

  const parseResult = SlackLinkTokenPayloadSchema.safeParse(result.payload);

  if (!parseResult.success) {
    logger.warn(
      { payload: result.payload, issues: parseResult.error.issues },
      'Invalid Slack link token: schema validation failed'
    );
    return {
      valid: false,
      error: `Invalid token schema: ${parseResult.error.issues.map((e) => e.message).join(', ')}`,
    };
  }

  logger.debug(
    {
      tenantId: parseResult.data.tenantId,
      slackTeamId: parseResult.data.slack.teamId,
      slackUserId: parseResult.data.slack.userId,
    },
    'Successfully verified Slack link token'
  );

  return {
    valid: true,
    payload: parseResult.data,
  };
}
