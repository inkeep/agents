const MIN_PASSWORD_LENGTH = 15;

interface PasswordRequirement {
  rule: string;
  label: string;
  test: (password: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    rule: 'minLength',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (p) => p.length >= MIN_PASSWORD_LENGTH,
  },
  { rule: 'lowercase', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { rule: 'uppercase', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { rule: 'digit', label: 'One number', test: (p) => /\d/.test(p) },
  {
    rule: 'special',
    label: 'One special character',
    test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p),
  },
];

interface PasswordPolicyContext {
  userName?: string;
  userEmail?: string;
}

interface PolicyViolation {
  rule: string;
  message: string;
}

export { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS };
export type { PasswordPolicyContext, PasswordRequirement, PolicyViolation };
