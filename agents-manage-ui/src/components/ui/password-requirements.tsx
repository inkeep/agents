'use client';

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS,
} from '@inkeep/agents-core/auth/password-policy-rules';

interface PasswordRequirementsProps {
  password: string;
}

export function PasswordRequirements({ password }: PasswordRequirementsProps) {
  if (!password) return null;

  const results = PASSWORD_REQUIREMENTS.map((req) => ({
    ...req,
    met: req.test(password),
  }));

  return (
    <ul className="mt-2 space-y-1 text-xs">
      {results.map((req) => (
        <li
          key={req.rule}
          className={req.met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}
        >
          {req.met ? '\u2713' : '\u2022'} {req.label}
        </li>
      ))}
    </ul>
  );
}

export { MIN_PASSWORD_LENGTH };
