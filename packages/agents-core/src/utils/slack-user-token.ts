import { z } from 'zod';
import { type JwtVerifyResult, signJwt, verifyJwt } from './jwt-helpers';
import { getLogger } from './logger';

const logger = getLogger('slack-user-token');

const ISSUER = 'inkeep-auth';
const AUDIENCE = 'inkeep-api';
const TOKEN_USE = 'slackUser';
const ACTOR_SUB = 'inkeep-work-app-slack';
const TOKEN_TTL = '5m';

/**
 * Zod schema for validating Slack user access token JWT payload.
 * This is the canonical schema from the work_apps_slack spec.
 */
export const SlackAccessTokenPayloadSchema = z.object({
  iss: z.literal(ISSUER),
  aud: z.literal(AUDIENCE),
  sub: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().optional(),

  tokenUse: z.literal(TOKEN_USE),

  act: z.object({
    sub: z.literal(ACTOR_SUB),
  }),

  tenantId: z.string().min(1),

  slack: z.object({
    teamId: z.string().min(1),
    userId: z.string().min(1),
    enterpriseId: z.string().min(1).optional(),
    email: z.string().email().optional(),
  }),
});

export type SlackAccessTokenPayload = z.infer<typeof SlackAccessTokenPayloadSchema>;

/**
 * Parameters for generating a Slack user token
 */
export interface SignSlackUserTokenParams {
  inkeepUserId: string;
  tenantId: string;
  slackTeamId: string;
  slackUserId: string;
  slackEnterpriseId?: string;
  slackEmail?: string;
}

/**
 * Result of verifying a Slack user token
 */
export type VerifySlackUserTokenResult = JwtVerifyResult<SlackAccessTokenPayload>;

/**
 * Sign a Slack user JWT token for calling Manage/Run APIs.
 * Token expires in 5 minutes.
 *
 * This token is used when Slack runtime logic needs to call:
 * - Manage API (list projects, list agents)
 * - Run API (POST /run/api/chat)
 */
export async function signSlackUserToken(params: SignSlackUserTokenParams): Promise<string> {
  try {
    const token = await signJwt({
      issuer: ISSUER,
      subject: params.inkeepUserId,
      audience: AUDIENCE,
      expiresIn: TOKEN_TTL,
      claims: {
        tokenUse: TOKEN_USE,
        act: {
          sub: ACTOR_SUB,
        },
        tenantId: params.tenantId,
        slack: {
          teamId: params.slackTeamId,
          userId: params.slackUserId,
          ...(params.slackEnterpriseId && { enterpriseId: params.slackEnterpriseId }),
          ...(params.slackEmail && { email: params.slackEmail }),
        },
      },
    });

    logger.debug(
      {
        inkeepUserId: params.inkeepUserId,
        tenantId: params.tenantId,
        slackTeamId: params.slackTeamId,
        slackUserId: params.slackUserId,
      },
      'Generated Slack user token'
    );

    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error, errorMessage }, 'Failed to generate Slack user token');
    throw new Error(`Failed to generate Slack user token: ${errorMessage}`);
  }
}

/**
 * Verify and decode a Slack user JWT token.
 * Validates signature, expiration, issuer, audience, and schema.
 */
export async function verifySlackUserToken(token: string): Promise<VerifySlackUserTokenResult> {
  const result = await verifyJwt(token, { issuer: ISSUER, audience: AUDIENCE });

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'Slack user token verification failed');
    return {
      valid: false,
      error: result.error,
    };
  }

  const parseResult = SlackAccessTokenPayloadSchema.safeParse(result.payload);

  if (!parseResult.success) {
    logger.warn(
      { payload: result.payload, issues: parseResult.error.issues },
      'Invalid Slack user token: schema validation failed'
    );
    return {
      valid: false,
      error: `Invalid token schema: ${parseResult.error.issues.map((e) => e.message).join(', ')}`,
    };
  }

  logger.debug(
    {
      inkeepUserId: parseResult.data.sub,
      tenantId: parseResult.data.tenantId,
      slackTeamId: parseResult.data.slack.teamId,
    },
    'Successfully verified Slack user token'
  );

  return {
    valid: true,
    payload: parseResult.data,
  };
}

/**
 * Check if a token looks like a Slack user JWT (quick check before full verification).
 * Returns true if the token has the expected issuer and tokenUse.
 */
export function isSlackUserToken(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload?.iss === ISSUER && payload?.tokenUse === TOKEN_USE;
  } catch {
    return false;
  }
}
