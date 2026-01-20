import { Hono } from 'hono';
import { env } from '../env';
import { getLogger } from '../logger';
import type { BaseAppVariables } from '../types/app';

const logger = getLogger('nango-config');

const app = new Hono<{ Variables: BaseAppVariables }>();

// GET /health - Check Nango configuration
app.get('/health', async (c) => {
  const nangoSecretKey = env.NANGO_SECRET_KEY;

  logger.info(
    {
      hasSecretKey: !!nangoSecretKey,
    },
    'Checking Nango configuration'
  );

  // Check if secret key is set
  if (!nangoSecretKey) {
    logger.warn({}, 'Nango secret key not set');
    return c.json({
      status: 'not_configured',
      configured: false,
      error: 'NANGO_SECRET_KEY not set',
    });
  }

  // Validate the key format - Nango secret keys typically start with "sk-"
  if (!nangoSecretKey.startsWith('sk-')) {
    logger.warn({}, 'Nango secret key has invalid format');
    return c.json({
      status: 'invalid_format',
      configured: false,
      error: 'NANGO_SECRET_KEY has invalid format (should start with "sk-")',
    });
  }

  logger.info({}, 'Nango configuration check successful');

  return c.json({
    status: 'ok',
    configured: true,
  });
});

export default app;
