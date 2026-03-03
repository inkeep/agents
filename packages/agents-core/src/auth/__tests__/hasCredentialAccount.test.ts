import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { hasCredentialAccount } from '../auth';
import * as authSchema from '../auth-schema';

async function insertUser(id: string, email: string) {
  await testRunDbClient.insert(authSchema.user).values({
    id,
    name: email.split('@')[0],
    email,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertAccount(userId: string, providerId: string, accountId?: string) {
  await testRunDbClient.insert(authSchema.account).values({
    id: `${userId}_${providerId}`,
    accountId: accountId ?? userId,
    providerId,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('hasCredentialAccount', () => {
  it('should return true for user with credential account', async () => {
    await insertUser('user-cred', 'cred@test.com');
    await insertAccount('user-cred', 'credential');

    const result = await hasCredentialAccount(testRunDbClient, 'user-cred');
    expect(result).toBe(true);
  });

  it('should return false for user with only OAuth account', async () => {
    await insertUser('user-google', 'google@test.com');
    await insertAccount('user-google', 'google');

    const result = await hasCredentialAccount(testRunDbClient, 'user-google');
    expect(result).toBe(false);
  });

  it('should return true for user with both credential and OAuth accounts', async () => {
    await insertUser('user-both', 'both@test.com');
    await insertAccount('user-both', 'credential');
    await insertAccount('user-both', 'google');

    const result = await hasCredentialAccount(testRunDbClient, 'user-both');
    expect(result).toBe(true);
  });

  it('should return false for non-existent user', async () => {
    const result = await hasCredentialAccount(testRunDbClient, 'user-nonexistent');
    expect(result).toBe(false);
  });

  it('should return false for user with only auth0 account', async () => {
    await insertUser('user-sso', 'sso@test.com');
    await insertAccount('user-sso', 'auth0');

    const result = await hasCredentialAccount(testRunDbClient, 'user-sso');
    expect(result).toBe(false);
  });
});
