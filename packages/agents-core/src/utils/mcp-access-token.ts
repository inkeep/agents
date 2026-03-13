import { z } from 'zod';
import { type JwtVerifyResult, signJwt, verifyJwt } from './jwt-helpers';
import { getLogger } from './logger';

const logger = getLogger('mcp-access-token');

const ISSUER = 'inkeep-auth';
const AUDIENCE = 'inkeep-mcp';
const TOKEN_USE = 'mcpAccess';
const ACTOR_SUB = 'inkeep-agents-api';
const TOKEN_TTL = '5m';

export const McpAccessTokenPayloadSchema = z.object({
  iss: z.literal(ISSUER),
  aud: z.literal(AUDIENCE),
  sub: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
  tokenUse: z.literal(TOKEN_USE),
  act: z.object({
    sub: z.literal(ACTOR_SUB),
  }),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
});

export type McpAccessTokenPayload = z.infer<typeof McpAccessTokenPayloadSchema>;

export interface SignMcpAccessTokenParams {
  tenantId: string;
  projectId: string;
}

export type McpAccessTokenVerifyResult = JwtVerifyResult<McpAccessTokenPayload>;

export async function signMcpAccessToken(params: SignMcpAccessTokenParams): Promise<string> {
  try {
    const token = await signJwt({
      issuer: ISSUER,
      subject: params.tenantId,
      audience: AUDIENCE,
      expiresIn: TOKEN_TTL,
      claims: {
        tokenUse: TOKEN_USE,
        act: {
          sub: ACTOR_SUB,
        },
        tenantId: params.tenantId,
        projectId: params.projectId,
      },
    });

    logger.debug(
      { tenantId: params.tenantId, projectId: params.projectId },
      'Generated MCP access token'
    );

    return token;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error, errorMessage }, 'Failed to generate MCP access token');
    throw new Error(`Failed to generate MCP access token: ${errorMessage}`);
  }
}

export async function verifyMcpAccessToken(token: string): Promise<McpAccessTokenVerifyResult> {
  const result = await verifyJwt(token, { issuer: ISSUER, audience: AUDIENCE });

  if (!result.valid || !result.payload) {
    logger.warn({ error: result.error }, 'MCP access token verification failed');
    return {
      valid: false,
      error: result.error,
    };
  }

  const parseResult = McpAccessTokenPayloadSchema.safeParse(result.payload);

  if (!parseResult.success) {
    logger.warn(
      { payload: result.payload, issues: parseResult.error.issues },
      'Invalid MCP access token: schema validation failed'
    );
    return {
      valid: false,
      error: `Invalid token schema: ${parseResult.error.issues.map((e) => e.message).join(', ')}`,
    };
  }

  logger.debug(
    { tenantId: parseResult.data.tenantId, projectId: parseResult.data.projectId },
    'Successfully verified MCP access token'
  );

  return {
    valid: true,
    payload: parseResult.data,
  };
}
