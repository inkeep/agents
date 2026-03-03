import { createApiError, getUserProfile, upsertUserProfile } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { z } from 'zod';
import runDbClient from '../../../data/db/runDbClient';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { ManageAppVariables } from '../../../types/app';

const userProfileRoutes = new Hono<{ Variables: ManageAppVariables }>();

userProfileRoutes.use('*', sessionAuth());

const timezoneSchema = z
  .string()
  .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), {
    message: 'Invalid IANA timezone',
  })
  .nullable()
  .optional();

const putBodySchema = z.object({
  timezone: timezoneSchema,
  attributes: z.record(z.string(), z.unknown()).optional(),
});

userProfileRoutes.get('/:userId/profile', async (c) => {
  const userId = c.req.param('userId');
  const authenticatedUserId = c.get('userId') as string;

  if (userId !== authenticatedUserId) {
    throw createApiError({
      code: 'forbidden',
      message: "Cannot access another user's profile",
    });
  }

  const profile = await getUserProfile(runDbClient)(userId);

  if (!profile) {
    return c.json({ userId, timezone: null, attributes: {} });
  }

  return c.json({
    userId: profile.userId,
    timezone: profile.timezone,
    attributes: profile.attributes,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
});

userProfileRoutes.put('/:userId/profile', async (c) => {
  const userId = c.req.param('userId');
  const authenticatedUserId = c.get('userId') as string;

  if (userId !== authenticatedUserId) {
    throw createApiError({
      code: 'forbidden',
      message: "Cannot update another user's profile",
    });
  }

  const body = await c.req.json();
  const parsed = putBodySchema.safeParse(body);

  if (!parsed.success) {
    throw createApiError({
      code: 'bad_request',
      message: parsed.error.issues[0]?.message ?? 'Invalid request body',
    });
  }

  const updated = await upsertUserProfile(runDbClient)(userId, {
    timezone: parsed.data.timezone,
    attributes: parsed.data.attributes,
  });

  return c.json({
    userId: updated.userId,
    timezone: updated.timezone,
    attributes: updated.attributes,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

export default userProfileRoutes;
