import { randomInt } from 'node:crypto';
import { APIError } from 'better-auth/api';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS,
  type PasswordPolicyContext,
  type PasswordRequirement,
  type PolicyViolation,
} from './password-policy-rules';

export function validatePasswordPolicy(
  password: string,
  context?: PasswordPolicyContext
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const req of PASSWORD_REQUIREMENTS) {
    if (!req.test(password)) {
      violations.push({ rule: req.rule, message: req.label });
    }
  }

  const lower = password.toLowerCase();

  if (context?.userEmail) {
    const localPart = context.userEmail.split('@')[0]?.toLowerCase();
    if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
      violations.push({
        rule: 'email',
        message: 'Password must not contain your email address',
      });
    }
  }

  if (context?.userName) {
    const name = context.userName.toLowerCase();
    if (name.length >= 3 && lower.includes(name)) {
      violations.push({
        rule: 'name',
        message: 'Password must not contain your name',
      });
    }
  }

  if (lower.includes('inkeep')) {
    violations.push({
      rule: 'company',
      message: 'Password must not contain the company name',
    });
  }

  return violations;
}

export function enforcePasswordPolicy(password: string, context?: PasswordPolicyContext): void {
  const violations = validatePasswordPolicy(password, context);
  if (violations.length > 0) {
    throw new APIError('BAD_REQUEST', {
      message: violations.map((v) => v.message).join('; '),
    });
  }
}

const PASSWORD_POLICY_PATHS = new Set(['/sign-up/email', '/reset-password', '/change-password']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value : undefined;
}

export async function checkPasswordPolicy(ctx: { path: string; body: unknown }): Promise<void> {
  if (!PASSWORD_POLICY_PATHS.has(ctx.path)) return;
  if (!isPlainObject(ctx.body)) return;

  const pw = readString(ctx.body, 'newPassword') ?? readString(ctx.body, 'password');
  if (!pw) return;

  enforcePasswordPolicy(pw, {
    userEmail: readString(ctx.body, 'email'),
    userName: readString(ctx.body, 'name'),
  });
}

/** @deprecated Renamed to `checkPasswordPolicy`. Will be removed in a future major version. */
export const passwordPolicyHook = checkPasswordPolicy;

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
// Generator alphabet excludes `$`, `{`, `}`, `=` so generated passwords round-trip through .env
// without triggering dotenv `$VAR` / `${VAR}` expansion or producing `KEY==value` lines.
// User-chosen passwords may still use any of these.
const SPECIALS = '!@#%^&*()_+-[];:,.<>/?~';
const ALL_CHARS = LOWERCASE + UPPERCASE + DIGITS + SPECIALS;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

export function generateCompliantPassword(length: number = MIN_PASSWORD_LENGTH + 4): string {
  if (length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password length must be at least ${MIN_PASSWORD_LENGTH}`);
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const chars = [pick(LOWERCASE), pick(UPPERCASE), pick(DIGITS), pick(SPECIALS)];
    while (chars.length < length) {
      chars.push(pick(ALL_CHARS));
    }
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const password = chars.join('');
    if (validatePasswordPolicy(password).length === 0) {
      return password;
    }
  }

  throw new Error('Failed to generate a policy-compliant password');
}

export { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS };
export type { PasswordPolicyContext, PasswordRequirement, PolicyViolation };
